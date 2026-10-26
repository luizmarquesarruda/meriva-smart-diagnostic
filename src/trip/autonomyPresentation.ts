import { estimateRangeFromFuelLevel, estimateRangeFromFuelRemainingL, fuelLevelPercentToLiters, TANK_CAPACITY_L } from './fuelLevel';

export const CURRENT_FUEL_LEVEL_STALE_AFTER_MS = 30_000;
export const BUFFER_FUEL_LEVEL_MAX_AGE_MS = 60_000;
export const MIN_BUFFER_FUEL_LEVEL_SAMPLES = 2;

export function isCurrentFuelLevelSample(readAtMs: number | null, nowMs = Date.now()): boolean {
  if (readAtMs == null || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - readAtMs;
  return ageMs >= 0 && ageMs <= CURRENT_FUEL_LEVEL_STALE_AFTER_MS;
}

export function isBufferEstimatedFuelLevelSample(
  readAtMs: number | null,
  sampleCount: number,
  nowMs = Date.now(),
): boolean {
  if (readAtMs == null || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs) ||
      !Number.isInteger(sampleCount) || sampleCount < MIN_BUFFER_FUEL_LEVEL_SAMPLES) return false;
  const ageMs = nowMs - readAtMs;
  return ageMs > CURRENT_FUEL_LEVEL_STALE_AFTER_MS && ageMs <= BUFFER_FUEL_LEVEL_MAX_AGE_MS;
}

export interface CurrentAutonomyInput {
  ecuConnected: boolean;
  tripConnected: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  fuelLevelReadAtMs: number | null;
  fuelLevelBufferPercent?: number | null;
  fuelLevelBufferReadAtMs?: number | null;
  fuelLevelBufferSampleCount?: number;
  tripConsumptionKml: number | null;
  rollingConsumptionKml?: number | null;
  fallbackFuelRemainingL?: number | null;
  averageConsumptionKml: number;
  nowMs?: number;
}

/**
 * Return the range supported by the current ECU session, or null when the
 * fuel-level evidence is unavailable. Persisted range history is not current range.
 */
export function getCurrentAutonomyRangeKm(input: CurrentAutonomyInput): number | null {
  if (!input.ecuConnected || !input.tripConnected) return null;

  const consumptionKml = input.rollingConsumptionKml != null
    && Number.isFinite(input.rollingConsumptionKml)
    && input.rollingConsumptionKml > 0
    ? input.rollingConsumptionKml
    : input.tripConsumptionKml != null
      && Number.isFinite(input.tripConsumptionKml)
      && input.tripConsumptionKml > 0
      ? input.tripConsumptionKml
      : input.averageConsumptionKml;

  const hasCurrentPidLevel = input.fuelLevelSupported
    && isCurrentFuelLevelSample(input.fuelLevelReadAtMs, input.nowMs);
  if (hasCurrentPidLevel) return estimateRangeFromFuelLevel(input.fuelLevelPercent, consumptionKml);

  const hasBufferPidLevel = input.fuelLevelSupported
    && isBufferEstimatedFuelLevelSample(
      input.fuelLevelBufferReadAtMs ?? null,
      input.fuelLevelBufferSampleCount ?? 0,
      input.nowMs,
    );
  if (hasBufferPidLevel) {
    const bufferedRange = estimateRangeFromFuelLevel(input.fuelLevelBufferPercent ?? null, consumptionKml);
    if (bufferedRange != null) return bufferedRange;
  }

  const fallbackFuelRemainingL = input.fallbackFuelRemainingL;
  if (fallbackFuelRemainingL == null || !Number.isFinite(fallbackFuelRemainingL) ||
      fallbackFuelRemainingL < 0 || fallbackFuelRemainingL > TANK_CAPACITY_L) return null;
  return estimateRangeFromFuelRemainingL(fallbackFuelRemainingL, consumptionKml);
}
