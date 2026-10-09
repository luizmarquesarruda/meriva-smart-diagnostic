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

export function getDriveCycleSummary(cycles: DriveCycle[]): DriveCycleSummary {
  const realCycles = cycles.filter((cycle) => cycle.source === 'REAL_OBD');
  const realDistanceKm = realCycles.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  const realFuelL = realCycles.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
  const realAvgSpeedKmh = realCycles.length
    ? realCycles.reduce((sum, cycle) => sum + cycle.avgDrivingSpeedKmh, 0) / realCycles.length
    : 0;
  const orderedReal = [...realCycles].sort(
    (a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime(),
  );

  return {
    totalDistanceKm: Number(realDistanceKm.toFixed(2)),
    totalFuelL: Number(realFuelL.toFixed(3)),
    avgConsumptionKml: Number((realFuelL > 0 ? realDistanceKm / realFuelL : 0).toFixed(2)),
    avgSpeedKmh: Number(realAvgSpeedKmh.toFixed(1)),
    realCycleCount: realCycles.length,
    referenceCycleCount: 0,
    lastCycle: orderedReal[0] ?? null,
    lastRealCycle: orderedReal[0] ?? null,
  };
}
