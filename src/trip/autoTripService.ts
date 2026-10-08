import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, getSharedObdStatus, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle, readDriveCycles } from '../storage/driveCycleStorage';
import { forceSaveOnObdEvent, registerObdQuery } from '../meriva/autosaveIntegration';
import { getAutoSaveState, updateAutoSaveState, initAutoSave } from '../meriva/autosaveManager';
import { readAppSettings } from '../database/appSettings';
import { MERIVA_MANUAL } from '../database/merivaManual';
import { RealTripRecorder } from './tripRecorder';
import { INITIAL_DRIVE_CYCLES } from '../data/driveCycles';
import { estimateRangeFromFuelLevel, fuelLevelPercentToLiters, isFuelReserve } from './fuelLevel';
import { resetLiveTelemetry } from '../obd/liveTelemetry';
import { estimateFuelRateLph, type FuelRateSource } from '../obd/fuelConsumption';

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
  private stoppedSinceMs: number | null = null;
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

    if (!connection || !this.running) {
      this.state = { ...INITIAL_STATE };
      this.emit();
      return;
    }

    const fuelSupported = connection.supportedPids.includes('015E');
    const fuelLevelSupported = connection.supportedPids.includes('012F');
    const obdSpeedSupported = connection.supportedPids.includes('010D');
    const initialDistanceKm = gpsTracker.getState().distanceKm;
    this.recorder = null;
    this.stoppedSinceMs = null;
    const generation = ++this.generation;

    const persistedAutonomy = (await initAutoSave(this.basePath)).autonomy;
    this.state = {
      ...INITIAL_STATE,
      connected: true,
      active: false,
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
    while (
      this.running &&
      generation === this.generation &&
      getSharedObdConnection()?.session === connection.session
    ) {
      if (!getSharedObdStatus().ecuConnected) {
        this.setState({ connected: true, active: false, error: 'ADAPTADOR OK / ECU SEM RESPOSTA' });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (this.pollingPauseCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      const loopStartedAt = Date.now();

      try {
        let fuelRateLph: number | null = null;
        let fuelRateSource: FuelRateSource | undefined;
        let fuelLevelPercent: number | null = null;
        let alcoholPercentFromObd: number | null = null;
        let fuelEstimateNote: string | null = null;
        let obdSpeedKmh: number | null = null;
        let rpm: number | null = null;
        if (obdSpeedSupported) gpsTracker.setVehicleSpeedHintKmh(null);

        // Caminho crítico: RPM e velocidade são consultados antes de qualquer
        // PID secundário, para que combustível/temperatura não atrasem o cockpit.
        if (connection.supportedPids.includes('010C')) {
          const rpmStartedAt = Date.now();
          const rpmResult = await connection.session.queryPid('010C');
          console.info('[obd-poll]', JSON.stringify({ pid: '010C', responseTimeMs: Date.now() - rpmStartedAt, cycle: 'FAST' }));
          await registerObdQuery(this.basePath, rpmResult, 'REAL');
          if (rpmResult.parsed.status === 'RESPONDEU' && Number.isFinite(rpmResult.parsed.value)) {
            rpm = rpmResult.parsed.value;
          }
        }

        if (obdSpeedSupported && connection.supportedPids.includes('010D')) {
          const speedStartedAt = Date.now();
          const speedResult = await connection.session.queryPid('010D');
          console.info('[obd-poll]', JSON.stringify({ pid: '010D', responseTimeMs: Date.now() - speedStartedAt, cycle: 'FAST' }));
          await registerObdQuery(this.basePath, speedResult, 'REAL');
          if (
            speedResult.parsed.status === 'RESPONDEU' &&
            speedResult.parsed.unit === 'km/h' &&
            speedResult.parsed.value != null &&
            Number.isFinite(speedResult.parsed.value) &&
            speedResult.parsed.value >= 0 &&
            speedResult.parsed.value <= 220
          ) {
            obdSpeedKmh = speedResult.parsed.value;
          }
        }

        // Somente PIDs descobertos são elegíveis para o rodízio secundário.
        // O resultado de cada consulta mantém TX/RX pelo autosave existente.
        const secondaryPids = ['015E', '012F', '0110', '010B', '010F', '0105', '0111']
          .filter((pid) => connection.supportedPids.includes(pid));
        if (secondaryPids.length > 0) {
          const secondaryPid = secondaryPids[this.telemetryCursor % secondaryPids.length];
          this.telemetryCursor += 1;
          const secondaryStartedAt = Date.now();
          const secondaryResult = await connection.session.queryPid(secondaryPid);
          console.info('[obd-poll]', JSON.stringify({
            pid: secondaryPid,
            responseTimeMs: Date.now() - secondaryStartedAt,
            cycle: 'SECONDARY',
            status: secondaryResult.parsed.status,
          }));
          await registerObdQuery(this.basePath, secondaryResult, 'REAL');
          if (secondaryPid === '015E' && secondaryResult.parsed.status === 'RESPONDEU' &&
              secondaryResult.parsed.value != null && Number.isFinite(secondaryResult.parsed.value) &&
              secondaryResult.parsed.value >= 0) {
            fuelRateLph = secondaryResult.parsed.value;
            fuelRateSource = 'MEASURED_015E';
          }
          if (secondaryPid === '012F' && secondaryResult.parsed.status === 'RESPONDEU' &&
              secondaryResult.parsed.value != null && Number.isFinite(secondaryResult.parsed.value) &&
              secondaryResult.parsed.value >= 0 && secondaryResult.parsed.value <= 100) {
            fuelLevelPercent = secondaryResult.parsed.value;
          }
        }

        // Quando 010D existe, o GPS recebe a velocidade real da ECU como
        // confirmação de movimento. Zero km/h bloqueia deriva do GPS parado.
        // Sem 010D, null devolve a decisão ao filtro GPS.
        gpsTracker.setVehicleSpeedHintKmh(obdSpeedSupported ? obdSpeedKmh : null);

        // RPM é consultado a cada ciclo porque também define o estado do motor
        // e a abertura/fechamento automático do trajeto.
        if (connection.supportedPids.includes('010C')) {
          const rpmResult = await connection.session.queryPid('010C');
          await registerObdQuery(this.basePath, rpmResult, 'REAL');
          if (rpmResult.parsed.status === 'RESPONDEU' && Number.isFinite(rpmResult.parsed.value)) {
            rpm = rpmResult.parsed.value;
          }
        }

        if (fuelRateLph == null) {
          const mafResult = await connection.session.queryPid('0110');
          await registerObdQuery(this.basePath, mafResult, 'REAL');
          const mafGs = mafResult.parsed.status === 'RESPONDEU' ? mafResult.parsed.value : null;
          if (mafGs != null) {
            const settings = await readAppSettings(this.basePath);
            const estimate = estimateFuelRateLph({
              mafGs,
              alcoholPercentFromObd,
              manualFuelType: settings.fuelType,
              manualAlcoholPercent: settings.manualFuelAlcoholPercent,
            });
            if (estimate) {
              fuelRateLph = estimate.rateLph;
              fuelRateSource = estimate.source;
              fuelEstimateNote = 'AFR ' + estimate.airFuelRatio.toFixed(2) + ' | densidade ' + estimate.fuelDensityKgPerL.toFixed(3) + ' kg/L | ' + estimate.fuelModel.assumption;
            }
          } else {
            const mapResult = await connection.session.queryPid('010B');
            const iatResult = await connection.session.queryPid('010F');
            await registerObdQuery(this.basePath, mapResult, 'REAL');
            await registerObdQuery(this.basePath, iatResult, 'REAL');
            const settings = await readAppSettings(this.basePath);
            const estimate = estimateFuelRateLph({
              mapKpa: mapResult.parsed.status === 'RESPONDEU' ? mapResult.parsed.value : null,
              rpm,
              intakeAirTempC: iatResult.parsed.status === 'RESPONDEU' ? iatResult.parsed.value : null,
              displacementCm3: getAutoSaveState().vehicle?.displacementCm3 ?? MERIVA_MANUAL.engine.displacementCm3,
              alcoholPercentFromObd,
              manualFuelType: settings.fuelType,
              manualAlcoholPercent: settings.manualFuelAlcoholPercent,
            });
            if (estimate) {
              fuelRateLph = estimate.rateLph;
              fuelRateSource = estimate.source;
              fuelEstimateNote = 'AFR ' + estimate.airFuelRatio.toFixed(2) + ' | densidade ' + estimate.fuelDensityKgPerL.toFixed(3) + ' kg/L | ' + estimate.fuelModel.assumption;
            }
          }
        }

        const gps = gpsTracker.getState();
        const vehicleSpeedKmh = obdSpeedKmh ?? gps.currentSpeedKmh;
        const moving = (rpm ?? 0) > 0 && vehicleSpeedKmh > 0;

        if (moving) {
          this.stoppedSinceMs = null;
          if (!this.recorder) {
            this.recorder = new RealTripRecorder(Date.now(), gps.distanceKm);
          }
        } else if (this.recorder) {
          this.stoppedSinceMs ??= Date.now();
          if (Date.now() - this.stoppedSinceMs >= 15_000) {
            await this.finalizeRecorder();
            this.stoppedSinceMs = null;
          }
        }

        const recorder = this.recorder;
        if (recorder) {
          const gps = gpsTracker.getState();
          // Quando a ECU fornece 010D, ele é a fonte primária de velocidade do veículo.
          // GPS continua responsável por rota/distância e serve de fallback.
          const vehicleSpeedKmh = obdSpeedKmh ?? gps.currentSpeedKmh;
          const state = recorder.addSample({
            timestampMs: Date.now(),
            distanceKm: gps.distanceKm,
            speedKmh: vehicleSpeedKmh,
            fuelRateLph,
            fuelRateSource,
          });
          const instantaneousConsumptionKml =
            fuelRateLph != null && fuelRateLph > 0 && vehicleSpeedKmh > 0
              ? vehicleSpeedKmh / fuelRateLph
              : null;
          this.setState({
            connected: true,
            active: Boolean(this.recorder),
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
                  state.distanceKm > 0 && state.fuelUsedL > 0 ? state.distanceKm / state.fuelUsedL : this.state.averageConsumptionKml,
                ) ?? this.state.estimatedRangeKm)
              : this.state.estimatedRangeKm,
            error: rpm === 0 && obdSpeedKmh === 0 && fuelRateLph == null
              ? 'MOTOR DESLIGADO? / ECU SEM TELEMETRIA VÁLIDA'
              : fuelRateSource && fuelRateSource !== 'MEASURED_015E'
                ? 'CONSUMO ESTIMADO POR ' + fuelRateSource.replace('ESTIMATED_', '') + (fuelEstimateNote ? ' | ' + fuelEstimateNote : '')
                : null,
          });
        }
      } catch (cause) {
        this.setState({
          error: cause instanceof Error ? cause.message : 'FALHA NA LEITURA AUTOMÁTICA OBD',
        });
      }

      const intervalMs = 500;
      const elapsedMs = Date.now() - loopStartedAt;
      const waitMs = Math.max(0, intervalMs - elapsedMs);
      console.info('[obd-poll-cycle]', JSON.stringify({ cycleTimeMs: elapsedMs, targetMs: intervalMs }));
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
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
  }
}

export const autoTripService = new AutoTripService();
