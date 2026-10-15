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
  const realDistanceKm = realCycles.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  const consumptionCycles = realCycles.filter((cycle) =>
    cycle.fuelDataValid === false
      ? false
      : cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0,
  );
  const realFuelL = consumptionCycles.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
  const consumptionDistanceKm = consumptionCycles.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  const realMovingTimeMs = realCycles.reduce(
    (sum, cycle) => sum + durationHmsToMs(cycle.drivingTimeHms),
    0,
  );
  // Aggregate velocity is total real distance / total real moving time.
  // An unweighted mean gives a 1 km trip the same weight as a 20 km trip.
  const realAvgSpeedKmh = realMovingTimeMs > 0
    ? realDistanceKm / (realMovingTimeMs / 3_600_000)
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
