export {
  GpsTracker,
  gpsTracker,
  calculateConsumptionKml,
  haversineDistanceKm,
  normalizeGpsSpeedKmh,
  normalizeGpsJsonRecord,
} from './gpsTracker';

export type {
  GpsSample,
  GpsTripState,
  GpsListener,
  GpsJsonRecord,
} from './gpsTracker';

export {
  GpsHistoryStore,
  gpsHistoryStore,
  GPS_HISTORY_DIRECTORY,
  GPS_HISTORY_RETENTION_DAYS,
  GPS_HISTORY_MAX_SAMPLES_PER_DAY,
} from './gpsHistory';
