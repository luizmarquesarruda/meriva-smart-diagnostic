import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle, INITIAL_DRIVE_CYCLES } from '../data/driveCycles';

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Partial<DriveCycle>;
  return (
    typeof cycle.id === 'string' &&
    typeof cycle.startedAt === 'string' &&
    typeof cycle.finishedAt === 'string' &&
    typeof cycle.distanceTotalKm === 'number' &&
    typeof cycle.distanceIceKm === 'number' &&
    typeof cycle.fuelUsedL === 'number' &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    typeof cycle.avgDrivingSpeedKmh === 'number' &&
    typeof cycle.avgFuelConsumptionKml === 'number' &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    typeof cycle.importedAt === 'string'
  );
}

function cyclesFromUnknown(value: unknown): DriveCycle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDriveCycle);
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  const indexInfo = await FileSystem.getInfoAsync(indexFile);
  if (indexInfo.exists) return;

  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  const seedData = {
    version: '1.0',
    initializedAt: new Date().toISOString(),
    cycles: INITIAL_DRIVE_CYCLES,
    totalCount: INITIAL_DRIVE_CYCLES.length,
  };

  await FileSystem.writeAsStringAsync(
    indexFile,
    JSON.stringify(seedData, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 },
  );

  const today = new Date().toISOString().split('T')[0];
  const csvFile = `${viagensDir}/viagens_${today}.csv`;

  for (const cycle of INITIAL_DRIVE_CYCLES) {
    const row: CsvRow = {
      id: cycle.id,
      timestamp: cycle.startedAt,
      distanceTotalKm: cycle.distanceTotalKm,
      distanceIceKm: cycle.distanceIceKm,
      fuelUsedL: cycle.fuelUsedL,
      totalTime: cycle.totalTimeHms,
      drivingTime: cycle.drivingTimeHms,
      standingTime: cycle.standingTimeHms,
      avgSpeed: cycle.avgDrivingSpeedKmh,
      avgConsumption: cycle.avgFuelConsumptionKml,
      source: cycle.source,
    };

    await appendCsvRow(csvFile, row);
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;

  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (!info.exists || info.isDirectory) return [];

    const content = await FileSystem.readAsStringAsync(indexFile);
    const data = JSON.parse(content) as { cycles?: unknown };
    return cyclesFromUnknown(data.cycles);
  } catch {
    return [];
  }
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  let data: { version: string; cycles: DriveCycle[]; totalCount: number; lastModified?: string } = {
    version: '1.0',
    cycles: [],
    totalCount: 0,
  };

  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (info.exists && !info.isDirectory) {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as {
        version?: string;
        cycles?: unknown;
        totalCount?: number;
      };
      data = {
        version: typeof parsed.version === 'string' ? parsed.version : '1.0',
        cycles: cyclesFromUnknown(parsed.cycles),
        totalCount: Number.isFinite(parsed.totalCount) ? Number(parsed.totalCount) : cyclesFromUnknown(parsed.cycles).length,
      };
    }
  } catch {
    // arquivo ausente ou corrompido: começa um índice vazio seguro
  }

  data.cycles.push(cycle);
  data.totalCount = data.cycles.length;
  data.lastModified = new Date().toISOString();

  await FileSystem.writeAsStringAsync(
    indexFile,
    JSON.stringify(data, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 },
  );

  const today = new Date().toISOString().split('T')[0];
  const csvFile = `${viagensDir}/viagens_${today}.csv`;

  const row: CsvRow = {
    id: cycle.id,
    timestamp: cycle.startedAt,
    distanceTotalKm: cycle.distanceTotalKm,
    distanceIceKm: cycle.distanceIceKm,
    fuelUsedL: cycle.fuelUsedL,
    totalTime: cycle.totalTimeHms,
    drivingTime: cycle.drivingTimeHms,
    standingTime: cycle.standingTimeHms,
    avgSpeed: cycle.avgDrivingSpeedKmh,
    avgConsumption: cycle.avgFuelConsumptionKml,
    source: cycle.source,
  };

  await appendCsvRow(csvFile, row);
}
