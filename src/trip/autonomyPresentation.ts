import { estimateRangeFromFuelLevel } from './fuelLevel';

export const CURRENT_FUEL_LEVEL_STALE_AFTER_MS = 30_000;
export const AUTONOMY_BUFFER_MAX_AGE_MS = 60_000;
export const AUTONOMY_BUFFER_MIN_READINGS = 10;

export type AutonomyEstimateSource = 'LIVE' | 'BUFFER' | 'UNAVAILABLE';

export interface CurrentAutonomyInput {
  ecuConnected: boolean;
  tripConnected: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  fuelLevelReadAtMs: number | null;
  tripConsumptionKml: number | null;
  averageConsumptionKml: number;
  bufferMedianPercent?: number | null;
  bufferSampleCount?: number;
  bufferLastReadAtMs?: number | null;
  nowMs?: number;
}

export interface CurrentAutonomyPresentation {
  rangeKm: number | null;
  source: AutonomyEstimateSource;
  bufferSampleCount: number;
  bufferAgeMs: number | null;
}

export function isCurrentFuelLevelSample(readAtMs: number | null, nowMs = Date.now()): boolean {
  if (readAtMs == null || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - readAtMs;
  return ageMs >= 0 && ageMs <= CURRENT_FUEL_LEVEL_STALE_AFTER_MS;
}

function getConsumptionKml(input: CurrentAutonomyInput): number | null {
  if (input.tripConsumptionKml != null &&
      Number.isFinite(input.tripConsumptionKml) &&
      input.tripConsumptionKml > 0) return input.tripConsumptionKml;
  return Number.isFinite(input.averageConsumptionKml) && input.averageConsumptionKml > 0
    ? input.averageConsumptionKml
    : null;
}

/** Live range uses a fresh PID 012F sample. A ten-reading real buffer is a distinct temporary estimate. */
export function getCurrentAutonomyPresentation(input: CurrentAutonomyInput): CurrentAutonomyPresentation {
  const nowMs = input.nowMs ?? Date.now();
  const bufferSampleCount = Number.isFinite(input.bufferSampleCount)
    ? Math.max(0, Math.floor(input.bufferSampleCount as number))
    : 0;
  const unavailable: CurrentAutonomyPresentation = {
    rangeKm: null,
    source: 'UNAVAILABLE',
    bufferSampleCount,
    bufferAgeMs: null,
  };

  if (!input.ecuConnected || !input.tripConnected || !input.fuelLevelSupported || !Number.isFinite(nowMs)) {
    return unavailable;
  }

  const consumptionKml = getConsumptionKml(input);
  if (consumptionKml == null) return unavailable;

  if (isCurrentFuelLevelSample(input.fuelLevelReadAtMs, nowMs)) {
    const rangeKm = estimateRangeFromFuelLevel(input.fuelLevelPercent, consumptionKml);
    if (rangeKm != null) return { rangeKm, source: 'LIVE', bufferSampleCount, bufferAgeMs: null };
  }

  const lastReadAtMs = input.bufferLastReadAtMs;
  const bufferMedianPercent = input.bufferMedianPercent;
  const bufferAgeMs = lastReadAtMs == null || !Number.isFinite(lastReadAtMs)
    ? null
    : nowMs - lastReadAtMs;
  if (
    bufferSampleCount >= AUTONOMY_BUFFER_MIN_READINGS &&
    bufferMedianPercent != null &&
    Number.isFinite(bufferMedianPercent) &&
    bufferMedianPercent >= 0 &&
    bufferMedianPercent <= 100 &&
    bufferAgeMs != null &&
    bufferAgeMs >= 0 &&
    bufferAgeMs <= AUTONOMY_BUFFER_MAX_AGE_MS
  ) {
    const rangeKm = estimateRangeFromFuelLevel(bufferMedianPercent, consumptionKml);
    if (rangeKm != null) return { rangeKm, source: 'BUFFER', bufferSampleCount, bufferAgeMs };
  }

  return { ...unavailable, bufferAgeMs };
}

export function getCurrentAutonomyRangeKm(input: CurrentAutonomyInput): number | null {
  return getCurrentAutonomyPresentation(input).rangeKm;
}
