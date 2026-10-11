import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';

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
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || (typeof cycle.maxSpeedKmh === 'number' && Number.isFinite(cycle.maxSpeedKmh) && cycle.maxSpeedKmh >= 0)) &&
    (cycle.telemetrySamples === undefined || (Array.isArray(cycle.telemetrySamples) && cycle.telemetrySamples.every((sample) =>
      typeof sample === 'object' && sample !== null &&
      typeof sample.timestamp === 'string' &&
      (sample.speedKmh === null || (typeof sample.speedKmh === 'number' && Number.isFinite(sample.speedKmh))) &&
      (sample.rpm === null || (typeof sample.rpm === 'number' && Number.isFinite(sample.rpm))) &&
      (sample.coolantTempC === null || (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
    ))) &&
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

  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
  const indexInfo = await FileSystem.getInfoAsync(indexFile);
  if (indexInfo.exists) {
    // Upgrade old installations in place, retaining real/simulated records and
    // removing only the explicitly imported CarScanner reference trips.
    if (!indexInfo.isDirectory) {
      try {
        const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as {
          version?: string;
          initializedAt?: string;
          cycles?: unknown;
          totalCount?: number;
          [key: string]: unknown;
        };
        const originalCycles = Array.isArray(parsed.cycles) ? parsed.cycles : [];
        const hasSeed = originalCycles.some(
          (cycle) => typeof cycle === 'object' && cycle !== null &&
            (cycle as { source?: unknown }).source === 'CARSCANNER_SEED',
        );
        if (hasSeed) {
          const cycles = cyclesFromUnknown(parsed.cycles).filter(
            (cycle) => cycle.source !== 'CARSCANNER_SEED',
          );
          await FileSystem.writeAsStringAsync(
            indexFile,
            JSON.stringify({
              ...parsed,
              cycles,
              totalCount: cycles.length,
              lastModified: new Date().toISOString(),
            }, null, 2),
            { encoding: FileSystem.EncodingType.UTF8 },
          );
        }
      } catch {
        // Do not overwrite an index whose contents cannot be read safely.
      }
    }
    return;
  }

  // New installations start with no trips. CarScanner seed data remains
  // available only as a separately identified learning/reference baseline.
  const emptyData = {
    version: '1.0',
    initializedAt: new Date().toISOString(),
    cycles: [] as DriveCycle[],
    totalCount: 0,
  };
  await FileSystem.writeAsStringAsync(
    indexFile,
    JSON.stringify(emptyData, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 },
  );
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;

  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (!info.exists || info.isDirectory) return [];

    const content = await FileSystem.readAsStringAsync(indexFile);
    const data = JSON.parse(content) as { cycles?: unknown };
    return cyclesFromUnknown(data.cycles).filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
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
        cycles: cyclesFromUnknown(parsed.cycles).filter((item) => item.source !== 'CARSCANNER_SEED'),
        totalCount: cyclesFromUnknown(parsed.cycles).filter((item) => item.source !== 'CARSCANNER_SEED').length,
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
    maxSpeed: cycle.maxSpeedKmh ?? '',
    avgConsumption: cycle.fuelDataValid === false ? '' : cycle.avgFuelConsumptionKml,
    telemetrySamples: cycle.telemetrySamples?.length ?? 0,
    source: cycle.source,
  };

  await appendCsvRow(csvFile, row);
}
