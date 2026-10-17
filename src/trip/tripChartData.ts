import type { DriveCycle } from '../data/driveCycles';

export interface TripChartPoint {
  value: number;
  label: string;
}

export interface TripChartData {
  distance: TripChartPoint[];
  consumption: TripChartPoint[];
}

function labelDate(value: string): string {
  const date = new Date(value.replace(' ', 'T'));
  return Number.isFinite(date.getTime())
    ? date.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' })
    : value.slice(0, 5);
}

/**
 * Chart inputs use real trips only, never seed/simulation values.
 * Invalid fuel coverage and implausible >30 km/L outliers are omitted, not coerced to zero.
 */
export function buildTripChartData(cycles: readonly DriveCycle[], limit = 7): TripChartData {
  const safeLimit = Math.max(1, Math.min(30, Math.floor(Number.isFinite(limit) ? limit : 7)));
  const realCycles = cycles
    .filter((cycle) => cycle.source === 'REAL_OBD')
    .filter((cycle) => Number.isFinite(Date.parse(cycle.startedAt)))
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt))
    .slice(0, safeLimit)
    .reverse();

  const distance = realCycles
    .filter((cycle) => Number.isFinite(cycle.distanceTotalKm) && cycle.distanceTotalKm >= 0)
    .map((cycle) => ({ value: cycle.distanceTotalKm, label: labelDate(cycle.startedAt) }));

  const consumption = realCycles
    .filter((cycle) =>
      cycle.fuelDataValid !== false
      && Number.isFinite(cycle.fuelUsedL)
      && cycle.fuelUsedL >= 0.05
      && Number.isFinite(cycle.avgFuelConsumptionKml)
      && cycle.avgFuelConsumptionKml > 0
      && cycle.avgFuelConsumptionKml <= 30,
    )
    .map((cycle) => ({ value: cycle.avgFuelConsumptionKml, label: labelDate(cycle.startedAt) }));

  return { distance, consumption };
}
