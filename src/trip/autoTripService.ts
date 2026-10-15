import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, getSharedObdStatus, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle, readDriveCycles } from '../storage/driveCycleStorage';
import { registerObdQuery } from '../meriva/autosaveIntegration';
import { getAutoSaveState, updateAutoSaveState, initAutoSave, saveNow } from '../meriva/autosaveManager';
import type { DriveCycle } from '../data/driveCycles';
import { RealTripRecorder, shouldFinalizeStoppedTrip } from './tripRecorder';
import { estimateRangeFromFuelLevel, fuelLevelPercentToLiters, isFuelReserve } from './fuelLevel';
import { getLivePidTrend, resetLiveTelemetry } from '../obd/liveTelemetry';
import { estimateFuelRateLph, type FuelRateSource } from '../obd/fuelConsumption';
import { startBackgroundMonitoring } from '../gps/backgroundMonitoring';
import { readAppSettings, subscribeAppSettings } from '../database/appSettings';
import type { FuelType } from '../database/appSettings';
import pollingPolicy from '../knowledge/polling_policy.json';

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
  instantaneousConsumptionSource: FuelRateSource | null;
  instantaneousConsumptionTimestampMs: number | null;
  instantaneousSpeedKmh: number | null;
  activeFuelType: FuelType | null;
  error: string | null;
  averageConsumptionKml: number;
  estimatedRangeKm: number;
}

type Listener = (state: AutoTripServiceState) => void;

const FUEL_ESTIMATE_EVERY_N_CYCLES = pollingPolicy.polling.estimatedFuelRate.everyCycles;
const FUEL_RATE_DISPLAY_STALE_AFTER_MS = pollingPolicy.polling.estimatedFuelRate.displayStaleAfterMs;
const FUEL_LEVEL_EVERY_N_CYCLES = pollingPolicy.polling.fuelLevel.everyCycles;

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
  instantaneousConsumptionSource: null,
  instantaneousConsumptionTimestampMs: null,
  instantaneousSpeedKmh: null,
  activeFuelType: null,
  error: null;
  averageConsumptionKml: 0,
  estimatedRangeKm: 0,
};

class AutoTripService {
  private basePath = '';
  private running = false;
  private recorder: RealTripRecorder | null = null;
  /** Fuel type captured at trip start; do not mix estimator formulas within one trip. */
  private recorderFuelType: FuelType | null = null;
  private pendingFinalizedTrips: DriveCycle[] = [];
  private lastPendingTripRetryAt = 0;
  private loopPromise: Promise<void> | null = null;
  private generation = 0;
  private pollingPauseCount = 0;
  private transition: Promise<void> = Promise.resolve();
  private unsubscribeConnection: (() => void) | null = null;
  private readonly listeners = new Set<Listener>();
  private telemetryCursor = 0;
  private pollCycleNumber = 0;
  private stoppedSinceMs: number | null = null;
  private gpsStartedForEcu = false;
  private lastEstimatedFuelRate: { rateLph: number; source: FuelRateSource; timestampMs: number } | null = null;
  private fuelType: FuelType = 'FLEX';
  private lastFuelEthanolPercent: number | null = null;
  private unsubscribeAppSettings: (() => void) | null = null;
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
    const settings = await readAppSettings(basePath);
    this.fuelType = settings.fuelType;
    this.unsubscribeAppSettings?.();
    this.unsubscribeAppSettings = subscribeAppSettings((nextSettings) => {
      if (nextSettings.fuelType !== this.fuelType) {
        this.fuelType = nextSettings.fuelType;
        // Preserve measured FLEX composition only while an active FLEX trip depends on it.
        if (this.recorderFuelType !== 'FLEX') this.lastFuelEthanolPercent = null;
        this.lastEstimatedFuelRate = null;
      }
    });
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
    this.unsubscribeAppSettings?.();
    this.unsubscribeAppSettings = null;
    await this.transition;
    await this.stopCurrentLoop();
    await this.stopGpsForEcu();
    this.lastEstimatedFuelRate = null;
    let finalizationError: string | null = null;
    try {
      await this.finalizeRecorder();
    } catch (cause) {
      this.lastPendingTripRetryAt = Date.now();
      finalizationError = cause instanceof Error ? cause.message : String(cause);
    }
    this.state = {
      ...INITIAL_STATE,
      error: finalizationError || this.pendingFinalizedTrips.length > 0
        ? 'VIAGEM PENDENTE DE SALVAMENTO: ' + (finalizationError ?? 'aguardando a próxima conexão para nova tentativa')
        : null,
    };
    this.emit();
  }

  private async applyConnection(connection: SharedObdConnection | null): Promise<void> {
    const hadTrackingSession = Boolean(this.loopPromise || this.recorder || this.gpsStartedForEcu);
    await this.stopCurrentLoop();
    // A conexão inicial pode já ter iniciado o GPS pelo serviço nativo em
    // sharedConnection; não o desligar e ligar novamente sem necessidade.
    if (!connection || hadTrackingSession) await this.stopGpsForEcu();
    let pendingTripWriteError: string | null = null;
    try {
      await this.finalizeRecorder();
    } catch (cause) {
      // Keep the finalized trip and delay the next write attempt to avoid a hot
      // retry loop while storage is unavailable.
      this.lastPendingTripRetryAt = Date.now();
      pendingTripWriteError = cause instanceof Error ? cause.message : String(cause);
    }

    resetLiveTelemetry();
    this.telemetryCursor = 0;
    this.pollCycleNumber = 0;
    this.lastEstimatedFuelRate = null;
    this.lastFuelEthanolPercent = null;

    if (!connection || !this.running) {
      this.state = {
        ...INITIAL_STATE,
        error: pendingTripWriteError ? 'VIAGEM PENDENTE DE SALVAMENTO: ' + pendingTripWriteError : null,
      };
      this.emit();
      return;
    }

    const fuelSupported = connection.supportedPids.includes('015E');
    const fuelLevelSupported = connection.supportedPids.includes('012F');
    const obdSpeedSupported = connection.supportedPids.includes('010D');
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
      error: pendingTripWriteError
        ? 'VIAGEM PENDENTE DE SALVAMENTO: ' + pendingTripWriteError
        : null,
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
    while (
      this.running &&
      generation === this.generation &&
      getSharedObdConnection()?.session === connection.session
    ) {
      if (!getSharedObdStatus().ecuConnected) {
        // A ECU perdeu a resposta: encerrar a captura de localização e fechar a
        // viagem com a última evidência válida, sem acumular GPS offline.
        await this.stopGpsForEcu();
        let finalizationError: string | null = null;
        const hasLiveRecorder = this.recorder !== null;
        const pendingRetryDue = this.pendingFinalizedTrips.length > 0 &&
          Date.now() - this.lastPendingTripRetryAt >= 10_000;
        if (hasLiveRecorder || pendingRetryDue) {
          try {
            if (pendingRetryDue) this.lastPendingTripRetryAt = Date.now();
            await this.finalizeRecorder();
            this.stoppedSinceMs = null;
          } catch (cause) {
            this.lastPendingTripRetryAt = Date.now();
            finalizationError = cause instanceof Error ? cause.message : String(cause);
          }
        }
        this.setState({
          connected: true,
          active: false,
          error: finalizationError
            ? 'VIAGEM PENDENTE DE SALVAMENTO: ' + finalizationError
            : this.pendingFinalizedTrips.length > 0
              ? 'VIAGEM PENDENTE DE SALVAMENTO: nova tentativa em até 10 s'
              : 'ADAPTADOR OK / ECU SEM RESPOSTA',
        });
        await new Promise((resolve) => setTimeout(resolve, 1000));
        continue;
      }

      if (this.pollingPauseCount > 0) {
        await new Promise((resolve) => setTimeout(resolve, 100));
        continue;
      }

      // Retry durable trip writes without stopping live OBD polling. The queued
      // DriveCycle keeps its original ID/timestamps across retries.
      if (this.pendingFinalizedTrips.length > 0 && Date.now() - this.lastPendingTripRetryAt >= 10_000) {
        this.lastPendingTripRetryAt = Date.now();
        try {
          await this.flushPendingFinalizedTrips();
        } catch (cause) {
          this.setState({ error: 'VIAGEM PENDENTE DE SALVAMENTO: ' + (cause instanceof Error ? cause.message : String(cause)) });
        }
      }

      if (!this.gpsStartedForEcu) await this.ensureGpsForEcu();

      const loopStartedAt = Date.now();
      this.pollCycleNumber += 1;

      try {
        let fuelRateLph: number | null = null;
        let fuelRateSource: FuelRateSource | undefined;
        let fuelRateForDisplayLph: number | null = null;
        let fuelRateForDisplaySource: FuelRateSource | null = null;
        let fuelRateForDisplayTimestampMs: number | null = null;
        // An active trip keeps the fuel configuration captured when it began.
        const estimateFuelType = this.recorderFuelType ?? this.fuelType;
        let mapFallbackQueriedThisCycle = false;
        const fuelEstimateDue = this.pollCycleNumber % FUEL_ESTIMATE_EVERY_N_CYCLES === pollingPolicy.polling.estimatedFuelRate.phase;
        let fuelLevelPercent: number | null = this.state.fuelLevelPercent;
        let obdSpeedKmh: number | null = null;
        let rpm: number | null = null;
        if (obdSpeedSupported) gpsTracker.setVehicleSpeedHintKmh(null);

        // Caminho crítico primeiro: velocidade e RPM alimentam o cockpit e
        // a detecção de movimento antes das consultas secundárias.
        if (obdSpeedSupported) {
          const speedResult = await connection.session.queryPid('010D');
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

        // 010C é consultado antes dos PIDs lentos para reduzir a latência
        // da detecção de motor ligado/desligado.
        if (connection.supportedPids.includes('010C')) {
          const rpmResult = await connection.session.queryPid('010C');
          await registerObdQuery(this.basePath, rpmResult, 'REAL');
          if (
            rpmResult.parsed.status === 'RESPONDEU' &&
            rpmResult.parsed.value != null &&
            Number.isFinite(rpmResult.parsed.value)
          ) {
            rpm = rpmResult.parsed.value;
          }
        }

        // O consumo medido (015E) continua sendo consultado em cada ciclo
        // para manter o indicador responsivo sempre que a ECU o suporta.
        if (this.state.fuelSupported) {
          const fuelResult = await connection.session.queryPid('015E');
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
            fuelRateForDisplayLph = fuelRateLph;
            fuelRateForDisplaySource = fuelRateSource;
            fuelRateForDisplayTimestampMs = Date.now();
            this.lastEstimatedFuelRate = null;
          }
        }

        // O nível do tanque muda lentamente: consultar a cada quatro ciclos
        // reduz tráfego serial sem limpar o último valor válido da interface.
        if (this.state.fuelLevelSupported && this.pollCycleNumber % FUEL_LEVEL_EVERY_N_CYCLES === pollingPolicy.polling.fuelLevel.phase) {
          const fuelLevelResult = await connection.session.queryPid('012F');
          await registerObdQuery(this.basePath, fuelLevelResult, 'REAL');
          if (
            fuelLevelResult.parsed.status === 'RESPONDEU' &&
            fuelLevelResult.parsed.unit === 'percent' &&
            fuelLevelResult.parsed.value != null &&
            Number.isFinite(fuelLevelResult.parsed.value) &&
            fuelLevelResult.parsed.value >= 0 &&
            fuelLevelResult.parsed.value <= 100
          ) {
            fuelLevelPercent = fuelLevelResult.parsed.value;
          }
        } else {
          fuelLevelPercent = this.state.fuelLevelPercent;
        }

        // FLEX composition is stable and expensive enough to keep off the hot
        // path; sample it rarely, only when the ECU bitmap announces PID 0152.
        // Without a valid composition reading, do not silently estimate as gasoline.
        const fuelCompositionPolicy = pollingPolicy.polling.fuelComposition;
        if (
          (!this.state.fuelSupported || fuelRateLph == null) &&
          estimateFuelType === 'FLEX' &&
          connection.supportedPids.includes(fuelCompositionPolicy.pid) &&
          this.pollCycleNumber % fuelCompositionPolicy.everyCycles === fuelCompositionPolicy.phase
        ) {
          const compositionResult = await connection.session.queryPid(fuelCompositionPolicy.pid);
          await registerObdQuery(this.basePath, compositionResult, 'REAL');
          if (
            compositionResult.parsed.status === 'RESPONDEU' &&
            compositionResult.parsed.unit === 'percent' &&
            compositionResult.parsed.value != null &&
            Number.isFinite(compositionResult.parsed.value) &&
            compositionResult.parsed.value >= 0 &&
            compositionResult.parsed.value <= 100
          ) {
            this.lastFuelEthanolPercent = compositionResult.parsed.value;
          }
        }

        if (fuelRateLph == null && fuelEstimateDue && connection.supportedPids.includes('0110')) {
          // MAF é estimativa secundária: amostrar a cada quatro ciclos reduz tráfego
          // K-Line. Só valores positivos produzem estimativa de taxa de combustível.
          const mafResult = await connection.session.queryPid('0110');
          await registerObdQuery(this.basePath, mafResult, 'REAL');
          const mafGs = mafResult.parsed.status === 'RESPONDEU' ? mafResult.parsed.value : null;
          const estimate = mafGs != null && Number.isFinite(mafGs)
            ? estimateFuelRateLph({ mafGs, fuelType: estimateFuelType, ethanolPercent: this.lastFuelEthanolPercent })
            : null;
          if (estimate) {
            fuelRateLph = estimate.rateLph;
            fuelRateSource = estimate.source;
            fuelRateForDisplayLph = estimate.rateLph;
            fuelRateForDisplaySource = estimate.source;
            const estimateTimestampMs = Date.now();
            this.lastEstimatedFuelRate = {
              rateLph: estimate.rateLph,
              source: estimate.source,
              timestampMs: estimateTimestampMs,
            };
            fuelRateForDisplayTimestampMs = estimateTimestampMs;
          }
        }

        if (
          fuelRateLph == null &&
          fuelEstimateDue &&
          connection.supportedPids.includes('010B') &&
          connection.supportedPids.includes('010F') &&
          connection.supportedPids.includes('010C')
        ) {
          // MAP e IAT são consultados juntos e só na cadência de estimativa.
          // Marcar MAP evita repetir o mesmo PID na telemetria rotativa deste ciclo.
          mapFallbackQueriedThisCycle = true;
          const mapResult = await connection.session.queryPid('010B');
          const iatResult = await connection.session.queryPid('010F');
          await registerObdQuery(this.basePath, mapResult, 'REAL');
          await registerObdQuery(this.basePath, iatResult, 'REAL');
          const mapKpa = mapResult.parsed.status === 'RESPONDEU' ? mapResult.parsed.value : null;
          const intakeAirTempC = iatResult.parsed.status === 'RESPONDEU' ? iatResult.parsed.value : null;
          const estimate = estimateFuelRateLph({
            mapKpa: mapKpa != null && Number.isFinite(mapKpa) ? mapKpa : null,
            rpm,
            intakeAirTempC: intakeAirTempC != null && Number.isFinite(intakeAirTempC) ? intakeAirTempC : null,
            displacementCm3: getAutoSaveState().vehicle?.displacementCm3 ?? 1389,
            fuelType: estimateFuelType,
            ethanolPercent: this.lastFuelEthanolPercent,
          });
          if (estimate) {
            fuelRateLph = estimate.rateLph;
            fuelRateSource = estimate.source;
            fuelRateForDisplayLph = estimate.rateLph;
            fuelRateForDisplaySource = estimate.source;
            const estimateTimestampMs = Date.now();
            this.lastEstimatedFuelRate = {
              rateLph: estimate.rateLph,
              source: estimate.source,
              timestampMs: estimateTimestampMs,
            };
            fuelRateForDisplayTimestampMs = estimateTimestampMs;
          }
        }

        // Exibir a última estimativa por até 10 s para evitar piscar N/D entre
        // amostras lentas. A integração da viagem continua usando apenas a amostra
        // recém-calculada acima, não valores estimados reaproveitados.
        if (fuelRateForDisplayLph == null && this.lastEstimatedFuelRate) {
          const estimateAgeMs = Date.now() - this.lastEstimatedFuelRate.timestampMs;
          if (estimateAgeMs <= FUEL_RATE_DISPLAY_STALE_AFTER_MS) {
            fuelRateForDisplayLph = this.lastEstimatedFuelRate.rateLph;
            fuelRateForDisplaySource = this.lastEstimatedFuelRate.source;
            fuelRateForDisplayTimestampMs = this.lastEstimatedFuelRate.timestampMs;
          } else {
            this.lastEstimatedFuelRate = null;
          }
        }

        // Quando 010D existe, o GPS recebe a velocidade da ECU como confirmação.
        gpsTracker.setVehicleSpeedHintKmh(obdSpeedSupported ? obdSpeedKmh : null);

        // Mantém um PID secundário por ciclo para tendências sem monopolizar o ELM.
        const telemetryCandidates = pollingPolicy.polling.rotatingTelemetryPids;
        const supportedTelemetry = telemetryCandidates.filter((item) =>
          connection.supportedPids.includes(item) &&
          !(mapFallbackQueriedThisCycle && item === pollingPolicy.polling.estimatedFuelRate.mapPid)
        );
        if (supportedTelemetry.length > 0) {
          const telemetryPid = supportedTelemetry[this.telemetryCursor % supportedTelemetry.length];
          this.telemetryCursor += 1;
          const telemetryResult = await connection.session.queryPid(telemetryPid);
          await registerObdQuery(this.basePath, telemetryResult, 'REAL');
        }

        const gps = gpsTracker.getState();
        const vehicleSpeedKmh = obdSpeedKmh ?? gps.currentSpeedKmh;
        // If RPM is temporarily unavailable, valid vehicle speed is still movement evidence.
        const moving = vehicleSpeedKmh > 0 && (rpm == null || rpm > 0);

        if (moving) {
          this.stoppedSinceMs = null;
          if (!this.recorder) {
            this.recorderFuelType = this.fuelType;
            this.recorder = new RealTripRecorder(Date.now(), gps.distanceKm, this.recorderFuelType);
          }
        } else if (this.recorder) {
          this.stoppedSinceMs ??= Date.now();
          if (shouldFinalizeStoppedTrip(Date.now() - this.stoppedSinceMs, rpm)) {
            await this.finalizeRecorder();
            this.stoppedSinceMs = null;
          }
        }

        const recorder = this.recorder;
        const tripGps = gpsTracker.getState();
        // A leitura instantânea deve ser publicada a cada ciclo OBD válido,
        // mesmo antes de iniciar uma viagem ou enquanto não existe viagem ativa.
        const tripVehicleSpeedKmh = obdSpeedKmh ?? tripGps.currentSpeedKmh;
        let tripDistanceKm = 0;
        let tripFuelUsedL = 0;
        let tripConsumptionKml: number | null = null;

        if (recorder) {
          const sampleState = recorder.addSample({
            timestampMs: Date.now(),
            distanceKm: tripGps.distanceKm,
            speedKmh: tripVehicleSpeedKmh,
            fuelRateLph,
            fuelRateSource,
            rpm: (() => { const trend = getLivePidTrend('010C'); return trend && trend.ageSeconds <= 10 ? trend.current : null; })(),
            coolantTempC: (() => { const trend = getLivePidTrend('0105'); return trend && trend.ageSeconds <= 10 ? trend.current : null; })(),
          });
          tripDistanceKm = sampleState.distanceKm;
          tripFuelUsedL = sampleState.fuelUsedL;
          tripConsumptionKml =
            sampleState.distanceKm > 0 && sampleState.fuelUsedL > 0
              ? sampleState.distanceKm / sampleState.fuelUsedL
              : null;
        }

        const instantaneousConsumptionKml =
          fuelRateForDisplayLph != null && fuelRateForDisplayLph > 0 && tripVehicleSpeedKmh > 0
            ? tripVehicleSpeedKmh / fuelRateForDisplayLph
            : null;

        this.setState({
          connected: true,
          active: Boolean(recorder),
          distanceKm: tripDistanceKm,
          fuelUsedL: tripFuelUsedL,
          consumptionKml: tripConsumptionKml,
          instantaneousConsumptionKml,
          instantaneousConsumptionSource: instantaneousConsumptionKml != null ? fuelRateForDisplaySource : null,
          instantaneousConsumptionTimestampMs: instantaneousConsumptionKml != null ? fuelRateForDisplayTimestampMs : null,
          instantaneousSpeedKmh: tripVehicleSpeedKmh,
          activeFuelType: recorder ? (this.recorderFuelType ?? this.fuelType) : null,
          fuelLevelPercent,
          fuelRemainingL: fuelLevelPercentToLiters(fuelLevelPercent),
          fuelReserve: isFuelReserve(fuelLevelPercent),
          estimatedRangeKm: fuelLevelPercent != null
            ? (estimateRangeFromFuelLevel(
                fuelLevelPercent,
                tripConsumptionKml ?? this.state.averageConsumptionKml,
              ) ?? this.state.estimatedRangeKm)
            : this.state.estimatedRangeKm,
          error: rpm === 0 && obdSpeedKmh === 0 && fuelRateForDisplayLph == null
            ? 'MOTOR DESLIGADO? / ECU SEM TELEMETRIA VÁLIDA'
            : fuelRateForDisplaySource && fuelRateForDisplaySource !== 'MEASURED_015E'
              ? 'CONSUMO ESTIMADO POR ' + fuelRateForDisplaySource.replace('ESTIMATED_', '')
              : null,
        });
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

  private async ensureGpsForEcu(): Promise<void> {
    if (this.gpsStartedForEcu) return;
    if (gpsTracker.getState().running) {
      this.gpsStartedForEcu = true;
      return;
    }

    // No Android, priorizar o serviço nativo para continuar registrando em
    // segundo plano. Se a permissão ou o serviço falhar, manter fallback em
    // primeiro plano sem bloquear a leitura OBD.
    let backgroundStarted = false;
    try {
      backgroundStarted = await startBackgroundMonitoring();
    } catch {
      backgroundStarted = false;
    }
    if (!backgroundStarted) await gpsTracker.start();
    this.gpsStartedForEcu = gpsTracker.getState().running || gpsTracker.isBackgroundLocationRunning();
  }

  private async stopGpsForEcu(): Promise<void> {
    const gps = gpsTracker.getState();
    if (this.gpsStartedForEcu || gps.running || gpsTracker.isBackgroundLocationRunning()) {
      await gpsTracker.stop();
    }
    this.gpsStartedForEcu = false;
    gpsTracker.setVehicleSpeedHintKmh(null);
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
    if (!this.basePath) return;

    const recorder = this.recorder;
    if (recorder) {
      const cycle = recorder.buildDriveCycle();
      // Freeze the previous session once. Rebuilding later would generate a
      // different finishedAt/id and could duplicate a trip after partial I/O.
      const finalizedFuelType = this.recorderFuelType;
      this.recorder = null;
      this.recorderFuelType = null;
      // Do not let a cached estimate using the previous trip's fuel parameters seed the next trip.
      if (finalizedFuelType && finalizedFuelType !== this.fuelType) {
        this.lastEstimatedFuelRate = null;
        if (this.fuelType !== 'FLEX') this.lastFuelEthanolPercent = null;
      }
      if (cycle) this.pendingFinalizedTrips.push(cycle);
    }

    await this.flushPendingFinalizedTrips();
  }

  private async flushPendingFinalizedTrips(): Promise<void> {
    if (!this.basePath) return;

    while (this.pendingFinalizedTrips.length > 0) {
      const cycle = this.pendingFinalizedTrips[0];

      // Write the finalized trip into the JSON recovery snapshot first. If
      // index/CSV storage then fails or Android kills the process, startup can
      // reconcile this same stable trip ID into the operational trip index.
      updateAutoSaveState((state) => {
        const existingIndex = state.driveCycles.findIndex((item) => item.id === cycle.id);
        if (existingIndex >= 0) state.driveCycles[existingIndex] = cycle;
        else state.driveCycles.push(cycle);
        state.driveCycles = state.driveCycles.filter((item) => item.source === 'REAL_OBD');
      });
      const stagedSnapshotSaved = await saveNow('critical');
      if (!stagedSnapshotSaved) throw new Error('SNAPSHOT_JSON_DA_VIAGEM_NAO_CONFIRMADO');

      await addDriveCycle(this.basePath, cycle);
      const storedCycles = await readDriveCycles(this.basePath);

      updateAutoSaveState((state) => {
        state.driveCycles = storedCycles;

        // Only trustworthy integrated fuel contributes to cumulative economy.
        // Incomplete trips remain saved but never inject a fictitious km/L.
        const consumptionIsValid =
          cycle.fuelDataValid !== false &&
          cycle.fuelUsedL >= 0.05 &&
          cycle.avgFuelConsumptionKml > 0;
        const existingReading = state.autonomy.readings.find((item) => item.id === cycle.id);
        if (consumptionIsValid && !existingReading) {
          const previousDistance = Number(state.autonomy.cumulativeDistanceKm) || 0;
          const previousFuel = Number(state.autonomy.cumulativeFuelUsedL) || 0;
          const distanceKm = Math.max(0, Number(cycle.distanceTotalKm) || 0);
          const fuelUsedL = Math.max(0, Number(cycle.fuelUsedL) || 0);
          const cumulativeDistanceKm = previousDistance + distanceKm;
          const cumulativeFuelUsedL = previousFuel + fuelUsedL;
          const averageConsumptionKml = cumulativeFuelUsedL > 0
            ? cumulativeDistanceKm / cumulativeFuelUsedL
            : 0;
          const tankCapacityL = Number.isFinite(state.autonomy.tankCapacityL) && state.autonomy.tankCapacityL > 0
            ? state.autonomy.tankCapacityL
            : 56;
          const estimatedRangeKm = averageConsumptionKml > 0
            ? averageConsumptionKml * tankCapacityL
            : 0;

          state.autonomy = {
            ...state.autonomy,
            tankCapacityL,
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
                consumptionKml: Number((distanceKm / fuelUsedL).toFixed(3)),
                estimatedRangeKm: Number(estimatedRangeKm.toFixed(1)),
                source: 'REAL_OBD' as const,
              },
            ].slice(-200),
          };
        }
      });

      // Resolve only after the JSON recovery snapshot is confirmed. The
      // persistent index upsert is idempotent if this save has to be retried.
      const saved = await saveNow('critical');
      if (!saved) throw new Error('AUTOSAVE_DA_VIAGEM_NAO_CONFIRMADO');

      this.pendingFinalizedTrips.shift();
      const autonomy = getAutoSaveState().autonomy;
      const hadPendingWriteError = this.state.error?.startsWith('VIAGEM PENDENTE DE SALVAMENTO:') ?? false;
      this.setState({
        averageConsumptionKml: autonomy.averageConsumptionKml,
        estimatedRangeKm: autonomy.estimatedRangeKm,
        error: this.pendingFinalizedTrips.length === 0 && hadPendingWriteError ? null : this.state.error,
      });
    }
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
