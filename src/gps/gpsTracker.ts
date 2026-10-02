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
const MAX_SEGMENT_SPEED_KMH = 220;
const MAX_VALID_SPEED_KMH = 220;

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

function validCoordinate(value: number): boolean {
  return Number.isFinite(value);
}

export class GpsTracker {
  private subscription: Location.LocationSubscription | null = null;
  private previous: GpsSample | null = null;
  private readonly listeners = new Set<GpsListener>();

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
      const servicesEnabled = await Location.hasServicesEnabledAsync();
      if (!servicesEnabled) {
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
        error: cause instanceof Error
          ? cause.message
          : 'NÃO FOI POSSÍVEL VERIFICAR O GPS.',
      };
      this.emit();
      return false;
    }
  }

  async start(): Promise<boolean> {
    if (this.subscription && this.state.running) return true;
    if (!(await this.requestPermission())) return false;

    await this.stop({ preserveTrip: false });

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
    if (!validCoordinate(c.latitude) || !validCoordinate(c.longitude)) return;

    const sample: GpsSample = {
      latitude: c.latitude,
      longitude: c.longitude,
      speedKmh: Number.isFinite(c.speed) && (c.speed as number) >= 0
        ? normalizeGpsSpeedKmh(c.speed)
        : null,
      accuracyM: c.accuracy ?? null,
      timestamp: Number.isFinite(location.timestamp) ? location.timestamp : Date.now(),
    };

    const accurateEnough =
      sample.accuracyM == null || sample.accuracyM <= MIN_ACCURACY_M;
    let segmentSpeedKmh: number | null = null;

    if (
      this.previous &&
      accurateEnough &&
      (this.previous.accuracyM == null || this.previous.accuracyM <= MIN_ACCURACY_M)
    ) {
      const elapsedMs = sample.timestamp - this.previous.timestamp;
      if (elapsedMs > 0) {
        const segmentKm = haversineDistanceKm(this.previous, sample);
        const elapsedHours = elapsedMs / 3600000;
        segmentSpeedKmh = segmentKm / elapsedHours;

        if (
          segmentKm <= 0.25 &&
          segmentSpeedKmh >= 0 &&
          segmentSpeedKmh <= MAX_SEGMENT_SPEED_KMH
        ) {
          this.state.distanceKm = Number(
            (this.state.distanceKm + segmentKm).toFixed(3),
          );
        }
      }
    }

    let speedKmh = accurateEnough ? sample.speedKmh : null;
    if (
      (speedKmh == null || speedKmh > MAX_VALID_SPEED_KMH) &&
      segmentSpeedKmh != null &&
      segmentSpeedKmh <= MAX_VALID_SPEED_KMH
    ) {
      speedKmh = segmentSpeedKmh;
    }
    if (speedKmh == null || speedKmh < 0 || speedKmh > MAX_VALID_SPEED_KMH) {
      speedKmh = 0;
    }

    this.previous = accurateEnough ? sample : this.previous;
    this.state = {
      ...this.state,
      samples: this.state.samples + 1,
      currentSpeedKmh: Number(speedKmh.toFixed(1)),
      maxSpeedKmh: Number(
        Math.max(this.state.maxSpeedKmh, speedKmh).toFixed(1),
      ),
      lastTimestamp: sample.timestamp,
      lastAccuracyM: sample.accuracyM,
      error: null,
    };
    this.emit();
  }

  async stop(options: { preserveTrip?: boolean } = {}): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    this.previous = null;

    const preserveTrip = options.preserveTrip !== false;
    this.state = preserveTrip
      ? { ...this.state, running: false, currentSpeedKmh: 0 }
      : {
          ...this.state,
          running: false,
          currentSpeedKmh: 0,
          maxSpeedKmh: 0,
          distanceKm: 0,
          samples: 0,
          lastTimestamp: null,
          lastAccuracyM: null,
        };
    this.emit();
  }
}

export const gpsTracker = new GpsTracker();
