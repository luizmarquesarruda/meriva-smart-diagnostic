import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';

interface DriveCycleIndex {
  version?: string;
  initializedAt?: string;
  lastModified?: string;
  cycles?: unknown;
  totalCount?: number;
  [key: string]: unknown;
}

const indexQueues = new Map<string, Promise<unknown>>();

function serializeIndexOperation<T>(indexFile: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexQueues.get(indexFile) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  indexQueues.set(indexFile, current);
  void current.finally(() => {
    if (indexQueues.get(indexFile) === current) indexQueues.delete(indexFile);
  }).catch(() => undefined);
  return current;
}

function previousIndexPath(indexFile: string): string {
  return indexFile + '.previous';
}

function temporaryIndexPath(indexFile: string): string {
  return indexFile + '.tmp';
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isValidTimestamp(value: unknown): value is string {
  if (typeof value !== 'string' || !value.trim()) return false;
  // Older app records used "YYYY-MM-DD HH:mm:ss"; normalize that legacy form
  // before validation because Hermes/date parsers are stricter across versions.
  const normalized = value.trim().replace(
    /^(\d{4}-\d{2}-\d{2})\s+(\d{2}:\d{2}(?::\d{2}(?:\.\d{1,3})?)?)/,
    '$1T$2',
  );
  return Number.isFinite(Date.parse(normalized));
}

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Partial<DriveCycle>;
  return (
    typeof cycle.id === 'string' && cycle.id.trim().length > 0 &&
    isValidTimestamp(cycle.startedAt) &&
    isValidTimestamp(cycle.finishedAt) &&
    isFiniteNumber(cycle.distanceTotalKm) && cycle.distanceTotalKm >= 0 &&
    isFiniteNumber(cycle.distanceIceKm) && cycle.distanceIceKm >= 0 &&
    isFiniteNumber(cycle.fuelUsedL) && cycle.fuelUsedL >= 0 &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    isFiniteNumber(cycle.avgDrivingSpeedKmh) && cycle.avgDrivingSpeedKmh >= 0 &&
    isFiniteNumber(cycle.avgFuelConsumptionKml) && cycle.avgFuelConsumptionKml >= 0 &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || (isFiniteNumber(cycle.maxSpeedKmh) && cycle.maxSpeedKmh >= 0)) &&
    (cycle.telemetrySamples === undefined || (Array.isArray(cycle.telemetrySamples) && cycle.telemetrySamples.every((sample) =>
      typeof sample === 'object' && sample !== null &&
      isValidTimestamp(sample.timestamp) &&
      (sample.speedKmh === null || (isFiniteNumber(sample.speedKmh) && sample.speedKmh >= 0)) &&
      (sample.rpm === null || (isFiniteNumber(sample.rpm) && sample.rpm >= 0)) &&
      (sample.coolantTempC === null || isFiniteNumber(sample.coolantTempC))
    ))) &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    isValidTimestamp(cycle.importedAt)
  );
}

function cyclesFromUnknown(value: unknown): DriveCycle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDriveCycle);
}

async function readIndexCandidate(path: string): Promise<DriveCycleIndex | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  if (info.isDirectory) throw new Error('DRIVE_CYCLE_INDEX_IS_DIRECTORY:' + path);

  const parsed = JSON.parse(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 })) as unknown;
  if (typeof parsed !== 'object' || parsed === null || !Array.isArray((parsed as DriveCycleIndex).cycles)) {
    throw new Error('DRIVE_CYCLE_INDEX_INVALID_SCHEMA:' + path);
  }
  return parsed as DriveCycleIndex;
}

/**
 * Keep a last-known-good mirror of the index. If the current index is unreadable,
 * restore the backup instead of silently interpreting I/O/JSON failure as an empty history.
 */
async function readIndexWithRecovery(indexFile: string): Promise<DriveCycleIndex | null> {
  const primaryInfo = await FileSystem.getInfoAsync(indexFile);
  if (primaryInfo.exists && primaryInfo.isDirectory) {
    throw new Error('DRIVE_CYCLE_INDEX_IS_DIRECTORY:' + indexFile);
  }

  try {
    const primary = await readIndexCandidate(indexFile);
    if (primary) return primary;
  } catch (primaryError) {
    const backup = await readIndexCandidate(previousIndexPath(indexFile)).catch(() => null);
    if (!backup) {
      throw new Error(
        'DRIVE_CYCLE_INDEX_UNREADABLE: preservado sem sobrescrita. ' +
        (primaryError instanceof Error ? primaryError.message : String(primaryError)),
      );
    }
    await FileSystem.copyAsync({ from: previousIndexPath(indexFile), to: indexFile });
    return backup;
  }

  const backup = await readIndexCandidate(previousIndexPath(indexFile)).catch(() => null);
  if (backup) {
    await FileSystem.copyAsync({ from: previousIndexPath(indexFile), to: indexFile });
    return backup;
  }
  return null;
}

async function writeIndexSafely(indexFile: string, data: DriveCycleIndex): Promise<void> {
  const tempPath = temporaryIndexPath(indexFile);
  const backupPath = previousIndexPath(indexFile);
  const encoded = JSON.stringify(data, null, 2);

  await FileSystem.writeAsStringAsync(tempPath, encoded, { encoding: FileSystem.EncodingType.UTF8 });
  const staged = await readIndexCandidate(tempPath);
  if (!staged || !Array.isArray(staged.cycles)) {
    throw new Error('DRIVE_CYCLE_INDEX_STAGING_VALIDATION_FAILED');
  }

  const targetInfo = await FileSystem.getInfoAsync(indexFile);
  if (targetInfo.exists && !targetInfo.isDirectory) {
    await FileSystem.copyAsync({ from: indexFile, to: backupPath });
  }

  try {
    await FileSystem.copyAsync({ from: tempPath, to: indexFile });
    const committed = await readIndexCandidate(indexFile);
    if (!committed) throw new Error('DRIVE_CYCLE_INDEX_COMMIT_VALIDATION_FAILED');
  } catch (cause) {
    const backupInfo = await FileSystem.getInfoAsync(backupPath).catch(() => ({ exists: false, isDirectory: false }));
    if (backupInfo.exists && !backupInfo.isDirectory) {
      try { await FileSystem.copyAsync({ from: backupPath, to: indexFile }); } catch { /* manter backup recuperável */ }
    }
    throw cause;
  } finally {
    try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch { /* temp pode ser removido na próxima escrita */ }
  }

  // Refresh the recovery point as part of the successful operation. If this
  // fails, bubble it up so the caller retains its pending write for retry.
  await FileSystem.copyAsync({ from: indexFile, to: backupPath });
}

function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function appendTripCsvOnce(viagensDir: string, cycle: DriveCycle): Promise<void> {
  const csvFile = `${viagensDir}/viagens_${localDayKey(new Date())}.csv`;
  const info = await FileSystem.getInfoAsync(csvFile);
  if (info.exists && !info.isDirectory) {
    const content = await FileSystem.readAsStringAsync(csvFile, { encoding: FileSystem.EncodingType.UTF8 });
    const hasId = content.split(/\r?\n/).slice(1).some((line) => line.split(',')[0] === cycle.id);
    if (hasId) return;
  }

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
    avgConsumption: cycle.fuelDataValid !== false && cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0
      ? cycle.avgFuelConsumptionKml
      : '',
    telemetrySamples: cycle.telemetrySamples?.length ?? 0,
    source: cycle.source,
  };
  await appendCsvRow(csvFile, row);
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  await serializeIndexOperation(indexFile, async () => {
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const parsed = await readIndexWithRecovery(indexFile);
    if (parsed) {
      const originalCycles = Array.isArray(parsed.cycles) ? parsed.cycles : [];
      const hasNonOperationalCycle = originalCycles.some(
        (cycle) => typeof cycle !== 'object' || cycle === null ||
          (cycle as { source?: unknown }).source !== 'REAL_OBD',
      );
      if (hasNonOperationalCycle) {
        const cycles = cyclesFromUnknown(originalCycles).filter((cycle) => cycle.source === 'REAL_OBD');
        await writeIndexSafely(indexFile, {
          ...parsed,
          cycles,
          totalCount: cycles.length,
          lastModified: new Date().toISOString(),
        });
      }
      return;
    }

    const emptyData: DriveCycleIndex = {
      version: '1.0',
      initializedAt: new Date().toISOString(),
      cycles: [],
      totalCount: 0,
    };
    await writeIndexSafely(indexFile, emptyData);
  });
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  return serializeIndexOperation(indexFile, async () => {
    try {
      const data = await readIndexWithRecovery(indexFile);
      if (!data) return [];
      return cyclesFromUnknown(data.cycles).filter((cycle) => cycle.source === 'REAL_OBD');
    } catch {
      // Keep read-only UI resilient. Mutating operations fail closed on an unreadable index.
      return [];
    }
  });
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  if (cycle?.source !== 'REAL_OBD') {
    throw new Error('NON_REAL_TRIP_NOT_ALLOWED_IN_OPERATIONAL_HISTORY');
  }
  if (!isDriveCycle(cycle)) {
    throw new Error('DRIVE_CYCLE_INVALID: ciclo de viagem não atende ao contrato de persistência.');
  }

  await serializeIndexOperation(indexFile, async () => {
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const parsed = await readIndexWithRecovery(indexFile);
    const original = parsed ?? {
      version: '1.0',
      initializedAt: new Date().toISOString(),
      cycles: [],
      totalCount: 0,
    };
    const sourceCycles = Array.isArray(original.cycles) ? cyclesFromUnknown(original.cycles) : [];
    const cycles = sourceCycles.filter((item) => item.source === 'REAL_OBD');
    const existingIndex = cycles.findIndex((item) => item.id === cycle.id);
    if (existingIndex >= 0) cycles[existingIndex] = cycle;
    else cycles.push(cycle);

    const updated: DriveCycleIndex = {
      ...original,
      version: typeof original.version === 'string' ? original.version : '1.0',
      cycles,
      totalCount: cycles.length,
      lastModified: new Date().toISOString(),
    };

    await writeIndexSafely(indexFile, updated);
    await appendTripCsvOnce(viagensDir, cycle);
  });
}
