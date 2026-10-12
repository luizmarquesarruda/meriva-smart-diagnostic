import { gpsTracker } from '../gps';
import type { SharedObdConnection } from '../obd/sharedConnection';
import { getSharedObdConnection, getSharedObdStatus, subscribeSharedObd } from '../obd/sharedConnection';
import { addDriveCycle, readDriveCycles } from '../storage/driveCycleStorage';
import { forceSaveOnObdEvent, registerObdQuery } from '../meriva/autosaveIntegration';
import { getAutoSaveState, updateAutoSaveState, initAutoSave } from '../meriva/autosaveManager';
import { RealTripRecorder, shouldFinalizeStoppedTrip } from './tripRecorder';
import { estimateRangeFromFuelLevel, fuelLevelPercentToLiters, isFuelReserve } from './fuelLevel';
import { getLivePidTrend, resetLiveTelemetry } from '../obd/liveTelemetry';
import { estimateFuelRateLph, type FuelRateSource } from '../obd/fuelConsumption';
import { flushObdPersistence } from '../meriva/autosaveIntegration';

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
  instantaneousConsumptionSource: null,
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
  private pollCycleNumber = 0;
  private stoppedSinceMs: number | null = null;
  private readonly pidFailureCount = new Map<string, number>();
  private readonly pidNextEligibleAt = new Map<string, number>();
  private lastFuelRateLph: number | null = null;
  private lastFuelRateSource: FuelRateSource | null = null;
  private lastFuelRateAtMs = 0;
  private state: AutoTripServiceState = { ...INITIAL_STATE };

  private canQueryPid(pid: string): boolean {
    return Date.now() >= (this.pidNextEligibleAt.get(pid) ?? 0);
  }

  private notePidResult(pid: string, valid: boolean): void {
    if (valid) {
      this.pidFailureCount.delete(pid);
      this.pidNextEligibleAt.delete(pid);
      return;
    }
    const failures = (this.pidFailureCount.get(pid) ?? 0) + 1;
    this.pidFailureCount.set(pid, failures);
    const delayMs = Math.min(30_000, 1_000 * (2 ** Math.min(failures - 1, 5)));
    this.pidNextEligibleAt.set(pid, Date.now() + delayMs);
  }

  private cacheFuelRate(rateLph: number, source: FuelRateSource): void {
    if (!Number.isFinite(rateLph) || rateLph < 0) return;
    this.lastFuelRateLph = rateLph;
    this.lastFuelRateSource = source;
    this.lastFuelRateAtMs = Date.now();
  }

  private resetPollingCaches(): void {
    this.pidFailureCount.clear();
    this.pidNextEligibleAt.clear();
    this.lastFuelRateLph = null;
    this.lastFuelRateSource = null;
    this.lastFuelRateAtMs = 0;
  }

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
    await flushObdPersistence(this.basePath);
    await this.finalizeRecorder();
    this.state = { ...INITIAL_STATE };
    this.emit();
  }

  private async applyConnection(connection: SharedObdConnection | null): Promise<void> {
    await this.stopCurrentLoop();
    await flushObdPersistence(this.basePath);
    await this.finalizeRecorder();

    resetLiveTelemetry();
    this.telemetryCursor = 0;
    this.pollCycleNumber = 0;
    this.resetPollingCaches();

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
      this.pollCycleNumber += 1;

      try {
        let fuelRateLph: number | null = null;
        let fuelRateSource: FuelRateSource | undefined;
        let fuelLevelPercent: number | null = null;
        let obdSpeedKmh: number | null = null;
        let rpm: number | null = null;
        const queriedPidsThisCycle = new Set<string>();
        if (obdSpeedSupported) gpsTracker.setVehicleSpeedHintKmh(null);

        // Caminho crítico primeiro: velocidade e RPM alimentam o cockpit e
        // a detecção de movimento antes das consultas secundárias.
        if (obdSpeedSupported) {
          const speedResult = await connection.session.queryPid('010D');
          await registerObdQuery(this.basePath, speedResult, 'REAL', undefined, { deferPersistence: true });
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
          await registerObdQuery(this.basePath, rpmResult, 'REAL', undefined, { deferPersistence: true });
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
        if (this.state.fuelSupported && this.canQueryPid('015E')) {
          const fuelResult = await connection.session.queryPid('015E');
          queriedPidsThisCycle.add('015E');
          await registerObdQuery(this.basePath, fuelResult, 'REAL', undefined, { deferPersistence: true });
          const measuredFuelValid = fuelResult.commandStatus === 'OK' &&
            fuelResult.parsed.status === 'RESPONDEU' &&
            fuelResult.parsed.unit === 'L/h' &&
            fuelResult.parsed.value != null &&
            Number.isFinite(fuelResult.parsed.value) &&
            fuelResult.parsed.value >= 0;
          this.notePidResult('015E', measuredFuelValid);
          if (measuredFuelValid) {
            fuelRateLph = fuelResult.parsed.value;
            fuelRateSource = 'MEASURED_015E';
            this.cacheFuelRate(fuelRateLph, fuelRateSource);
          }
        }

        // O nível do tanque muda lentamente: consultar a cada quatro ciclos
        // reduz tráfego serial sem limpar o último valor válido da interface.
        if (this.state.fuelLevelSupported && this.pollCycleNumber % 4 === 1 && this.canQueryPid('012F')) {
          const fuelLevelResult = await connection.session.queryPid('012F');
          queriedPidsThisCycle.add('012F');
          await registerObdQuery(this.basePath, fuelLevelResult, 'REAL', undefined, { deferPersistence: true });
          const fuelLevelValid = fuelLevelResult.commandStatus === 'OK' &&
            fuelLevelResult.parsed.status === 'RESPONDEU' &&
            fuelLevelResult.parsed.unit === '%' &&
            fuelLevelResult.parsed.value != null &&
            Number.isFinite(fuelLevelResult.parsed.value) &&
            fuelLevelResult.parsed.value >= 0 &&
            fuelLevelResult.parsed.value <= 100;
          this.notePidResult('012F', fuelLevelValid);
          if (fuelLevelValid) fuelLevelPercent = fuelLevelResult.parsed.value;
          else fuelLevelPercent = this.state.fuelLevelPercent;
        } else {
          fuelLevelPercent = this.state.fuelLevelPercent;
        }

        const fuelFallbackDue = this.lastFuelRateAtMs === 0 ||
          Date.now() - this.lastFuelRateAtMs >= 5_000 ||
          this.pollCycleNumber % 4 === 1;

        if (
          fuelRateLph == null &&
          fuelFallbackDue &&
          connection.supportedPids.includes('0110') &&
          this.canQueryPid('0110')
        ) {
          // Fallback MAF é amostrado com menor cadência que velocidade/RPM.
          const mafResult = await connection.session.queryPid('0110');
          queriedPidsThisCycle.add('0110');
          await registerObdQuery(this.basePath, mafResult, 'REAL', undefined, { deferPersistence: true });
          const mafGs = mafResult.parsed.status === 'RESPONDEU' ? mafResult.parsed.value : null;
          const mafValid = mafResult.commandStatus === 'OK' && mafGs != null && Number.isFinite(mafGs) && mafGs >= 0;
          this.notePidResult('0110', mafValid);
          if (mafValid) {
            const estimate = estimateFuelRateLph({ mafGs });
            if (estimate) {
              fuelRateLph = estimate.rateLph;
              fuelRateSource = estimate.source;
              this.cacheFuelRate(fuelRateLph, fuelRateSource);
            }
          }
        }

        if (
          fuelRateLph == null &&
          fuelFallbackDue &&
          connection.supportedPids.includes('010B') &&
          connection.supportedPids.includes('010F') &&
          connection.supportedPids.includes('010C') &&
          this.canQueryPid('010B') &&
          this.canQueryPid('010F')
        ) {
          // MAP/IAT nunca competem com as leituras primárias e não repetem PID neste ciclo.
          const mapResult = await connection.session.queryPid('010B');
          queriedPidsThisCycle.add('010B');
          const iatResult = await connection.session.queryPid('010F');
          queriedPidsThisCycle.add('010F');
          await registerObdQuery(this.basePath, mapResult, 'REAL', undefined, { deferPersistence: true });
          await registerObdQuery(this.basePath, iatResult, 'REAL', undefined, { deferPersistence: true });
          const mapKpa = mapResult.parsed.status === 'RESPONDEU' ? mapResult.parsed.value : null;
          const intakeAirTempC = iatResult.parsed.status === 'RESPONDEU' ? iatResult.parsed.value : null;
          const mapValid = mapResult.commandStatus === 'OK' && mapKpa != null && Number.isFinite(mapKpa) && mapKpa > 0;
          const iatValid = iatResult.commandStatus === 'OK' && intakeAirTempC != null && Number.isFinite(intakeAirTempC);
          this.notePidResult('010B', mapValid);
          this.notePidResult('010F', iatValid);
          const estimate = estimateFuelRateLph({
            mapKpa: mapValid ? mapKpa : null,
            rpm,
            intakeAirTempC: iatValid ? intakeAirTempC : null,
            displacementCm3: getAutoSaveState().vehicle?.displacementCm3 ?? 1389,
          });
          if (estimate) {
            fuelRateLph = estimate.rateLph;
            fuelRateSource = estimate.source;
            this.cacheFuelRate(fuelRateLph, fuelRateSource);
          }
        }

        // Retain only a very recent valid rate through skipped/backoff cycles.
        if (
          fuelRateLph == null &&
          this.lastFuelRateLph != null &&
          Date.now() - this.lastFuelRateAtMs <= 5_000
        ) {
          fuelRateLph = this.lastFuelRateLph;
          fuelRateSource = this.lastFuelRateSource ?? undefined;
        }

        // Quando 010D existe, o GPS recebe a velocidade da ECU como confirmação.
        gpsTracker.setVehicleSpeedHintKmh(obdSpeedSupported ? obdSpeedKmh : null);

        // Mantém um PID secundário por ciclo para tendências sem monopolizar o ELM.
        const telemetryCandidates = ['0105', '010B', '0111', '0142'];
        const supportedTelemetry = telemetryCandidates.filter((pid) =>
          connection.supportedPids.includes(pid) &&
          !queriedPidsThisCycle.has(pid) &&
          this.canQueryPid(pid)
        );
        if (supportedTelemetry.length > 0) {
          const telemetryPid = supportedTelemetry[this.telemetryCursor % supportedTelemetry.length];
          this.telemetryCursor += 1;
          const telemetryResult = await connection.session.queryPid(telemetryPid);
          await registerObdQuery(this.basePath, telemetryResult, 'REAL', undefined, { deferPersistence: true });
          const telemetryValid = telemetryResult.commandStatus === 'OK' &&
            telemetryResult.parsed.status === 'RESPONDEU' &&
            telemetryResult.parsed.value != null &&
            Number.isFinite(telemetryResult.parsed.value);
          this.notePidResult(telemetryPid, telemetryValid);
        }

        const gps = gpsTracker.getState();
        const vehicleSpeedKmh = obdSpeedKmh ?? gps.currentSpeedKmh;
        // If RPM is temporarily unavailable, valid vehicle speed is still movement evidence.
        const moving = vehicleSpeedKmh > 0 && (rpm == null || rpm > 0);

        if (moving) {
          this.stoppedSinceMs = null;
          if (!this.recorder) {
            this.recorder = new RealTripRecorder(Date.now(), gps.distanceKm);
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
          fuelRateLph != null && fuelRateLph > 0 && tripVehicleSpeedKmh > 0
            ? tripVehicleSpeedKmh / fuelRateLph
            : null;

        this.setState({
          connected: true,
          active: Boolean(recorder),
          distanceKm: tripDistanceKm,
          fuelUsedL: tripFuelUsedL,
          consumptionKml: tripConsumptionKml,
          instantaneousConsumptionKml,
          instantaneousConsumptionSource: instantaneousConsumptionKml != null ? (fuelRateSource ?? null) : null,
          fuelLevelPercent,
          fuelRemainingL: fuelLevelPercentToLiters(fuelLevelPercent),
          fuelReserve: isFuelReserve(fuelLevelPercent),
          estimatedRangeKm: fuelLevelPercent != null
            ? (estimateRangeFromFuelLevel(
                fuelLevelPercent,
                tripConsumptionKml ?? this.state.averageConsumptionKml,
              ) ?? this.state.estimatedRangeKm)
            : this.state.estimatedRangeKm,
          error: rpm === 0 && obdSpeedKmh === 0 && fuelRateLph == null
            ? 'MOTOR DESLIGADO? / ECU SEM TELEMETRIA VÁLIDA'
            : fuelRateSource && fuelRateSource !== 'MEASURED_015E'
              ? 'CONSUMO ESTIMADO POR ' + fuelRateSource.replace('ESTIMATED_', '')
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
      // Trips remain in history even when fuel telemetry is insufficient, but
      // they must not contaminate cumulative consumption/autonomy calculations.
      const consumptionIsValid = cycle.fuelDataValid !== false && cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0;
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
