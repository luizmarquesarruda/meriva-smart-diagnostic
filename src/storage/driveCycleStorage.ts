import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';

const indexWriteQueues = new Map<string, Promise<unknown>>();

async function serializeIndexWrite<T>(indexFile: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexWriteQueues.get(indexFile) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  indexWriteQueues.set(indexFile, current);
  try {
    return await current;
  } finally {
    if (indexWriteQueues.get(indexFile) === current) indexWriteQueues.delete(indexFile);
  }
}

function localDateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function indexBackupPath(indexFile: string): string { return indexFile.replace(/\.json$/, '.previous.json'); }
function indexTempPath(indexFile: string): string { return indexFile.replace(/\.json$/, '.tmp'); }

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

async function readCyclesFromFile(filePath: string): Promise<DriveCycle[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || info.isDirectory) return null;
    const data = JSON.parse(await FileSystem.readAsStringAsync(filePath)) as { cycles?: unknown };
    if (!Array.isArray(data.cycles)) return null;
    return cyclesFromUnknown(data.cycles).filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  } catch {
    return null;
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  const main = await readCyclesFromFile(indexFile);
  if (main) return main;
  return (await readCyclesFromFile(indexBackupPath(indexFile))) ?? [];
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  return serializeIndexWrite(indexFile, async () => {
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  let data: { version: string; cycles: DriveCycle[]; totalCount: number; lastModified?: string } = {
    version: '1.0',
    cycles: [],
    totalCount: 0,
  };

  const info = await FileSystem.getInfoAsync(indexFile);
  let mainIsValid = !info.exists;
  if (info.exists && !info.isDirectory) {
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as {
        version?: string;
        cycles?: unknown;
        totalCount?: number;
      };
      if (!Array.isArray(parsed.cycles)) throw new Error('INDEX_CYCLES_NOT_ARRAY');
      const validCycles = cyclesFromUnknown(parsed.cycles).filter((item) => item.source !== 'CARSCANNER_SEED');
      if (parsed.cycles.length > 0 && validCycles.length === 0) throw new Error('INDEX_HAS_NO_VALID_CYCLES');
      data = {
        version: typeof parsed.version === 'string' ? parsed.version : '1.0',
        cycles: validCycles,
        totalCount: validCycles.length,
      };
      mainIsValid = true;
    } catch (mainError) {
      const backupCycles = await readCyclesFromFile(indexBackupPath(indexFile));
      if (backupCycles === null) {
        throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO; ARQUIVO PRESERVADO PARA RECUPERACAO');
      }
      data = { version: '1.0', cycles: backupCycles, totalCount: backupCycles.length };
      mainIsValid = false;
    }
  } else if (info.exists && info.isDirectory) {
    throw new Error('INDEX_DE_VIAGENS_E_DIRETORIO; NENHUMA GRAVACAO EXECUTADA');
  }

  data.cycles = data.cycles.filter((item) => item.id !== cycle.id);
  data.cycles.push(cycle);
  data.totalCount = data.cycles.length;
  data.lastModified = new Date().toISOString();

  const serializedIndex = JSON.stringify(data, null, 2);
  const tempFile = indexTempPath(indexFile);
  const previousFile = indexBackupPath(indexFile);
  await FileSystem.writeAsStringAsync(tempFile, serializedIndex, { encoding: FileSystem.EncodingType.UTF8 });
  const verified = JSON.parse(await FileSystem.readAsStringAsync(tempFile)) as { cycles?: unknown };
  if (!Array.isArray(verified.cycles) || verified.cycles.length !== data.cycles.length ||
      !verified.cycles.every(isDriveCycle)) {
    await FileSystem.deleteAsync(tempFile, { idempotent: true });
    throw new Error('VALIDACAO_DO_INDICE_TEMPORARIO_FALHOU; HISTORICO_NAO_SUBSTITUIDO');
  }

  // Preserve the last known-good index before replacement. Do not copy a
  // corrupt main index over the backup when recovering from backup.
  if (info.exists && mainIsValid) {
    try { await FileSystem.deleteAsync(previousFile, { idempotent: true }); } catch { /* attempt safe copy below */ }
    await FileSystem.copyAsync({ from: indexFile, to: previousFile });
    const backup = await readCyclesFromFile(previousFile);
    if (backup === null) {
      await FileSystem.deleteAsync(tempFile, { idempotent: true });
      throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_VALIDADO; HISTORICO_NAO_SUBSTITUIDO');
    }
  }
  try {
    await FileSystem.copyAsync({ from: tempFile, to: indexFile });
    await FileSystem.deleteAsync(tempFile, { idempotent: true });
  } catch (cause) {
    throw new Error('FALHA_AO_SUBSTITUIR_INDICE; BACKUP_PRESERVADO: ' + (cause instanceof Error ? cause.message : String(cause)));
  }

  const parsedStart = Date.parse(cycle.startedAt);
  const csvDate = new Date(Number.isFinite(parsedStart) ? parsedStart : Date.now());
  const today = localDateKey(csvDate);
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
  });
}
