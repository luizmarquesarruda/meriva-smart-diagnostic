import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle, readDriveCycles } from '../storage/driveCycleStorage';
import { forceSaveOnObdEvent, recordAutomaticObdQuery } from '../meriva/autosaveIntegration';
import { updateAutoSaveState, initAutoSave } from '../meriva/autosaveManager';
import { RealTripRecorder } from './tripRecorder';
import { INITIAL_DRIVE_CYCLES } from '../data/driveCycles';
import { estimateRangeFromFuelLevel, fuelLevelPercentToLiters, isFuelReserve } from './fuelLevel';
import { resetLiveTelemetry } from '../obd/liveTelemetry';
import { TelemetryScheduler } from '../obd/telemetryScheduler';
import { emitAppEvent } from '../state/appEventBus';

export interface AutoTripServiceState {
  connected: boolean;
  active: boolean;
  fuelSupported: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  fuelRemainingL: number | null;
  fuelReserve: boolean | null;
  distanceKm: number;
  fuelUsedL: number;
  consumptionKml: number | null;
  instantaneousConsumptionKml: number | null;
  error: string | null;
  averageConsumptionKml: number;
  estimatedRangeKm: number;
}

type Listener = (state: AutoTripServiceState) => void;

const CARSCANNER_REFERENCE_CONSUMPTION_KML = (() => {
  const distanceKm = INITIAL_DRIVE_CYCLES.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  const fuelL = INITIAL_DRIVE_CYCLES.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
  return fuelL > 0 ? Number((distanceKm / fuelL).toFixed(3)) : 0;
})();

const INITIAL_STATE: AutoTripServiceState = {
  connected: false,
  active: false,
  fuelSupported: false,
  fuelLevelSupported: false,
  fuelLevelPercent: null,
  fuelRemainingL: null,
  fuelReserve: null,
  distanceKm: 0,
  fuelUsedL: 0,
  consumptionKml: null,
  instantaneousConsumptionKml: null,
  error: null,
  averageConsumptionKml: 0,
  estimatedRangeKm: 0,
};

class AutoTripService {
  private basePath = '';
  private running = false;
  private recorder: RealTripRecorder | null = null;
  private loopPromise: Promise<void> | null = null;
  private generation = 0;
  private pollingPauseCount = 0;
  private transition: Promise<void> = Promise.resolve();
  private unsubscribeConnection: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private telemetryCursor = 0;
  private readonly telemetryScheduler = new TelemetryScheduler();
  private readonly liveValues = new Map<string, { value: number; timestampMs: number }>();
  private state: AutoTripServiceState = { ...INITIAL_STATE };

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  getState(): AutoTripServiceState {
    return { ...this.state };
  }

  async withPollingPaused<T>(operation: () => Promise<T>): Promise<T> {
    this.pollingPauseCount += 1;
    try {
      return await operation();
    } finally {
      this.pollingPauseCount = Math.max(0, this.pollingPauseCount - 1);
    }
  }

  async start(basePath: string): Promise<void> {
    if (this.running) return;
    this.basePath = basePath;
    const persisted = await initAutoSave(basePath);
    this.state = {
      ...this.state,
      averageConsumptionKml: persisted.autonomy.averageConsumptionKml > 0
        ? persisted.autonomy.averageConsumptionKml
        : CARSCANNER_REFERENCE_CONSUMPTION_KML,
      estimatedRangeKm: persisted.autonomy.estimatedRangeKm,
    };
    this.emit();
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
    gpsTracker.setVehicleSpeedHintKmh(null);
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

    resetLiveTelemetry();
    this.telemetryCursor = 0;
    this.telemetryScheduler.reset();
    this.liveValues.clear();

    if (!connection || !this.running) {
      this.state = { ...INITIAL_STATE };
      this.emit();
      return;
    }

    const fuelSupported = connection.supportedPids.includes('015E');
    const fuelLevelSupported = connection.supportedPids.includes('012F');
    const obdSpeedSupported = connection.supportedPids.includes('010D');
    const initialDistanceKm = gpsTracker.getState().distanceKm;
    this.recorder = new RealTripRecorder(Date.now(), initialDistanceKm);
    const generation = ++this.generation;

    const persistedAutonomy = (await initAutoSave(this.basePath)).autonomy;
    this.state = {
      ...INITIAL_STATE,
      connected: true,
      active: true,
      fuelSupported,
      fuelLevelSupported,
      fuelLevelPercent: null,
      fuelRemainingL: null,
      fuelReserve: null,
      error: null,
      averageConsumptionKml: persistedAutonomy.averageConsumptionKml > 0
        ? persistedAutonomy.averageConsumptionKml
        : CARSCANNER_REFERENCE_CONSUMPTION_KML,
      estimatedRangeKm: persistedAutonomy.estimatedRangeKm,
    };
    this.emit();

    this.loopPromise = this.runLoop(connection, generation, obdSpeedSupported);
  }

  private async runLoop(
    connection: SharedObdConnection,
    generation: number,
    obdSpeedSupported: boolean,
  ): Promise<void> {
    const isCanProtocol = /ISO\s*15765-4|CAN/i.test(connection.protocol ?? '');

    while (
      this.running &&
      generation === this.generation &&
      getSharedObdConnection()?.session === connection.session
    ) {
      if (this.pollingPauseCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const loopStartedAt = Date.now();

      try {
        const now = Date.now();
        const supported = connection.supportedPids;
        const duePids = this.telemetryScheduler.getDuePids(now, supported, isCanProtocol);

        if (duePids.length) {
          const results = isCanProtocol && duePids.length > 1
            ? await connection.session.queryPids(duePids)
            : [await connection.session.queryPid(duePids[0])];

          this.telemetryScheduler.markPolled(
            results.map((result) => result.tx),
            Date.now(),
          );

          for (const result of results) {
            recordAutomaticObdQuery(result);
            if (
              result.parsed.status === 'RESPONDEU' &&
              result.parsed.value != null &&
              Number.isFinite(result.parsed.value)
            ) {
              this.liveValues.set(result.parsed.pid.toUpperCase(), {
                value: result.parsed.value,
                timestampMs: Date.now(),
              });
            }
          }
        }

        const readLive = (pid: string, maxAgeMs: number): number | null => {
          const item = this.liveValues.get(pid);
          if (!item || Date.now() - item.timestampMs > maxAgeMs) return null;
          return item.value;
        };

        const fuelRateLph = this.state.fuelSupported ? readLive('015E', 15_000) : null;
        const fuelLevelPercent = this.state.fuelLevelSupported ? readLive('012F', 15_000) : null;
        const obdSpeedKmh = obdSpeedSupported ? readLive('010D', 5_000) : null;

        // A velocidade OBD é a fonte primária quando disponível; GPS continua
        // responsável pela rota/distância e atua como fallback.
        gpsTracker.setVehicleSpeedHintKmh(obdSpeedSupported ? obdSpeedKmh : null);

        const recorder = this.recorder;
        if (recorder) {
          const gps = gpsTracker.getState();
          const vehicleSpeedKmh = obdSpeedKmh ?? gps.currentSpeedKmh;
          const state = recorder.addSample({
            timestampMs: Date.now(),
            distanceKm: gps.distanceKm,
            speedKmh: vehicleSpeedKmh,
            fuelRateLph,
          });

          const instantaneousConsumptionKml =
            fuelRateLph != null && fuelRateLph > 0 && vehicleSpeedKmh > 0
              ? vehicleSpeedKmh / fuelRateLph
              : null;

          this.setState({
            connected: true,
            active: true,
            distanceKm: state.distanceKm,
            fuelUsedL: state.fuelUsedL,
            consumptionKml:
              state.distanceKm > 0 && state.fuelUsedL > 0
                ? state.distanceKm / state.fuelUsedL
                : null,
            instantaneousConsumptionKml,
            fuelLevelPercent,
            fuelRemainingL: fuelLevelPercentToLiters(fuelLevelPercent),
            fuelReserve: isFuelReserve(fuelLevelPercent),
            estimatedRangeKm: fuelLevelPercent != null
              ? (estimateRangeFromFuelLevel(
                  fuelLevelPercent,
                  state.distanceKm > 0 && state.fuelUsedL > 0
                    ? state.distanceKm / state.fuelUsedL
                    : this.state.averageConsumptionKml,
                ) ?? this.state.estimatedRangeKm)
              : this.state.estimatedRangeKm,
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

      const now = Date.now();
      const scheduleDelay = this.telemetryScheduler.getNextDueDelayMs(now, connection.supportedPids);
      const elapsedMs = now - loopStartedAt;
      const waitMs = Math.max(150, Math.min(1500, scheduleDelay - elapsedMs));
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
    const storedCycles = await readDriveCycles(this.basePath);
    updateAutoSaveState((state) => {
      state.driveCycles = storedCycles;

      // O PID 012F é a fonte absoluta de nível de combustível para autonomia.
      // A capacidade nominal de 56 L converte o percentual da ECU em litros.
      // O histórico de consumo continua vindo de viagens reais.
      const existingReading = state.autonomy.readings.find((item) => item.id === cycle.id);
      if (!existingReading) {
        const previousDistance = Number(state.autonomy.cumulativeDistanceKm) || 0;
        const previousFuel = Number(state.autonomy.cumulativeFuelUsedL) || 0;
        const distanceKm = Math.max(0, Number(cycle.distanceTotalKm) || 0);
        const fuelUsedL = Math.max(0, Number(cycle.fuelUsedL) || 0);
        const cumulativeDistanceKm = previousDistance + distanceKm;
        const cumulativeFuelUsedL = previousFuel + fuelUsedL;
        const averageConsumptionKml = cumulativeFuelUsedL > 0
          ? cumulativeDistanceKm / cumulativeFuelUsedL
          : 0;
        const estimatedRangeKm = averageConsumptionKml > 0
          ? averageConsumptionKml * state.autonomy.tankCapacityL
          : 0;

        state.autonomy = {
          ...state.autonomy,
          tankCapacityL: 56,
          cumulativeDistanceKm: Number(cumulativeDistanceKm.toFixed(3)),
          cumulativeFuelUsedL: Number(cumulativeFuelUsedL.toFixed(3)),
          averageConsumptionKml: Number(averageConsumptionKml.toFixed(3)),
          estimatedRangeKm: Number(estimatedRangeKm.toFixed(1)),
          fuelLevelPercent: this.state.fuelLevelPercent,
          fuelRemainingL: this.state.fuelRemainingL,
          fuelReserve: this.state.fuelReserve,
          realReadingCount: (Number(state.autonomy.realReadingCount) || 0) + 1,
          lastReadingAt: cycle.finishedAt,
          readings: [
            ...state.autonomy.readings,
            {
              id: cycle.id,
              timestamp: cycle.finishedAt,
              distanceKm,
              fuelUsedL,
              consumptionKml: Number((fuelUsedL > 0 ? distanceKm / fuelUsedL : 0).toFixed(3)),
              estimatedRangeKm: Number(estimatedRangeKm.toFixed(1)),
              source: 'REAL_OBD' as const,
            },
          ].slice(-200),
        };
      }
    });

    const autonomy = (await initAutoSave(this.basePath)).autonomy;
    this.setState({
      averageConsumptionKml: autonomy.averageConsumptionKml,
      estimatedRangeKm: autonomy.estimatedRangeKm,
    });
    await forceSaveOnObdEvent();
  }

  private setState(patch: Partial<AutoTripServiceState>): void {
    this.state = { ...this.state, ...patch };
    this.emit();
    emitAppEvent('TRIP_UPDATED');
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const autoTripService = new AutoTripService();
