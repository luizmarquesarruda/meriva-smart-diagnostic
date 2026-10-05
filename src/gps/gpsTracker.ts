import * as Location from 'expo-location';

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
}

export type GpsListener = (state: GpsTripState) => void;

const MIN_ACCURACY_M = 60;
const MAX_SPEED_KMH = 220;
const MIN_MOVEMENT_SPEED_KMH = 2;
const MIN_MOVEMENT_DISTANCE_M = 5;
const STOP_SPEED_KMH = 2;
const MIN_MOVING_SAMPLES = 2;
const MAX_SEGMENT_GAP_MS = 5_000;

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
  return sample.accuracyM == null || sample.accuracyM <= MIN_ACCURACY_M;
}

export class GpsTracker {
  private subscription: Location.LocationSubscription | null = null;
  private previous: GpsSample | null = null;
  private readonly listeners = new Set<GpsListener>();
  private consecutiveMovingSamples = 0;

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
  };

  subscribe(listener: GpsListener): () => void {
    this.listeners.add(listener);
    listener({ ...this.state });
    return () => this.listeners.delete(listener);
  }

  getState(): GpsTripState {
    return { ...this.state };
  }

  private emit(): void {
    const snapshot = { ...this.state };
    for (const listener of this.listeners) listener(snapshot);
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

    if (this.subscription && this.state.running) return true;

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
    };
    this.previous = null;
    this.consecutiveMovingSamples = 0;
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

  private handleLocation(location: Location.LocationObject): void {
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
    let derivedSpeedKmh: number | null = null;

    if (this.previous && accurate && isAccurate(this.previous)) {
      const elapsedMs = sample.timestamp - this.previous.timestamp;
      if (elapsedMs > 0 && elapsedMs <= MAX_SEGMENT_GAP_MS) {
        const segmentKm = haversineDistanceKm(this.previous, sample);
        derivedSpeedKmh = segmentKm / (elapsedMs / 3600000);

        const segmentDistanceM = segmentKm * 1000;
        const derivedMoving =
          segmentDistanceM >= MIN_MOVEMENT_DISTANCE_M &&
          derivedSpeedKmh >= MIN_MOVEMENT_SPEED_KMH &&
          derivedSpeedKmh <= MAX_SPEED_KMH;

        if (derivedMoving) {
          this.consecutiveMovingSamples += 1;
        } else {
          this.consecutiveMovingSamples = 0;
        }

        // Distância só entra no odômetro GPS depois de duas amostras consecutivas
        // que comprovem movimento. Isso elimina o "carro andando parado" causado
        // por jitter e velocidade stale do Android.
        if (
          segmentKm <= 0.25 &&
          derivedMoving &&
          this.consecutiveMovingSamples >= MIN_MOVING_SAMPLES
        ) {
          this.state.distanceKm = Number(
            (this.state.distanceKm + segmentKm).toFixed(3),
          );
        }
      }
    }

    const movementConfirmed =
      this.previous != null &&
      accurate &&
      isAccurate(this.previous) &&
      derivedSpeedKmh != null &&
      derivedSpeedKmh >= MIN_MOVEMENT_SPEED_KMH &&
      derivedSpeedKmh <= MAX_SPEED_KMH &&
      this.consecutiveMovingSamples >= MIN_MOVING_SAMPLES;
    let speedKmh = movementConfirmed
      ? (sample.speedKmh != null && sample.speedKmh <= MAX_SPEED_KMH
        ? Math.max(sample.speedKmh, derivedSpeedKmh ?? 0)
        : (derivedSpeedKmh ?? 0))
      : 0;
    if (!Number.isFinite(speedKmh) || speedKmh < STOP_SPEED_KMH || speedKmh > MAX_SPEED_KMH) speedKmh = 0;

    if (accurate) this.previous = sample;
    this.state = {
      ...this.state,
      samples: this.state.samples + 1,
      currentSpeedKmh: Number(speedKmh.toFixed(1)),
      maxSpeedKmh: Number(Math.max(this.state.maxSpeedKmh, speedKmh).toFixed(1)),
      lastTimestamp: sample.timestamp,
      lastAccuracyM: sample.accuracyM,
      error: null,
    };
    this.emit();
  }

  async stop(options: { resetTrip?: boolean } = {}): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    this.previous = null;
    this.consecutiveMovingSamples = 0;

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
      };
    } else {
      this.state = { ...this.state, running: false, currentSpeedKmh: 0 };
    }
    this.emit();
  }
}

export const gpsTracker = new GpsTracker();
