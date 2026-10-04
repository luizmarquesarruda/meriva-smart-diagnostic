import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle } from '../storage/driveCycleStorage';
import { forceSaveOnObdEvent } from '../meriva/autosaveIntegration';
import { updateAutoSaveState, initAutoSave } from '../meriva/autosaveManager';
import { RealTripRecorder } from './tripRecorder';

export interface AutoTripServiceState {
  connected: boolean;
  active: boolean;
  fuelSupported: boolean;
  fuelLevelSupported: boolean;
  distanceKm: number;
  fuelUsedL: number;
  consumptionKml: number | null;
  fuelLevelPercent: number | null;
  error: string | null;
}

type Listener = (state: AutoTripServiceState) => void;

const INITIAL_STATE: AutoTripServiceState = {
  connected: false,
  active: false,
  fuelSupported: false,
  fuelLevelSupported: false,
  distanceKm: 0,
  fuelUsedL: 0,
  consumptionKml: null,
  fuelLevelPercent: null,
  error: null,
};

class AutoTripService {
  private basePath = '';
  private running = false;
  private recorder: RealTripRecorder | null = null;
  private loopPromise: Promise<void> | null = null;
  private generation = 0;
  private transition: Promise<void> = Promise.resolve();
  private unsubscribeConnection: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private state: AutoTripServiceState = { ...INITIAL_STATE };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  getState(): AutoTripServiceState {
    return { ...this.state };
  }

  async start(basePath: string): Promise<void> {
    if (this.running) return;
    this.basePath = basePath;
    await initAutoSave(basePath);
    this.running = true;
    this.unsubscribeConnection = subscribeSharedObd((connection) => {
      this.transition = this.transition
        .then(() => this.applyConnection(connection))
        .catch((cause) => this.setState({
          error: cause instanceof Error ? cause.message : 'FALHA NO SERVIÇO AUTOMÁTICO DA VIAGEM',
        }));
    });
  }

  async stop(): Promise<void> {
    if (!this.running) return;
    this.running = false;
    this.generation += 1;
    this.unsubscribeConnection?.();
    this.unsubscribeConnection = null;
    await this.transition;
    await this.stopCurrentLoop();
    await this.finalizeRecorder();
    this.state = { ...INITIAL_STATE };
    this.emit();
  }

  private async applyConnection(connection: SharedObdConnection | null): Promise<void> {
    await this.stopCurrentLoop();
    await this.finalizeRecorder();

    if (!connection || !this.running) {
      this.state = { ...INITIAL_STATE };
      this.emit();
      return;
    }

    const fuelSupported = connection.supportedPids.includes('015E');
    const fuelLevelSupported = connection.supportedPids.includes('012F');
    const initialDistanceKm = gpsTracker.getState().distanceKm;
    this.recorder = fuelSupported ? new RealTripRecorder(Date.now(), initialDistanceKm) : null;
    const generation = ++this.generation;

    this.state = {
      ...INITIAL_STATE,
      connected: true,
      active: fuelSupported,
      fuelSupported,
      fuelLevelSupported,
      error: null,
    };
    this.emit();

    this.loopPromise = this.runLoop(connection, generation);
  }

  private async runLoop(connection: SharedObdConnection, generation: number): Promise<void> {
    let lastFuelLevelReadAt = 0;

    while (
      this.running &&
      generation === this.generation &&
      getSharedObdConnection()?.session === connection.session
    ) {
      const loopStartedAt = Date.now();

      try {
        let fuelRateLph: number | null = null;

        if (this.state.fuelSupported) {
          const fuelResult = await connection.session.queryPid('015E');
          if (
            fuelResult.parsed.status === 'RESPONDEU' &&
            fuelResult.parsed.unit === 'L/h' &&
            fuelResult.parsed.value != null &&
            Number.isFinite(fuelResult.parsed.value) &&
            fuelResult.parsed.value >= 0
          ) {
            fuelRateLph = fuelResult.parsed.value;
          }
        }

        if (
          this.state.fuelLevelSupported &&
          Date.now() - lastFuelLevelReadAt >= 10_000
        ) {
          lastFuelLevelReadAt = Date.now();
          const levelResult = await connection.session.queryPid('012F');
          const level =
            levelResult.parsed.status === 'RESPONDEU' &&
            levelResult.parsed.unit === '%' &&
            levelResult.parsed.value != null &&
            Number.isFinite(levelResult.parsed.value) &&
            levelResult.parsed.value >= 0 &&
            levelResult.parsed.value <= 100
              ? levelResult.parsed.value
              : null;

          if (level != null) {
            updateAutoSaveState((state) => {
              state.lastReadings = [
                {
                  pid: '012F',
                  name: levelResult.parsed.name,
                  value: level,
                  unit: '%',
                  status: levelResult.parsed.status,
                  timestamp: new Date().toISOString(),
                },
                ...state.lastReadings.filter((item) => item.pid !== '012F'),
              ].slice(0, 50);
            });
            this.setState({ fuelLevelPercent: level, error: null });
          }
        }

        const recorder = this.recorder;
        if (recorder) {
          const gps = gpsTracker.getState();
          const state = recorder.addSample({
            timestampMs: Date.now(),
            distanceKm: gps.distanceKm,
            speedKmh: gps.currentSpeedKmh,
            fuelRateLph: fuelRateLph,
          });
          this.setState({
            connected: true,
            active: true,
            distanceKm: state.distanceKm,
            fuelUsedL: state.fuelUsedL,
            consumptionKml:
              state.distanceKm > 0 && state.fuelUsedL > 0
                ? state.distanceKm / state.fuelUsedL
                : null,
            error: fuelRateLph == null && state.validFuelSamples === 0
              ? 'GPS ATIVO / ECU SEM PID 015E VÁLIDO'
              : null,
          });
        }
      } catch (cause) {
        this.setState({
          error: cause instanceof Error ? cause.message : 'FALHA NA LEITURA AUTOMÁTICA OBD',
        });
      }

      const intervalMs = this.state.fuelSupported ? 1500 : 10_000;
      const elapsedMs = Date.now() - loopStartedAt;
      const waitMs = Math.max(150, intervalMs - elapsedMs);
      await new Promise((resolve) => setTimeout(resolve, waitMs));
    }
  }

  private async stopCurrentLoop(): Promise<void> {
    this.generation += 1;
    const loop = this.loopPromise;
    this.loopPromise = null;
    if (loop) {
      try {
        await loop;
      } catch {
        // loop finalizado
      }
    }
  }

  private async finalizeRecorder(): Promise<void> {
    const recorder = this.recorder;
    this.recorder = null;
    if (!recorder || !this.basePath) return;

    const cycle = recorder.buildDriveCycle();
    if (!cycle) return;

    await addDriveCycle(this.basePath, cycle);
    updateAutoSaveState((state) => {
      state.driveCycles = [...state.driveCycles, cycle];
    });
    await forceSaveOnObdEvent();
  }

  private setState(patch: Partial<AutoTripServiceState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const autoTripService = new AutoTripService();
