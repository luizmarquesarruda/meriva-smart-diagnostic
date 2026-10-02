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
}

const MIN_ACCURACY_M = 60;
const MAX_SEGMENT_SPEED_KMH = 220;

export function haversineDistanceKm(a: Pick<GpsSample, 'latitude' | 'longitude'>, b: Pick<GpsSample, 'latitude' | 'longitude'>): number {
  const R = 6371;
  const lat1 = (a.latitude * Math.PI) / 180;
  const lat2 = (b.latitude * Math.PI) / 180;
  const dLat = ((b.latitude - a.latitude) * Math.PI) / 180;
  const dLon = ((b.longitude - a.longitude) * Math.PI) / 180;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

export function calculateConsumptionKml(distanceKm: number, fuelUsedL: number): number | null {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0 || !Number.isFinite(fuelUsedL) || fuelUsedL <= 0) return null;
  return distanceKm / fuelUsedL;
}

export function normalizeGpsSpeedKmh(speedMs: number | null | undefined): number {
  return Number.isFinite(speedMs) && (speedMs as number) >= 0 ? (speedMs as number) * 3.6 : 0;
}

export class GpsTracker {
  private subscription: Location.LocationSubscription | null = null;
  private previous: GpsSample | null = null;
  private state: GpsTripState = {
    running: false,
    permissionGranted: false,
    currentSpeedKmh: 0,
    maxSpeedKmh: 0,
    distanceKm: 0,
    samples: 0,
    lastTimestamp: null,
    lastAccuracyM: null,
  };

  async requestPermission(): Promise<boolean> {
    if (!(await Location.hasServicesEnabledAsync())) return false;
    const permission = await Location.requestForegroundPermissionsAsync();
    this.state.permissionGranted = permission.status === Location.PermissionStatus.GRANTED;
    return this.state.permissionGranted;
  }

  async start(onUpdate: (state: GpsTripState) => void): Promise<boolean> {
    if (!(await this.requestPermission())) return false;
    await this.stop();
    this.previous = null;
    this.state = { ...this.state, running: true, currentSpeedKmh: 0, maxSpeedKmh: 0, distanceKm: 0, samples: 0, lastTimestamp: null, lastAccuracyM: null };
    onUpdate({ ...this.state });

    this.subscription = await Location.watchPositionAsync(
      {
        accuracy: Location.Accuracy.BestForNavigation,
        timeInterval: 1000,
        distanceInterval: 1,
        mayShowUserSettingsDialog: true,
      },
      (location) => {
        const c = location.coords;
        const sample: GpsSample = {
          latitude: c.latitude,
          longitude: c.longitude,
          speedKmh: c.speed == null ? null : normalizeGpsSpeedKmh(c.speed),
          accuracyM: c.accuracy ?? null,
          timestamp: location.timestamp,
        };
        const speed = sample.speedKmh ?? 0;
        const accurateEnough = sample.accuracyM == null || sample.accuracyM <= MIN_ACCURACY_M;

        if (this.previous && accurateEnough && (this.previous.accuracyM == null || this.previous.accuracyM <= MIN_ACCURACY_M)) {
          const segmentKm = haversineDistanceKm(this.previous, sample);
          const elapsedHours = Math.max(0.001, (sample.timestamp - this.previous.timestamp) / 3600000);
          const segmentSpeed = segmentKm / elapsedHours;
          if (segmentKm <= 0.25 && segmentSpeed <= MAX_SEGMENT_SPEED_KMH) this.state.distanceKm += segmentKm;
        }

        this.previous = sample;
        this.state = {
          ...this.state,
          samples: this.state.samples + 1,
          currentSpeedKmh: Number(speed.toFixed(1)),
          maxSpeedKmh: Number(Math.max(this.state.maxSpeedKmh, speed).toFixed(1)),
          lastTimestamp: sample.timestamp,
          lastAccuracyM: sample.accuracyM,
        };
        onUpdate({ ...this.state });
      },
    );
    return true;
  }

  async stop(): Promise<void> {
    this.subscription?.remove();
    this.subscription = null;
    this.previous = null;
    this.state = { ...this.state, running: false, currentSpeedKmh: 0 };
  }

  getState(): GpsTripState { return { ...this.state }; }
}
