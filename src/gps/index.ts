export {
  GpsTracker,
  gpsTracker,
  calculateConsumptionKml,
  haversineDistanceKm,
  normalizeGpsSpeedKmh,
  hasReliableGpsFix,
  formatDistance,
} from './gpsTracker';

export type {
  GpsSample,
  GpsTripState,
  GpsListener,
} from './gpsTracker';
