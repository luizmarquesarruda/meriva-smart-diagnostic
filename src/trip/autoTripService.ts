import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, getSharedObdStatus, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle, readDriveCycles } from '../storage/driveCycleStorage';
import { forceSaveOnObdEvent, registerObdQuery } from '../meriva/autosaveIntegration';
import { getAutoSaveState, updateAutoSaveState, initAutoSave } from '../meriva/autosaveManager';
import { RealTripRecorder } from './tripRecorder';
import { estimateRangeFromFuelLevel, fuelLevelPercentToLiters, isFuelReserve } from './fuelLevel';
import { resetLiveTelemetry } from '../obd/liveTelemetry';
import { estimateFuelRateLph, getFuelEstimationSupport, type FuelRateSource } from '../obd/fuelConsumption';

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
        : 0,
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
        : 0,
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
    const fuelEstimationSupport = getFuelEstimationSupport(connection.supportedPids);
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
        const queriedPids = new Set<string>();
        let fuelRateLph: number | null = null;
        let fuelRateSource: FuelRateSource | undefined;
        let fuelLevelPercent: number | null = null;
        let obdSpeedKmh: number | null = null;
        let rpm: number | null = null;
        if (obdSpeedSupported) gpsTracker.setVehicleSpeedHintKmh(null);

        if (this.state.fuelLevelSupported) {
          const fuelLevelResult = await connection.session.queryPid('012F');
          queriedPids.add('012F');
          await registerObdQuery(this.basePath, fuelLevelResult, 'REAL');
          if (
            fuelLevelResult.parsed.status === 'RESPONDEU' &&
            fuelLevelResult.parsed.unit === '%' &&
            fuelLevelResult.parsed.value != null &&
            Number.isFinite(fuelLevelResult.parsed.value) &&
            fuelLevelResult.parsed.value >= 0 &&
            fuelLevelResult.parsed.value <= 100
          ) {
            fuelLevelPercent = fuelLevelResult.parsed.value;
          }
        }

        if (this.state.fuelSupported) {
          const fuelResult = await connection.session.queryPid('015E');
          queriedPids.add('015E');
          await registerObdQuery(this.basePath, fuelResult, 'REAL');
          if (
            fuelResult.parsed.status === 'RESPONDEU' &&
            fuelResult.parsed.unit === 'L/h' &&
            fuelResult.parsed.value != null &&
            Number.isFinite(fuelResult.parsed.value) &&
            fuelResult.parsed.value >= 0
          ) {
            fuelRateLph = fuelResult.parsed.value;
            fuelRateSource = 'MEASURED_015E';
          }
        }

        if (obdSpeedSupported) {
          const speedResult = await connection.session.queryPid('010D');
          queriedPids.add('010D');
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

        // Quando 010D existe, o GPS recebe a velocidade real da ECU como
        // confirmação de movimento. Zero km/h bloqueia deriva do GPS parado.
        // Sem 010D, null devolve a decisão ao filtro GPS.
        gpsTracker.setVehicleSpeedHintKmh(obdSpeedSupported ? obdSpeedKmh : null);

        // RPM é consultado a cada ciclo porque também define o estado do motor
        // e a abertura/fechamento automático do trajeto.
        if (connection.supportedPids.includes('010C')) {
          const rpmResult = await connection.session.queryPid('010C');
          queriedPids.add('010C');
          await registerObdQuery(this.basePath, rpmResult, 'REAL');
          if (rpmResult.parsed.status === 'RESPONDEU' && Number.isFinite(rpmResult.parsed.value)) {
            rpm = rpmResult.parsed.value;
          }
        }

        // Respeita a bitmap de suporte da ECU: não bombardeia a K-Line com
        // PIDs que já foram descobertos como não suportados.
        if (fuelRateLph == null && fuelEstimationSupport.maf) {
          const mafResult = await connection.session.queryPid('0110');
          queriedPids.add('0110');
          await registerObdQuery(this.basePath, mafResult, 'REAL');
          const mafGs = mafResult.parsed.status === 'RESPONDEU' ? mafResult.parsed.value : null;
          if (mafGs != null) {
            const estimate = estimateFuelRateLph({ mafGs });
            if (estimate) {
              fuelRateLph = estimate.rateLph;
              fuelRateSource = estimate.source;
            }
          }
        }

        // O cálculo MAP só é possível com MAP + IAT + RPM e cilindrada conhecida.
        // Não usar cilindrada genérica para fabricar um consumo para o veículo.
        if (fuelRateLph == null && fuelEstimationSupport.mapAndIat && rpm != null) {
          const displacementCm3 = getAutoSaveState().vehicle?.displacementCm3;
          if (displacementCm3 != null && Number.isFinite(displacementCm3) && displacementCm3 > 0) {
            const mapResult = await connection.session.queryPid('010B');
            queriedPids.add('010B');
            const iatResult = await connection.session.queryPid('010F');
            queriedPids.add('010F');
            await registerObdQuery(this.basePath, mapResult, 'REAL');
            await registerObdQuery(this.basePath, iatResult, 'REAL');
            const estimate = estimateFuelRateLph({
              mapKpa: mapResult.parsed.status === 'RESPONDEU' ? mapResult.parsed.value : null,
              rpm,
              intakeAirTempC: iatResult.parsed.status === 'RESPONDEU' ? iatResult.parsed.value : null,
              displacementCm3,
            });
            if (estimate) {
              fuelRateLph = estimate.rateLph;
              fuelRateSource = estimate.source;
            }
          }
        }

        // Mantém um PID secundário por ciclo para tendências sem monopolizar o ELM.
        const telemetryCandidates = ['0105', '010B', '0111'];
        const supportedTelemetry = telemetryCandidates.filter((item) => connection.supportedPids.includes(item) && !queriedPids.has(item));
        if (supportedTelemetry.length > 0) {
          const telemetryPid = supportedTelemetry[this.telemetryCursor % supportedTelemetry.length];
          this.telemetryCursor += 1;
          const telemetryResult = await connection.session.queryPid(telemetryPid);
          queriedPids.add(telemetryPid);
          await registerObdQuery(this.basePath, telemetryResult, 'REAL');
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
                ? 'CONSUMO ESTIMADO POR ' + fuelRateSource.replace('ESTIMATED_', '')
                : null,
          });
        }
      } catch (cause) {
        this.setState({
          error: cause instanceof Error ? cause.message : 'FALHA NA LEITURA AUTOMÁTICA OBD',
        });
      }

      const intervalMs = this.state.fuelSupported || obdSpeedSupported ? 1500 : 5000;
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
