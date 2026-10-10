export type DriveCycleSource = 'CARSCANNER_SEED' | 'REAL_OBD' | 'SIMULACAO';

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
  source: DriveCycleSource;
  fuelRateSource?: 'MEASURED_015E' | 'ESTIMATED_MAF' | 'ESTIMATED_MAP' | 'MIXED';
  importedAt: string;
}

export const INITIAL_DRIVE_CYCLES: DriveCycle[] = [
  {
    id: 'seed_cycle_2026_07_25_01',
    startedAt: '2026-07-25 13:36:08',
    finishedAt: '2026-07-25 14:06:49',
    distanceTotalKm: 20.32,
    distanceIceKm: 20.32,
    fuelUsedL: 1.678,
    totalTimeHms: '00:30:40',
    drivingTimeHms: '00:28:22',
    standingTimeHms: '00:02:18',
    avgDrivingSpeedKmh: 42.977,
    avgFuelConsumptionKml: 12.109,
    source: 'CARSCANNER_SEED',
    importedAt: '2026-09-29T00:00:00.000Z',
  },
  {
    id: 'seed_cycle_2026_07_23_02',
    startedAt: '2026-07-23 10:34:53',
    finishedAt: '2026-07-23 10:39:25',
    distanceTotalKm: 1.503,
    distanceIceKm: 1.503,
    fuelUsedL: 0.176,
    totalTimeHms: '00:04:31',
    drivingTimeHms: '00:03:55',
    standingTimeHms: '00:00:36',
    avgDrivingSpeedKmh: 23.004,
    avgFuelConsumptionKml: 8.546,
    source: 'CARSCANNER_SEED',
    importedAt: '2026-09-29T00:00:00.000Z',
  },
  {
    id: 'seed_cycle_2026_07_23_03',
    startedAt: '2026-07-23 10:19:03',
    finishedAt: '2026-07-23 10:27:15',
    distanceTotalKm: 3.582,
    distanceIceKm: 3.582,
    fuelUsedL: 0.341,
    totalTimeHms: '00:08:12',
    drivingTimeHms: '00:07:29',
    standingTimeHms: '00:00:43',
    avgDrivingSpeedKmh: 28.716,
    avgFuelConsumptionKml: 10.498,
    source: 'CARSCANNER_SEED',
    importedAt: '2026-09-29T00:00:00.000Z',
  },
  {
    id: 'seed_cycle_2026_07_23_04',
    startedAt: '2026-07-23 09:16:19',
    finishedAt: '2026-07-23 09:27:02',
    distanceTotalKm: 3.697,
    distanceIceKm: 3.697,
    fuelUsedL: 0.434,
    totalTimeHms: '00:10:42',
    drivingTimeHms: '00:08:08',
    standingTimeHms: '00:02:33',
    avgDrivingSpeedKmh: 27.226,
    avgFuelConsumptionKml: 8.525,
    source: 'CARSCANNER_SEED',
    importedAt: '2026-09-29T00:00:00.000Z',
  },
];

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
  const realFuelL = realCycles.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
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
      (realFuelL > 0 ? realDistanceKm / realFuelL : 0).toFixed(2),
    ),
    avgSpeedKmh: Number(realAvgSpeedKmh.toFixed(1)),
    realCycleCount: realCycles.length,
    referenceCycleCount: referenceCycles.length,
    lastCycle: ordered[0] ?? null,
    lastRealCycle: orderedReal[0] ?? null,
  };
}
