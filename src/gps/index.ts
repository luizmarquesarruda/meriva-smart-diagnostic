export {
  GpsTracker,
  gpsTracker,
  calculateConsumptionKml,
  haversineDistanceKm,
  normalizeGpsSpeedKmh,
  isGpsSampleFresh,
  GPS_SAMPLE_STALE_AFTER_MS,
} from './gpsTracker';

export type {
  GpsSample,
  GpsTripState,
  GpsListener,
} from './gpsTracker';
