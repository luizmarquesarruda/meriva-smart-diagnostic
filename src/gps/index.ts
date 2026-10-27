export {
  GpsTracker,
  gpsTracker,
  calculateConsumptionKml,
  haversineDistanceKm,
  normalizeGpsSpeedKmh,
  isGpsSampleFresh,
  GPS_SAMPLE_STALE_AFTER_MS,
  GPS_NETWORK_REFRESH_INTERVAL_MS,
} from './gpsTracker';

export type {
  GpsSample,
  GpsTripState,
  GpsListener,
} from './gpsTracker';
