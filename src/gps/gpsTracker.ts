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
const MIN_MOVEMENT_DISTANCE_M = 8;
const MAX_ACCEPTED_SEGMENT_KM = 0.25;
const STOP_SPEED_KMH = 2;
const MIN_MOVING_SAMPLES = 3;
const MAX_SEGMENT_GAP_MS = 5_000;
export const GPS_FIX_STALE_AFTER_MS = 5_000;
const GPS_STALENESS_WATCHDOG_INTERVAL_MS = 1_000;
const VEHICLE_SPEED_HINT_STALE_AFTER_MS = 5_000;

export interface GpsTrackerOptions {
  now?: () => number;
  setIntervalFn?: (handler: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
}

function movementThresholdM(sample: GpsSample, previous: GpsSample): number {
  const accuracies = [sample.accuracyM, previous.accuracyM].filter(
    (value): value is number => value != null && Number.isFinite(value),
  );
  const reportedAccuracy = accuracies.length > 0 ? Math.max(...accuracies) : 0;
  return Math.max(MIN_MOVEMENT_DISTANCE_M, reportedAccuracy * 1.5);
}

function reportedSpeedConfirmsMovement(
  gpsSpeedKmh: number | null,
  obdSpeedKmh: number | null,
): boolean {
  // OBD is preferred when available; otherwise a GPS-reported speed is used.
  // When both are absent, allow only the independently validated three-segment
  // GNSS displacement window to establish movement.
  const reportedSpeed = obdSpeedKmh ?? gpsSpeedKmh;
  if (reportedSpeed == null) return true;
  return Number.isFinite(reportedSpeed)
    && reportedSpeed >= MIN_MOVEMENT_SPEED_KMH
    && reportedSpeed <= MAX_SPEED_KMH;
}

export function haversineDistanceKm(
  a: Pick<GpsSample, 'latitude' | 'longitude'>,
  b: Pick<GpsSample, 'latitude' | 'longitude'>,
): number {
  if (
    !Number.isFinite(a.latitude) || !Number.isFinite(a.longitude) ||
    !Number.isFinite(b.latitude) || !Number.isFinite(b.longitude) ||
    Math.abs(a.latitude) > 90 || Math.abs(b.latitude) > 90 ||
    Math.abs(a.longitude) > 180 || Math.abs(b.longitude) > 180
  ) return Number.NaN;
  const R = 6371;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.min(1, Math.max(0,
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2,
  ));
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
  // Missing/negative accuracy is unknown evidence, not a precise fix.
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
  private pendingMovingStart: GpsSample | null = null;
  private movementEstablished = false;
  private vehicleSpeedHintKmh: number | null = null;
  private vehicleSpeedHintAtMs: number | null = null;
  private lastAccurateFixReceivedAtMs: number | null = null;
  private stalenessWatchdog: ReturnType<typeof setInterval> | null = null;
  private readonly now: () => number;
  private readonly setIntervalFn: (handler: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  private readonly clearIntervalFn: (handle: ReturnType<typeof setInterval>) => void;

  constructor(options: GpsTrackerOptions = {}) {
    this.now = options.now ?? Date.now;
    this.setIntervalFn = options.setIntervalFn ?? setInterval;
    this.clearIntervalFn = options.clearIntervalFn ?? clearInterval;
  }

  private getFreshVehicleSpeedHintKmh(): number | null {
    if (this.vehicleSpeedHintKmh == null || this.vehicleSpeedHintAtMs == null) return null;
    const ageMs = this.now() - this.vehicleSpeedHintAtMs;
    return ageMs >= 0 && ageMs <= VEHICLE_SPEED_HINT_STALE_AFTER_MS
      ? this.vehicleSpeedHintKmh
      : null;
  }

  private startStalenessWatchdog(): void {
    if (this.stalenessWatchdog) return;
    this.stalenessWatchdog = this.setIntervalFn(
      () => this.handleStaleFixWatchdog(),
      GPS_STALENESS_WATCHDOG_INTERVAL_MS,
    );
  }

  private stopStalenessWatchdog(): void {
    if (this.stalenessWatchdog) this.clearIntervalFn(this.stalenessWatchdog);
    this.stalenessWatchdog = null;
  }

  private handleStaleFixWatchdog(): void {
    if (!this.state.running) return;

    const fixAgeMs = this.lastAccurateFixReceivedAtMs == null
      ? Number.POSITIVE_INFINITY
      : this.now() - this.lastAccurateFixReceivedAtMs;
    if (fixAgeMs >= 0 && fixAgeMs < GPS_FIX_STALE_AFTER_MS) return;

    // Never bridge a GPS outage with accumulated/interpolated movement.
    this.previous = null;
    this.consecutiveMovingSamples = 0;
    this.pendingMovingDistanceKm = 0;
    this.pendingMovingStart = null;
    this.movementEstablished = false;

    // GPS can become stale while valid OBD speed keeps arriving. Keep these
    // sources distinct: preserve only a fresh OBD speed and mark GNSS as stale.
    const hintedSpeed = this.getFreshVehicleSpeedHintKmh();
    const speedKmh = hintedSpeed != null && hintedSpeed >= STOP_SPEED_KMH
      ? Number(hintedSpeed.toFixed(1))
      : 0;
    const speedSource: GpsTripState['speedSource'] = speedKmh > 0 ? 'OBD' : 'PARADO';
    const error = 'SINAL GPS SEM FIX ATUAL';
    const changed = this.state.currentSpeedKmh !== speedKmh
      || this.state.speedSource !== speedSource
      || this.state.signalQuality !== 'SEM_FIX'
      || this.state.lastAccuracyM !== null
      || this.state.error !== error;
    this.state = {
      ...this.state,
      currentSpeedKmh: speedKmh,
      lastAccuracyM: null,
      signalQuality: 'SEM_FIX',
      speedSource,
      error,
    };
    if (changed) this.emit();
  }

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

  async startBackgroundLocation(options: { requestPermission?: boolean } = {}): Promise<boolean> {
    const permitted = await this.requestPermission({ prompt: options.requestPermission !== false });
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
      this.lastAccurateFixReceivedAtMs = null;
      this.consecutiveMovingSamples = 0;
      this.pendingMovingDistanceKm = 0;
      this.pendingMovingStart = null;
      this.movementEstablished = false;
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
      this.startStalenessWatchdog();
      this.emit();
      return true;
    } catch (cause) {
      this.backgroundTaskRunning = false;
      this.state = {
        ...this.state,
        running: false,
        error: cause instanceof Error ? cause.message : 'NÃO FOI POSSÍVEL INICIAR O GPS EM SEGUNDO PLANO.',
      };
      this.emit();
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
    this.vehicleSpeedHintAtMs = this.vehicleSpeedHintKmh == null ? null : this.now();
  }

  private getSignalQuality(accuracyM: number | null): GpsTripState['signalQuality'] {
    if (accuracyM == null || !Number.isFinite(accuracyM) || accuracyM > MAX_ACCURACY_M) return 'SEM_FIX';
    if (accuracyM <= 5) return 'EXCELENTE';
    if (accuracyM <= 15) return 'BOA';
    return 'FRACA';
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
  }

  async requestPermission(options: { prompt?: boolean } = {}): Promise<boolean> {
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
      if (permission.status !== Location.PermissionStatus.GRANTED && options.prompt !== false) {
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

  async start(options: { resetTrip?: boolean; requestPermission?: boolean } = {}): Promise<boolean> {
    const resetTrip = options.resetTrip !== false;
    const permitted = await this.requestPermission({ prompt: options.requestPermission !== false });
    if (!permitted) {
      await this.stop();
      return false;
    }

    if ((this.subscription || this.backgroundTaskRunning) && this.state.running) return true;

    await this.stop({ resetTrip });
    this.state = {
      ...this.state,
      running: true,
      currentSpeedKmh: 0,
      maxSpeedKmh: resetTrip ? 0 : this.state.maxSpeedKmh,
      distanceKm: resetTrip ? 0 : this.state.distanceKm,
      samples: resetTrip ? 0 : this.state.samples,
      lastTimestamp: resetTrip ? null : this.state.lastTimestamp,
      lastAccuracyM: resetTrip ? null : this.state.lastAccuracyM,
      error: null,
      signalQuality: 'SEM_FIX',
      speedSource: 'PARADO',
    };
    this.previous = null;
    this.lastAccurateFixReceivedAtMs = null;
    this.consecutiveMovingSamples = 0;
    this.pendingMovingDistanceKm = 0;
    this.pendingMovingStart = null;
    this.movementEstablished = false;
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
      this.startStalenessWatchdog();
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
    if (
      !Number.isFinite(c.latitude) || !Number.isFinite(c.longitude) ||
      c.latitude < -90 || c.latitude > 90 ||
      c.longitude < -180 || c.longitude > 180 ||
      !Number.isFinite(location.timestamp) || location.timestamp <= 0 ||
      location.timestamp > this.now()
    ) return;
    if (this.state.lastTimestamp != null && location.timestamp <= this.state.lastTimestamp) return;

    const sample: GpsSample = {
      latitude: c.latitude,
      longitude: c.longitude,
      speedKmh: Number.isFinite(c.speed) && (c.speed as number) >= 0
        ? normalizeGpsSpeedKmh(c.speed)
        : null,
      accuracyM: Number.isFinite(c.accuracy) && (c.accuracy as number) >= 0
        ? c.accuracy as number
        : null,
      timestamp: location.timestamp,
    };

    const accurate = isAccurate(sample);
    if (accurate) this.lastAccurateFixReceivedAtMs = this.now();
    const vehicleSpeedHintKmh = this.getFreshVehicleSpeedHintKmh();
    let derivedSpeedKmh: number | null = null;

    if (this.previous && accurate && isAccurate(this.previous)) {
      const elapsedMs = sample.timestamp - this.previous.timestamp;
      if (elapsedMs > 0 && elapsedMs <= MAX_SEGMENT_GAP_MS) {
        const segmentKm = haversineDistanceKm(this.previous, sample);
        derivedSpeedKmh = segmentKm / (elapsedMs / 3600000);

        const segmentDistanceM = segmentKm * 1000;
        const confidenceDistanceM = movementThresholdM(sample, this.previous);
        // A 1 s GPS callback at 10 km/h moves only ~2.8 m. Requiring 8 m
        // in every segment rejects ordinary urban movement. Use a time-scaled
        // segment floor, then confirm the full three-segment window by net displacement.
        const timeBasedMinimumM = (MIN_MOVEMENT_SPEED_KMH * elapsedMs) / 3600;
        const minimumSegmentDistanceM = Math.max(
          1,
          Math.min(confidenceDistanceM * 0.5, timeBasedMinimumM),
        );
        const speedEvidenceIsConsistent = reportedSpeedConfirmsMovement(sample.speedKmh, vehicleSpeedHintKmh);
        const derivedMoving =
          segmentKm <= MAX_ACCEPTED_SEGMENT_KM &&
          segmentDistanceM >= minimumSegmentDistanceM &&
          derivedSpeedKmh >= MIN_MOVEMENT_SPEED_KMH &&
          derivedSpeedKmh <= MAX_SPEED_KMH &&
          speedEvidenceIsConsistent;

        if (derivedMoving) {
          if (this.consecutiveMovingSamples === 0) this.pendingMovingStart = this.previous;
          this.consecutiveMovingSamples += 1;
          this.pendingMovingDistanceKm += segmentKm;

          const start = this.pendingMovingStart ?? this.previous;
          const netDisplacementKm = haversineDistanceKm(start, sample);
          const requiredNetDisplacementM = movementThresholdM(sample, start);
          if (
            this.consecutiveMovingSamples >= MIN_MOVING_SAMPLES &&
            Number.isFinite(netDisplacementKm) &&
            netDisplacementKm * 1000 >= requiredNetDisplacementM
          ) {
            this.state.distanceKm = Number(
              (this.state.distanceKm + this.pendingMovingDistanceKm).toFixed(3),
            );
            this.pendingMovingDistanceKm = 0;
            this.pendingMovingStart = sample;
            this.consecutiveMovingSamples = 0;
            this.movementEstablished = true;
          } else if (
            this.consecutiveMovingSamples >= MIN_MOVING_SAMPLES &&
            vehicleSpeedHintKmh == null &&
            sample.speedKmh == null
          ) {
            // With no independent speed value, do not accumulate small GPS
            // drifts across multiple windows until they look like a trip.
            this.consecutiveMovingSamples = 0;
            this.pendingMovingDistanceKm = 0;
            this.pendingMovingStart = null;
            this.movementEstablished = false;
          }
        } else {
          this.consecutiveMovingSamples = 0;
          this.pendingMovingDistanceKm = 0;
          this.pendingMovingStart = null;
          this.movementEstablished = false;
        }
      } else if (elapsedMs > MAX_SEGMENT_GAP_MS) {
        this.consecutiveMovingSamples = 0;
        this.pendingMovingDistanceKm = 0;
        this.pendingMovingStart = null;
        this.movementEstablished = false;
      }
    } else if (!accurate) {
      // A low/unknown-accuracy fix breaks the consecutive-confirmation window.
      this.consecutiveMovingSamples = 0;
      this.pendingMovingDistanceKm = 0;
      this.pendingMovingStart = null;
      this.movementEstablished = false;
    }

    const movementConfirmed =
      this.previous != null &&
      accurate &&
      isAccurate(this.previous) &&
      derivedSpeedKmh != null &&
      derivedSpeedKmh >= MIN_MOVEMENT_SPEED_KMH &&
      derivedSpeedKmh <= MAX_SPEED_KMH &&
      reportedSpeedConfirmsMovement(sample.speedKmh, vehicleSpeedHintKmh) &&
      this.movementEstablished;
    let speedKmh = movementConfirmed
      ? (vehicleSpeedHintKmh != null
        ? vehicleSpeedHintKmh
        : sample.speedKmh != null && sample.speedKmh <= MAX_SPEED_KMH
          ? sample.speedKmh
          : (derivedSpeedKmh ?? 0))
      : 0;
    if (!Number.isFinite(speedKmh) || speedKmh < STOP_SPEED_KMH || speedKmh > MAX_SPEED_KMH) speedKmh = 0;
    const speedSource: GpsTripState['speedSource'] = speedKmh <= 0
      ? 'PARADO'
      : vehicleSpeedHintKmh != null && vehicleSpeedHintKmh >= MIN_MOVEMENT_SPEED_KMH
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
    this.stopStalenessWatchdog();
    this.lastAccurateFixReceivedAtMs = null;
    this.vehicleSpeedHintAtMs = null;
    this.vehicleSpeedHintKmh = null;
    await this.stopBackgroundLocation();
    this.subscription?.remove();
    this.subscription = null;
    this.previous = null;
    this.consecutiveMovingSamples = 0;
    this.pendingMovingDistanceKm = 0;
    this.pendingMovingStart = null;
    this.movementEstablished = false;

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
