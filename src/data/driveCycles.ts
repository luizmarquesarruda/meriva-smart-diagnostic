export interface DriveCycleSeed {
  startedAt: string;
  finishedAt: string;
  distanceTotalKm: number;
  distanceIceKm: number;
  fuelUsedL: number;
  totalTime: string;
  drivingTime: string;
  standingTime: string;
  avgDrivingSpeedKmh: number;
  avgFuelConsumptionKml: number;
}

export const initialDriveCycles: DriveCycleSeed[] = [
  {
    startedAt: '2026-07-25 13:36:08',
    finishedAt: '2026-07-25 14:06:49',
    distanceTotalKm: 20.32,
    distanceIceKm: 20.32,
    fuelUsedL: 1.678,
    totalTime: '00:30:40',
    drivingTime: '00:28:22',
    standingTime: '00:02:18',
    avgDrivingSpeedKmh: 42.977,
    avgFuelConsumptionKml: 12.109,
  },
  {
    startedAt: '2026-07-23 10:34:53',
    finishedAt: '2026-07-23 10:39:25',
    distanceTotalKm: 1.503,
    distanceIceKm: 1.503,
    fuelUsedL: 0.176,
    totalTime: '00:04:31',
    drivingTime: '00:03:55',
    standingTime: '00:00:36',
    avgDrivingSpeedKmh: 23.004,
    avgFuelConsumptionKml: 8.546,
  },
  {
    startedAt: '2026-07-23 10:19:03',
    finishedAt: '2026-07-23 10:27:15',
    distanceTotalKm: 3.582,
    distanceIceKm: 3.582,
    fuelUsedL: 0.341,
    totalTime: '00:08:12',
    drivingTime: '00:07:29',
    standingTime: '00:00:43',
    avgDrivingSpeedKmh: 28.716,
    avgFuelConsumptionKml: 10.498,
  },
  {
    startedAt: '2026-07-23 09:16:19',
    finishedAt: '2026-07-23 09:27:02',
    distanceTotalKm: 3.697,
    distanceIceKm: 3.697,
    fuelUsedL: 0.434,
    totalTime: '00:10:42',
    drivingTime: '00:08:08',
    standingTime: '00:02:33',
    avgDrivingSpeedKmh: 27.226,
    avgFuelConsumptionKml: 8.525,
  },
];
