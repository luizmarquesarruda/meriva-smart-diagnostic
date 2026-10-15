export type DriveCycleSource = 'CARSCANNER_SEED' | 'REAL_OBD' | 'SIMULACAO';

export interface TripTelemetrySample {
  timestamp: string;
  speedKmh: number | null;
  rpm: number | null;
  coolantTempC: number | null;
}

export interface DriveCycle {
  id: string;
  startedAt: string;
  finishedAt: string;
  distanceTotalKm: number;
  distanceIceKm: number;
  fuelUsedL: number;
  totalTimeHms: string;
  drivingTimeHms: string;
  standingTimeHms: string;
  avgDrivingSpeedKmh: number;
  avgFuelConsumptionKml: number;
  /** Fuel configuration used for estimates during this trip; absent on legacy records. */
  fuelType?: 'FLEX' | 'ETANOL' | 'GASOLINA';
  /** False when a real trip is retained but fuel data cannot support km/L. */
  fuelDataValid?: boolean;
  /** Maximum valid speed observed during this trip; absent in legacy records. */
  maxSpeedKmh?: number;
  /** Sparse timestamped telemetry captured for this trip. */
  telemetrySamples?: TripTelemetrySample[];
  source: DriveCycleSource;
  fuelRateSource?: 'MEASURED_015E' | 'ESTIMATED_MAF' | 'ESTIMATED_MAP' | 'MIXED';
  importedAt: string;
}

export const INITIAL_DRIVE_CYCLES: DriveCycle[] = [];

export interface DriveCycleSummary {
  totalDistanceKm: number;
  totalFuelL: number;
  avgConsumptionKml: number;
  avgSpeedKmh: number;
  realCycleCount: number;
  referenceCycleCount: number;
  lastCycle: DriveCycle | null;
  lastRealCycle: DriveCycle | null;
}

function durationHmsToMs(value: string): number {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) return 0;
  return ((Number(match[1]) * 3600) + (Number(match[2]) * 60) + Number(match[3])) * 1000;
}

export function getDriveCycleSummary(cycles: DriveCycle[]): DriveCycleSummary {
  const realCycles = cycles.filter((cycle) => cycle.source === 'REAL_OBD');
  const referenceCycles = cycles.filter((cycle) => cycle.source === 'CARSCANNER_SEED');
  // Keep total distance even when fuel telemetry or movement timing is
  // invalid, but do not calculate economy from a trip with no positive moving
  // time, no positive distance, non-finite values, or explicitly invalid fuel.
  const realDistanceKm = realCycles.reduce((sum, cycle) =>
    sum + (Number.isFinite(cycle.distanceTotalKm) && cycle.distanceTotalKm > 0 ? cycle.distanceTotalKm : 0),
  0);
  const consumptionCycles = realCycles.filter((cycle) =>
    cycle.fuelDataValid !== false &&
    Number.isFinite(cycle.distanceTotalKm) && cycle.distanceTotalKm > 0 &&
    Number.isFinite(cycle.fuelUsedL) && cycle.fuelUsedL >= 0.05 &&
    Number.isFinite(cycle.avgFuelConsumptionKml) && cycle.avgFuelConsumptionKml > 0 &&
    durationHmsToMs(cycle.drivingTimeHms) > 0,
  );
  const realFuelL = consumptionCycles.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
  const consumptionDistanceKm = consumptionCycles.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  // Only trips with a valid positive moving duration can contribute to an
  // aggregate speed. A trip with distance but 00:00:00 movement must remain
  // in the distance total, but cannot inflate km/h by adding distance to a
  // denominator that does not include its elapsed time.
  const tripsWithMovingTime = realCycles
    .map((cycle) => ({ cycle, movingTimeMs: durationHmsToMs(cycle.drivingTimeHms) }))
    .filter((item) => Number.isFinite(item.movingTimeMs) && item.movingTimeMs > 0);
  const realMovingTimeMs = tripsWithMovingTime.reduce((sum, item) => sum + item.movingTimeMs, 0);
  const realMovingDistanceKm = tripsWithMovingTime.reduce(
    (sum, item) => sum + (Number.isFinite(item.cycle.distanceTotalKm) && item.cycle.distanceTotalKm > 0 ? item.cycle.distanceTotalKm : 0),
    0,
  );
  // Aggregate speed is a distance/time ratio, not an unweighted mean of trip averages.
  const realAvgSpeedKmh = realMovingTimeMs > 0
    ? realMovingDistanceKm / (realMovingTimeMs / 3_600_000)
    : 0;

  const visibleCycles = cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  const ordered = [...visibleCycles].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );
  const orderedReal = [...realCycles].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return {
    totalDistanceKm: Number(realDistanceKm.toFixed(2)),
    totalFuelL: Number(realFuelL.toFixed(3)),
    avgConsumptionKml: Number(
      (realFuelL > 0 ? consumptionDistanceKm / realFuelL : 0).toFixed(2),
    ),
    avgSpeedKmh: Number(realAvgSpeedKmh.toFixed(1)),
    realCycleCount: realCycles.length,
    referenceCycleCount: referenceCycles.length,
    lastCycle: ordered[0] ?? null,
    lastRealCycle: orderedReal[0] ?? null,
  };
}
