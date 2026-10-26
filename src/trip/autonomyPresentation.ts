import { estimateRangeFromFuelLevel, estimateRangeFromFuelRemainingL, fuelLevelPercentToLiters, TANK_CAPACITY_L } from './fuelLevel';

export const CURRENT_FUEL_LEVEL_STALE_AFTER_MS = 30_000;

export function isCurrentFuelLevelSample(readAtMs: number | null, nowMs = Date.now()): boolean {
  if (readAtMs == null || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - readAtMs;
  return ageMs >= 0 && ageMs <= CURRENT_FUEL_LEVEL_STALE_AFTER_MS;
}

export interface CurrentAutonomyInput {
  ecuConnected: boolean;
  tripConnected: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  fuelLevelReadAtMs: number | null;
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

  const fallbackFuelRemainingL = input.fallbackFuelRemainingL;
  if (fallbackFuelRemainingL == null || !Number.isFinite(fallbackFuelRemainingL) ||
      fallbackFuelRemainingL < 0 || fallbackFuelRemainingL > TANK_CAPACITY_L) return null;
  return estimateRangeFromFuelRemainingL(fallbackFuelRemainingL, consumptionKml);
}
