import * as Location from 'expo-location';

export const BACKGROUND_LOCATION_TASK_NAME = 'meriva-smart-background-location';

export interface GpsSample {
  latitude: number;
  longitude: number;
  speedKmh: number | null;
  accuracyM: number | null;
  timestamp: number;
}

export interface GpsTripState {
  running: boolean;
  permissionGranted: boolean;
  currentSpeedKmh: number;
  maxSpeedKmh: number;
  distanceKm: number;
  samples: number;
  lastTimestamp: number | null;
  lastAccuracyM: number | null;
  error: string | null;
  signalQuality: 'SEM_FIX' | 'FRACA' | 'BOA' | 'EXCELENTE';
  speedSource: 'PARADO' | 'GPS' | 'OBD';
}

export type GpsListener = (state: GpsTripState) => void;

const MAX_ACCURACY_M = 30;
const MAX_SPEED_KMH = 220;
const MIN_MOVEMENT_SPEED_KMH = 5;
const MIN_MOVEMENT_DISTANCE_M = 12;
const STOP_SPEED_KMH = 2;
const MIN_MOVING_SAMPLES = 3;
const MAX_SEGMENT_GAP_MS = 5_000;

function movementThresholdM(sample: GpsSample, previous: GpsSample): number {
  const accuracies = [sample.accuracyM, previous.accuracyM].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  const reportedAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : 0;
  return Math.max(MIN_MOVEMENT_DISTANCE_M, reportedAccuracy * 1.5);
}

export function haversineDistanceKm(
  a: Pick<GpsSample, 'latitude' | 'longitude'>,
  b: Pick<GpsSample, 'latitude' | 'longitude'>,
): number {
  const R = 6371;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function calculateConsumptionKml(distanceKm: number, fuelUsedL: number): number | null {
  if (
    !Number.isFinite(distanceKm) ||
    distanceKm <= 0 ||
    !Number.isFinite(fuelUsedL) ||
    fuelUsedL <= 0
  ) {
    return null;
  }
  return distanceKm / fuelUsedL;
}

export function normalizeGpsSpeedKmh(speedMs: number | null | undefined): number {
  return Number.isFinite(speedMs) && (speedMs as number) >= 0
    ? (speedMs as number) * 3.6
    : 0;
}

function isAccurate(sample: GpsSample): boolean {
  return sample.accuracyM != null &&
    Number.isFinite(sample.accuracyM) &&
    sample.accuracyM >= 0 &&
    sample.accuracyM <= MAX_ACCURACY_M;
}

export class GpsTracker {
  private subscription: Location.LocationSubscription | null = null;
  private backgroundTaskRunning = false;
  private previous: GpsSample | null = null;
  private readonly listeners = new Set<GpsListener>();
  private consecutiveMovingSamples = 0;
  private pendingMovingDistanceKm = 0;
  private movementCandidateStart: GpsSample | null = null;
  private lastDistanceAnchor: GpsSample | null = null;
  private movingConfirmed = false;
  private vehicleSpeedHintKmh: number | null = null;

  private state: GpsTripState = {
    running: false,
    permissionGranted: false,
    currentSpeedKmh: 0,
    maxSpeedKmh: 0,
    distanceKm: 0,
    samples: 0,
    lastTimestamp: null,
    lastAccuracyM: null,
    error: null,
    signalQuality: 'SEM_FIX',
    speedSource: 'PARADO',
  };

  subscribe(listener: GpsListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  getState(): GpsTripState {
    return { ...this.state };
  }

  setBackgroundTaskError(message: string): void {
    this.state = { ...this.state, error: message || 'ERRO NO SERVIÇO GPS EM SEGUNDO PLANO.' };
    this.emit();
  }

  private async restoreForegroundWatcherAfterBackgroundFailure(reason: string): Promise<boolean> {
    try {
      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (location) => this.handleLocation(location),
      );
      this.state = {
        ...this.state,
        running: true,
        error: `GPS em segundo plano indisponível (${reason}); monitoramento mantido em primeiro plano.`,
      };
      this.emit();
      return true;
    } catch (cause) {
      this.subscription = null;
      this.state = {
        ...this.state,
        running: false,
        error: `Falha no GPS em segundo plano: ${reason}. Também não foi possível restaurar o GPS em primeiro plano: ${cause instanceof Error ? cause.message : 'erro desconhecido'}.`,
      };
      this.emit();
      return false;
    }
  }

  async startBackgroundLocation(): Promise<boolean> {
    const permitted = await this.requestPermission();
    if (!permitted) return false;

    if (this.backgroundTaskRunning) return true;

    // Ao assumir o Foreground Service, não manter o watcher de foreground em paralelo:
    // isso duplicaria callbacks e poderia inflar samples/distância.
    this.subscription?.remove();
    this.subscription = null;

    if (!this.state.running) {
      this.state = {
        ...this.state,
        running: true,
        currentSpeedKmh: 0,
        maxSpeedKmh: 0,
        distanceKm: 0,
        samples: 0,
        lastTimestamp: null,
        lastAccuracyM: null,
        error: null,
        signalQuality: 'SEM_FIX',
        speedSource: 'PARADO',
      };
      this.previous = null;
      this.resetMovementTracking();
      this.emit();
    }

    try {
      const alreadyStarted = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (!alreadyStarted) {
        await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME, {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
          pausesUpdatesAutomatically: false,
          foregroundService: {
            notificationTitle: 'MERIVA SMART — Diagnóstico OBD',
            notificationBody: 'Monitoramento OBD e GPS ativo em segundo plano.',
            notificationColor: '#1557a6',
          },
        });
      }
      this.backgroundTaskRunning = true;
      this.state = { ...this.state, running: true, error: null };
      this.emit();
      return true;
    } catch (cause) {
      this.backgroundTaskRunning = false;
      const reason = cause instanceof Error ? cause.message : 'NÃO FOI POSSÍVEL INICIAR O GPS EM SEGUNDO PLANO.';
      // Um start nativo pode falhar depois de registrar parcialmente a tarefa.
      // Limpar o estado nativo antes de reativar o watcher evita callbacks duplicados.
      try {
        const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
        if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      } catch {
        // O watcher de primeiro plano ainda será tentado; o erro original permanece.
      }
      await this.restoreForegroundWatcherAfterBackgroundFailure(reason);
      // false informa que o serviço background não foi iniciado, mesmo quando o fallback funciona.
      return false;
    }
  }

  async stopBackgroundLocation(): Promise<void> {
    try {
      // O estado nativo pode sobreviver a um reload/recriação do contexto JS.
      // Por isso, sempre consultar o TaskManager em vez de depender apenas do flag local.
      const started = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
      if (started) await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME);
    } catch (cause) {
      console.warn('[gps] falha ao parar localização em segundo plano:', cause instanceof Error ? cause.message : cause);
    } finally {
      this.backgroundTaskRunning = false;
    }
  }

  isBackgroundLocationRunning(): boolean {
    return this.backgroundTaskRunning;
  }

  setVehicleSpeedHintKmh(speedKmh: number | null): void {
    this.vehicleSpeedHintKmh =
      speedKmh != null && Number.isFinite(speedKmh) && speedKmh >= 0 && speedKmh <= MAX_SPEED_KMH
        ? speedKmh
        : null;
  }

  private getSignalQuality(accuracyM: number | null): GpsTripState['signalQuality'] {
    if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM < 0 || accuracyM > MAX_ACCURACY_M) return 'SEM_FIX';
    if (accuracyM <= 5) return 'EXCELENTE';
    if (accuracyM <= 15) return 'BOA';
    return 'FRACA';
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
  }

  private resetMovementTracking(): void {
    this.consecutiveMovingSamples = 0;
    this.pendingMovingDistanceKm = 0;
    this.movementCandidateStart = null;
    this.lastDistanceAnchor = null;
    this.movingConfirmed = false;
  }

  private commitPendingDistance(): void {
    if (this.movingConfirmed && this.pendingMovingDistanceKm > 0) {
      this.state.distanceKm = Number((this.state.distanceKm + this.pendingMovingDistanceKm).toFixed(3));
    }
    this.pendingMovingDistanceKm = 0;
  }

  async requestPermission(): Promise<boolean> {
    try {
      if (!(await Location.hasServicesEnabledAsync())) {
        this.state = {
          ...this.state,
          permissionGranted: false,
          error: 'SERVIÇO DE LOCALIZAÇÃO DESLIGADO NO APARELHO.',
        };
        this.emit();
        return false;
      }

      let permission = await Location.getForegroundPermissionsAsync();
      if (permission.status !== Location.PermissionStatus.GRANTED) {
        permission = await Location.requestForegroundPermissionsAsync();
      }

      const granted = permission.status === Location.PermissionStatus.GRANTED;
      this.state = {
        ...this.state,
        permissionGranted: granted,
        error: granted ? null : 'PERMISSÃO DE LOCALIZAÇÃO NÃO CONCEDIDA.',
      };
      this.emit();
      return granted;
    } catch (cause) {
      this.state = {
        ...this.state,
        permissionGranted: false,
        error: cause instanceof Error ? cause.message : 'NÃO FOI POSSÍVEL VERIFICAR O GPS.',
      };
      this.emit();
      return false;
    }
  }

  async start(): Promise<boolean> {
    const permitted = await this.requestPermission();
    if (!permitted) {
      await this.stop();
      return false;
    }

    if ((this.subscription || this.backgroundTaskRunning) && this.state.running) return true;

    await this.stop({ resetTrip: true });
    this.state = {
      ...this.state,
      running: true,
      currentSpeedKmh: 0,
      maxSpeedKmh: 0,
      distanceKm: 0,
      samples: 0,
      lastTimestamp: null,
      lastAccuracyM: null,
      error: null,
      signalQuality: 'SEM_FIX',
      speedSource: 'PARADO',
    };
    this.previous = null;
    this.resetMovementTracking();
    this.emit();

    try {
      this.subscription = await Location.watchPositionAsync(
        {
          accuracy: Location.Accuracy.BestForNavigation,
          timeInterval: 1000,
          distanceInterval: 1,
          mayShowUserSettingsDialog: true,
        },
        (location) => this.handleLocation(location),
      );
      return true;
    } catch (cause) {
      this.subscription = null;
      this.previous = null;
      this.state = {
        ...this.state,
        running: false,
        currentSpeedKmh: 0,
        error: cause instanceof Error
          ? cause.message
          : 'NÃO FOI POSSÍVEL INICIAR O MONITORAMENTO GPS.',
      };
      this.emit();
      return false;
    }
  }

  handleLocation(location: Location.LocationObject): void {
    const c = location.coords;
    if (!Number.isFinite(c.latitude) || !Number.isFinite(c.longitude)) return;

    const sample: GpsSample = {
      latitude: c.latitude,
      longitude: c.longitude,
      speedKmh: Number.isFinite(c.speed) && (c.speed as number) >= 0
        ? normalizeGpsSpeedKmh(c.speed)
        : null,
      accuracyM: c.accuracy ?? null,
      timestamp: Number.isFinite(location.timestamp) ? location.timestamp : Date.now(),
    };

    const accurate = isAccurate(sample);
    const previous = this.previous;
    let derivedSpeedKmh: number | null = null;

    if (previous && accurate && isAccurate(previous)) {
      const elapsedMs = sample.timestamp - previous.timestamp;
      if (elapsedMs > 0 && elapsedMs <= MAX_SEGMENT_GAP_MS) {
        const segmentKm = haversineDistanceKm(previous, sample);
        derivedSpeedKmh = segmentKm / (elapsedMs / 3_600_000);
        // Nunca inferir velocidade apenas da diferença de coordenadas: deriva do GPS
        // pode parecer movimento. Exigir velocidade reportada pelo GPS ou confirmada pela ECU.
        const speedEvidenceKmh = this.vehicleSpeedHintKmh != null
          ? this.vehicleSpeedHintKmh
          : sample.speedKmh;
        const speedEvidenceValid =
          speedEvidenceKmh != null &&
          Number.isFinite(speedEvidenceKmh) &&
          speedEvidenceKmh >= MIN_MOVEMENT_SPEED_KMH &&
          speedEvidenceKmh <= MAX_SPEED_KMH;
        const plausibleSegment =
          segmentKm > 0 &&
          segmentKm <= 0.25 &&
          derivedSpeedKmh >= MIN_MOVEMENT_SPEED_KMH &&
          derivedSpeedKmh <= MAX_SPEED_KMH &&
          speedEvidenceValid;

        if (plausibleSegment) {
          if (!this.movingConfirmed) {
            if (!this.movementCandidateStart) {
              this.movementCandidateStart = previous;
              this.consecutiveMovingSamples = 0;
              this.pendingMovingDistanceKm = 0;
            }

            this.consecutiveMovingSamples += 1;
            this.pendingMovingDistanceKm += segmentKm;

            // Confirma o deslocamento pela distância acumulada entre posições,
            // não exigindo que cada fix isolado supere a margem de erro do GPS.
            const candidateDistanceM =
              haversineDistanceKm(this.movementCandidateStart, sample) * 1000;
            if (
              this.consecutiveMovingSamples >= MIN_MOVING_SAMPLES &&
              candidateDistanceM >= movementThresholdM(sample, this.movementCandidateStart)
            ) {
              this.state.distanceKm = Number(
                (this.state.distanceKm + this.pendingMovingDistanceKm).toFixed(3),
              );
              this.pendingMovingDistanceKm = 0;
              this.movingConfirmed = true;
              this.lastDistanceAnchor = sample;
              this.movementCandidateStart = null;
            }
          } else {
            const anchor = this.lastDistanceAnchor ?? previous;
            this.pendingMovingDistanceKm += segmentKm;
            const confirmedDistanceM = haversineDistanceKm(anchor, sample) * 1000;
            if (confirmedDistanceM >= movementThresholdM(sample, anchor)) {
              this.commitPendingDistance();
              this.lastDistanceAnchor = sample;
            }
          }
        } else {
          const movementStopped =
            !speedEvidenceValid || derivedSpeedKmh < MIN_MOVEMENT_SPEED_KMH;
          const impossibleJump = segmentKm > 0.25 || derivedSpeedKmh > MAX_SPEED_KMH;
          if (this.movingConfirmed && movementStopped && !impossibleJump) {
            // Preserva a última parte de deslocamento já sustentada por amostras válidas.
            this.commitPendingDistance();
          }
          this.resetMovementTracking();
        }
      } else {
        // Não interpolar através de gaps/timestamps inválidos; conserva só o trecho
        // já confirmado antes de reiniciar a janela de movimento.
        if (this.movingConfirmed) this.commitPendingDistance();
        this.resetMovementTracking();
      }
    }

    const movementConfirmed = accurate && this.movingConfirmed;
    let speedKmh = 0;
    if (movementConfirmed) {
      speedKmh = this.vehicleSpeedHintKmh != null
        ? this.vehicleSpeedHintKmh
        : sample.speedKmh != null
          ? sample.speedKmh
          : (derivedSpeedKmh ?? 0);
    }
    if (!Number.isFinite(speedKmh) || speedKmh < STOP_SPEED_KMH || speedKmh > MAX_SPEED_KMH) {
      speedKmh = 0;
    }
    const speedSource: GpsTripState['speedSource'] = speedKmh <= 0
      ? 'PARADO'
      : this.vehicleSpeedHintKmh != null && this.vehicleSpeedHintKmh >= MIN_MOVEMENT_SPEED_KMH
        ? 'OBD'
        : 'GPS';

    if (accurate) this.previous = sample;
    this.state = {
      ...this.state,
      samples: this.state.samples + 1,
      currentSpeedKmh: Number(speedKmh.toFixed(1)),
      maxSpeedKmh: Number(Math.max(this.state.maxSpeedKmh, speedKmh).toFixed(1)),
      lastTimestamp: sample.timestamp,
      lastAccuracyM: sample.accuracyM,
      error: null,
      signalQuality: this.getSignalQuality(sample.accuracyM),
      speedSource,
    };
    this.emit();
  }

  async stop(options: { resetTrip?: boolean } = {}): Promise<void> {
    await this.stopBackgroundLocation();
    this.subscription?.remove();
    this.subscription = null;
    this.commitPendingDistance();
    this.previous = null;
    this.resetMovementTracking();
    this.vehicleSpeedHintKmh = null;

    if (options.resetTrip) {
      this.state = {
        ...this.state,
        running: false,
        currentSpeedKmh: 0,
        maxSpeedKmh: 0,
        distanceKm: 0,
        samples: 0,
        lastTimestamp: null,
        lastAccuracyM: null,
        signalQuality: 'SEM_FIX',
        speedSource: 'PARADO',
      };
    } else {
      this.state = { ...this.state, running: false, currentSpeedKmh: 0, speedSource: 'PARADO' };
    }
    this.emit();
  }
}

export const gpsTracker = new GpsTracker();
