export const TANK_CAPACITY_L = 56;
export const RESERVE_CAPACITY_L = 5;
export const RESERVE_THRESHOLD_PERCENT = Number(((RESERVE_CAPACITY_L / TANK_CAPACITY_L) * 100).toFixed(2));

export function fuelLevelPercentToLiters(percent: number | null): number | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Number((TANK_CAPACITY_L * percent / 100).toFixed(3));
}

export function isFuelReserve(percent: number | null): boolean | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent <= RESERVE_THRESHOLD_PERCENT;
}

export function estimateRangeFromFuelRemainingL(
  remainingFuelL: number | null,
  consumptionKml: number | null,
): number | null {
  if (remainingFuelL == null || !Number.isFinite(remainingFuelL) || remainingFuelL < 0 || remainingFuelL > TANK_CAPACITY_L ||
      consumptionKml == null || !Number.isFinite(consumptionKml) || consumptionKml <= 0) return null;
  return Number((remainingFuelL * consumptionKml).toFixed(1));
}

export function estimateRangeFromFuelLevel(
  percent: number | null,
  consumptionKml: number | null,
): number | null {
  return estimateRangeFromFuelRemainingL(fuelLevelPercentToLiters(percent), consumptionKml);
}
