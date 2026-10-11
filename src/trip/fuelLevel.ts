import { MERIVA_MANUAL } from '../database/merivaManual';

// A reserva faz parte da capacidade nominal: 56 L no total, dos quais ~5 L são reserva.
export const TANK_CAPACITY_L = MERIVA_MANUAL.capacities.fuelTankL;
export const RESERVE_CAPACITY_L = MERIVA_MANUAL.capacities.fuelReserveApproxL;
export const USABLE_BEFORE_RESERVE_L = TANK_CAPACITY_L - RESERVE_CAPACITY_L;
export const RESERVE_THRESHOLD_PERCENT = Number(((RESERVE_CAPACITY_L / TANK_CAPACITY_L) * 100).toFixed(2));

/** Converte o PID 012F em litros do tanque total; o resultado inclui os litros de reserva. */
export function fuelLevelPercentToLiters(percent: number | null): number | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Number((TANK_CAPACITY_L * percent / 100).toFixed(3));
}

/** A reserva é sinalizada quando o nível estimado cai para aproximadamente 5 L ou menos. */
export function isFuelReserve(percent: number | null): boolean | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent <= RESERVE_THRESHOLD_PERCENT;
}

/** Autonomia total estimada com o combustível restante, incluindo a reserva. */
export function estimateRangeFromFuelLevel(
  percent: number | null,
  consumptionKml: number | null,
): number | null {
  const liters = fuelLevelPercentToLiters(percent);
  if (liters == null || consumptionKml == null || !Number.isFinite(consumptionKml) || consumptionKml <= 0) return null;
  return Number((liters * consumptionKml).toFixed(1));
}
