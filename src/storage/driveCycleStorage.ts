import * as FileSystem from 'expo-file-system';
import { appendCsvRowIfMissing, CsvRow } from '../database/csvLogger';
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
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const cycle = value as Partial<DriveCycle>;
  const finiteNonNegative = (item: unknown): item is number =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0;
  const validDate = (item: unknown): item is string =>
    typeof item === 'string' && item.trim().length > 0 && Number.isFinite(Date.parse(item));
  const rawCycles = cycle.telemetrySamples;
  return (
    typeof cycle.id === 'string' && cycle.id.trim().length > 0 &&
    validDate(cycle.startedAt) && validDate(cycle.finishedAt) &&
    finiteNonNegative(cycle.distanceTotalKm) &&
    finiteNonNegative(cycle.distanceIceKm) &&
    finiteNonNegative(cycle.fuelUsedL) &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    finiteNonNegative(cycle.avgDrivingSpeedKmh) &&
    finiteNonNegative(cycle.avgFuelConsumptionKml) &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || finiteNonNegative(cycle.maxSpeedKmh)) &&
    (rawCycles === undefined || (Array.isArray(rawCycles) && rawCycles.every((sample) =>
      typeof sample === 'object' && sample !== null && !Array.isArray(sample) &&
      validDate(sample.timestamp) &&
      (sample.speedKmh === null || finiteNonNegative(sample.speedKmh)) &&
      (sample.rpm === null || finiteNonNegative(sample.rpm)) &&
      (sample.coolantTempC === null || (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
    ))) &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    validDate(cycle.importedAt)
  );
}

function cyclesFromUnknown(value: unknown): DriveCycle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDriveCycle);
}

function cycleCompleteness(cycle: DriveCycle): number {
  const sourceWeight = cycle.source === 'REAL_OBD' ? 3 : cycle.source === 'SIMULACAO' ? 2 : 1;
  return sourceWeight * 1_000_000
    + (cycle.telemetrySamples?.length ?? 0) * 100
    + (cycle.maxSpeedKmh == null ? 0 : 10)
    + (cycle.fuelDataValid === undefined ? 0 : 5);
}

/** Deduplicate by the stable trip ID and preserve the richest valid snapshot. */
export function deduplicateDriveCycles(cycles: DriveCycle[]): DriveCycle[] {
  const byId = new Map<string, DriveCycle>();
  for (const cycle of cycles) {
    if (!isDriveCycle(cycle) || cycle.source === 'CARSCANNER_SEED') continue;
    const previous = byId.get(cycle.id);
    if (!previous) {
      byId.set(cycle.id, cycle);
      continue;
    }
    const previousScore = cycleCompleteness(previous);
    const nextScore = cycleCompleteness(cycle);
    const previousFinishedAt = Date.parse(previous.finishedAt);
    const nextFinishedAt = Date.parse(cycle.finishedAt);
    if (nextScore > previousScore || (nextScore === previousScore && nextFinishedAt > previousFinishedAt)) {
      byId.set(cycle.id, cycle);
    }
  }
  return Array.from(byId.values());
}

export function mergeDriveCycleHistories(...histories: DriveCycle[][]): DriveCycle[] {
  return deduplicateDriveCycles(histories.flat());
}

function sameDriveCycleHistory(left: DriveCycle[], right: DriveCycle[]): boolean {
  return JSON.stringify(left) === JSON.stringify(right);
}

type DriveCycleIndex = {
  version: string;
  cycles: DriveCycle[];
  totalCount: number;
  initializedAt?: string;
  lastModified?: string;
  [key: string]: unknown;
};

async function persistIndexSnapshot(indexFile: string, data: DriveCycleIndex): Promise<void> {
  const tempFile = indexTempPath(indexFile);
  await FileSystem.writeAsStringAsync(tempFile, JSON.stringify(data, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  try {
    const verified = JSON.parse(await FileSystem.readAsStringAsync(tempFile)) as { cycles?: unknown };
    if (!Array.isArray(verified.cycles) || verified.cycles.length !== data.cycles.length ||
        !verified.cycles.every(isDriveCycle)) {
      throw new Error('VALIDACAO_DO_INDICE_TEMPORARIO_FALHOU');
    }
  } catch (cause) {
    await FileSystem.deleteAsync(tempFile, { idempotent: true });
    throw cause;
  }

  try {
    const main = await FileSystem.getInfoAsync(indexFile);
    if (main.exists) await FileSystem.deleteAsync(indexFile, { idempotent: true });
    await FileSystem.moveAsync({ from: tempFile, to: indexFile });
  } catch (cause) {
    throw new Error('FALHA_AO_SUBSTITUIR_INDICE; BACKUP_PRESERVADO: ' +
      (cause instanceof Error ? cause.message : String(cause)));
  }
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  return serializeIndexWrite(indexFile, async () => {
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const indexInfo = await FileSystem.getInfoAsync(indexFile);
    if (indexInfo.exists) {
      // Upgrade old installations in place, retaining real/simulated records and
      // removing only explicitly imported CarScanner reference trips.
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
          const invalidNonSeeds = originalCycles.some((cycle) =>
            !(typeof cycle === 'object' && cycle !== null &&
              (cycle as { source?: unknown }).source === 'CARSCANNER_SEED') &&
            !isDriveCycle(cycle),
          );
          if (invalidNonSeeds) throw new Error('INDEX_HAS_INVALID_CYCLES_DURING_MIGRATION');
          const cycles = deduplicateDriveCycles(cyclesFromUnknown(originalCycles));
          const needsNormalization = originalCycles.some((cycle) =>
            typeof cycle === 'object' && cycle !== null &&
              (cycle as { source?: unknown }).source === 'CARSCANNER_SEED',
          ) || cycles.length !== originalCycles.length;
          if (needsNormalization) {
            const previousFile = indexBackupPath(indexFile);
            await FileSystem.deleteAsync(previousFile, { idempotent: true });
            await FileSystem.copyAsync({ from: indexFile, to: previousFile });
            if (await readCyclesFromFile(previousFile) === null) {
              throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_VALIDADO');
            }
            await persistIndexSnapshot(indexFile, {
              ...parsed,
              version: typeof parsed.version === 'string' ? parsed.version : '1.0',
              cycles,
              totalCount: cycles.length,
              lastModified: new Date().toISOString(),
            });
          }
        } catch (cause) {
          // Never overwrite an index that could not be read or validated.
          console.warn('[trips] índice existente não foi migrado:', cause instanceof Error ? cause.message : cause);
        }
      }
      return;
    }

    // If the main index disappeared during a previous replacement, recover the
    // validated previous snapshot before considering an empty installation.
    const previousFile = indexBackupPath(indexFile);
    const previousInfo = await FileSystem.getInfoAsync(previousFile);
    if (previousInfo.exists) {
      const backupCycles = await readCyclesFromFile(previousFile);
      if (backupCycles === null) {
        throw new Error('BACKUP_DO_HISTORICO_CORROMPIDO; HISTORICO_NAO_SUBSTITUIDO');
      }
      await persistIndexSnapshot(indexFile, {
        version: '1.0',
        initializedAt: new Date().toISOString(),
        cycles: backupCycles,
        totalCount: backupCycles.length,
      });
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
    await persistIndexSnapshot(indexFile, emptyData);
  });
}

async function readCyclesFromFile(filePath: string): Promise<DriveCycle[] | null> {
  try {
    const info = await FileSystem.getInfoAsync(filePath);
    if (!info.exists || info.isDirectory) return null;
    const data = JSON.parse(await FileSystem.readAsStringAsync(filePath)) as { cycles?: unknown };
    if (!Array.isArray(data.cycles)) return null;
    const onlySeeds = data.cycles.every((cycle) =>
      typeof cycle === 'object' && cycle !== null &&
      (cycle as { source?: unknown }).source === 'CARSCANNER_SEED',
    );
    const valid = cyclesFromUnknown(data.cycles);
    const invalidNonSeeds = data.cycles.some((cycle) =>
      !(typeof cycle === 'object' && cycle !== null &&
        (cycle as { source?: unknown }).source === 'CARSCANNER_SEED') &&
      !isDriveCycle(cycle),
    );
    if (invalidNonSeeds || (data.cycles.length > 0 && valid.length === 0 && !onlySeeds)) return null;
    return deduplicateDriveCycles(valid);
  } catch {
    return null;
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  const main = await readCyclesFromFile(indexFile);
  if (main) return deduplicateDriveCycles(main);
  return deduplicateDriveCycles((await readCyclesFromFile(indexBackupPath(indexFile))) ?? []);
}

/**
 * Reconcile legacy trip snapshots from autosave into the canonical VIAGENS
 * index. The index remains the only persisted source of completed trips.
 */
export async function reconcileDriveCycleHistory(
  basePath: string,
  legacyCycles: DriveCycle[] = [],
): Promise<DriveCycle[]> {
  await initializeDriveCycles(basePath);
  const indexFile = `${basePath}/VIAGENS/index.json`;
  return serializeIndexWrite(indexFile, async () => {
    let main = await readCyclesFromFile(indexFile);
    const previousFile = indexBackupPath(indexFile);
    let indexChanged = false;

    if (main === null) {
      // Recover a damaged/missing main file only from a fully validated
      // previous snapshot. Never replace the only copy with an empty index.
      const backup = await readCyclesFromFile(previousFile);
      if (backup === null) {
        throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO_SEM_BACKUP_VALIDO; DADOS_LEGADOS_PRESERVADOS');
      }
      await persistIndexSnapshot(indexFile, {
        version: '1.0',
        cycles: backup,
        totalCount: backup.length,
        lastModified: new Date().toISOString(),
      });
      main = backup;
      indexChanged = true;
    }

    const merged = mergeDriveCycleHistories(main, legacyCycles);
    if (!sameDriveCycleHistory(main, merged)) {
      const mainInfo = await FileSystem.getInfoAsync(indexFile);
      if (mainInfo.exists) {
        await FileSystem.deleteAsync(previousFile, { idempotent: true });
        await FileSystem.copyAsync({ from: indexFile, to: previousFile });
        if (await readCyclesFromFile(previousFile) === null) {
          throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_VALIDADO; HISTORICO_NAO_SUBSTITUIDO');
        }
      }
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as Record<string, unknown>;
      await persistIndexSnapshot(indexFile, {
        ...parsed,
        version: typeof parsed.version === 'string' ? parsed.version : '1.0',
        cycles: merged,
        totalCount: merged.length,
        lastModified: new Date().toISOString(),
      });
      indexChanged = true;
    }

    // After reconciliation succeeds, advance the recovery copy to the exact
    // committed index. This ensures newly imported legacy trips survive a
    // later main-file corruption even when no new trip is recorded afterward.
    const backupTemp = indexTempPath(previousFile);
    if (indexChanged) try {
      await FileSystem.copyAsync({ from: indexFile, to: backupTemp });
      const backupCycles = await readCyclesFromFile(backupTemp);
      if (backupCycles === null || !sameDriveCycleHistory(backupCycles, merged)) {
        throw new Error('BACKUP_DA_RECONCILIACAO_NAO_VALIDADO');
      }
      await FileSystem.deleteAsync(previousFile, { idempotent: true });
      await FileSystem.moveAsync({ from: backupTemp, to: previousFile });
      const committedBackup = await readCyclesFromFile(previousFile);
      if (committedBackup === null || !sameDriveCycleHistory(committedBackup, merged)) {
        throw new Error('BACKUP_DA_RECONCILIACAO_NAO_CONFIRMADO');
      }
    } catch (cause) {
      await FileSystem.deleteAsync(backupTemp, { idempotent: true }).catch(() => undefined);
      // The main index is already verified; keep the older recovery copy if
      // updating its replacement failed and allow startup to proceed.
      console.warn('[trips] índice principal conciliado, mas o backup não foi avançado:', cause instanceof Error ? cause.message : cause);
    }

    return merged;
  });
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (!isDriveCycle(cycle) || cycle.source === 'CARSCANNER_SEED') {
    throw new Error('VIAGEM_INVALIDA_OU_SEED_NAO_PODE_SER_PERSISTIDO_NO_HISTORICO_REAL');
  }
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
      const invalidNonSeeds = parsed.cycles.some((item) =>
        !(typeof item === 'object' && item !== null &&
          (item as { source?: unknown }).source === 'CARSCANNER_SEED') &&
        !isDriveCycle(item),
      );
      if (invalidNonSeeds) throw new Error('INDEX_HAS_INVALID_CYCLES');
      const validCycles = cyclesFromUnknown(parsed.cycles).filter((item) => item.source !== 'CARSCANNER_SEED');
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
  } else if (!info.exists) {
    // A missing main index can be the result of interrupted replacement.
    // If a previous snapshot exists, it must be validated and restored rather
    // than silently starting with empty history.
    const previousPath = indexBackupPath(indexFile);
    const previousInfo = await FileSystem.getInfoAsync(previousPath);
    if (previousInfo.exists) {
      const backupCycles = await readCyclesFromFile(previousPath);
      if (backupCycles === null) {
        throw new Error('BACKUP_DO_HISTORICO_CORROMPIDO; HISTORICO_NAO_SUBSTITUIDO');
      }
      data = { version: '1.0', cycles: backupCycles, totalCount: backupCycles.length };
    }
  }

  data.cycles = mergeDriveCycleHistories(data.cycles, [cycle]);
  data.totalCount = data.cycles.length;
  data.lastModified = new Date().toISOString();

  // Preserve the last known-good index before replacement. Do not copy a
  // corrupt main index over the backup when recovering from backup.
  const previousFile = indexBackupPath(indexFile);
  if (info.exists && mainIsValid) {
    await FileSystem.deleteAsync(previousFile, { idempotent: true });
    await FileSystem.copyAsync({ from: indexFile, to: previousFile });
    const backup = await readCyclesFromFile(previousFile);
    if (backup === null) {
      throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_VALIDADO; HISTORICO_NAO_SUBSTITUIDO');
    }
  }
  await persistIndexSnapshot(indexFile, data);

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

  await appendCsvRowIfMissing(csvFile, row, 'id');
  });
}
