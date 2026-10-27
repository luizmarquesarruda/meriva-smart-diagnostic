import * as FileSystem from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';

const indexWriteQueues = new Map<string, Promise<unknown>>();
const migrationPromises = new Map<string, Promise<void>>();
const SQLITE_DATABASE_NAME = 'meriva_smart_history.db';
const SQLITE_MIGRATION_KEY = 'legacy_json_migration_v1';
let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

function joinPath(base: string, child: string): string {
  return `${base.replace(/\\/+$/, '')}/${child.replace(/^\\/+/, '')}`;
}

function sqliteDatabasePath(): string {
  const root = FileSystem.documentDirectory;
  if (!root) throw new Error('SQLITE_DOCUMENT_DIRECTORY_UNAVAILABLE');
  return joinPath(joinPath(root, 'SQLite'), SQLITE_DATABASE_NAME);
}

function sqliteSnapshotPath(basePath: string): string {
  return `${basePath}/VIAGENS/${SQLITE_DATABASE_NAME}`;
}

async function openDriveCycleDatabase(basePath: string): Promise<SQLite.SQLiteDatabase> {
  const databasePath = sqliteDatabasePath();
  const sqliteDir = joinPath(FileSystem.documentDirectory, 'SQLite');
  const viagensDir = `${basePath}/VIAGENS`;
  await FileSystem.makeDirectoryAsync(sqliteDir, { intermediates: true });
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  // If the app's standard SQLite file was lost while the last verified
  // snapshot survived inside VIAGENS, restore that copy before opening it.
  const databaseInfo = await FileSystem.getInfoAsync(databasePath);
  const snapshotInfo = await FileSystem.getInfoAsync(sqliteSnapshotPath(basePath));
  if (!databaseInfo.exists && snapshotInfo.exists && !snapshotInfo.isDirectory) {
    await FileSystem.copyAsync({ from: sqliteSnapshotPath(basePath), to: databasePath });
  }

  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(SQLITE_DATABASE_NAME)
      .then(async (db) => {
        await db.execAsync(`
          PRAGMA journal_mode = DELETE;
          PRAGMA synchronous = FULL;
          CREATE TABLE IF NOT EXISTS drive_cycles (
            id TEXT PRIMARY KEY NOT NULL,
            started_at TEXT NOT NULL,
            source TEXT NOT NULL,
            payload_json TEXT NOT NULL,
            updated_at TEXT NOT NULL
          );
          CREATE INDEX IF NOT EXISTS idx_drive_cycles_started_at
            ON drive_cycles(started_at);
          CREATE TABLE IF NOT EXISTS drive_cycle_metadata (
            key TEXT PRIMARY KEY NOT NULL,
            value TEXT NOT NULL
          );
        `);
        return db;
      })
      .catch((cause) => {
        databasePromise = null;
        throw cause;
      });
  }
  return databasePromise;
}

async function readSqliteDriveCycles(db: SQLite.SQLiteDatabase): Promise<DriveCycle[]> {
  const rows = await db.getAllAsync<{ id: string; payload_json: string }>(
    'SELECT id, payload_json FROM drive_cycles ORDER BY rowid ASC',
  );
  const cycles: DriveCycle[] = [];
  for (const row of rows) {
    let parsed: unknown;
    try {
      parsed = JSON.parse(row.payload_json);
    } catch {
      throw new Error('SQLITE_TRIP_HISTORY_CORRUPTED_JSON:' + row.id);
    }
    if (!isDriveCycle(parsed) || parsed.id !== row.id) {
      throw new Error('SQLITE_TRIP_HISTORY_INVALID_ROW:' + row.id);
    }
    if (parsed.source !== 'CARSCANNER_SEED') cycles.push(parsed);
  }
  return cycles;
}

async function insertDriveCycle(db: SQLite.SQLiteDatabase, cycle: DriveCycle, mode: 'IGNORE' | 'REPLACE'): Promise<void> {
  const statement = mode === 'IGNORE'
    ? 'INSERT OR IGNORE INTO drive_cycles (id, started_at, source, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)'
    : 'INSERT OR REPLACE INTO drive_cycles (id, started_at, source, payload_json, updated_at) VALUES (?, ?, ?, ?, ?)';
  await db.runAsync(statement, cycle.id, cycle.startedAt, cycle.source, JSON.stringify(cycle), new Date().toISOString());
}

async function copySqliteFileToSnapshot(basePath: string): Promise<void> {
  const source = sqliteDatabasePath();
  const destination = sqliteSnapshotPath(basePath);
  const temporary = destination + '.tmp';
  const sourceInfo = await FileSystem.getInfoAsync(source, { size: true });
  if (!sourceInfo.exists || sourceInfo.isDirectory) throw new Error('SQLITE_DATABASE_FILE_UNAVAILABLE_FOR_BACKUP');
  await FileSystem.deleteAsync(temporary, { idempotent: true });
  await FileSystem.copyAsync({ from: source, to: temporary });
  const temporaryInfo = await FileSystem.getInfoAsync(temporary, { size: true });
  if (!temporaryInfo.exists || temporaryInfo.isDirectory ||
      (typeof sourceInfo.size === 'number' && temporaryInfo.size !== sourceInfo.size)) {
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    throw new Error('SQLITE_SNAPSHOT_SIZE_MISMATCH');
  }
  await FileSystem.deleteAsync(destination, { idempotent: true });
  await FileSystem.moveAsync({ from: temporary, to: destination });
  const verified = await FileSystem.getInfoAsync(destination, { size: true });
  if (!verified.exists || verified.isDirectory ||
      (typeof sourceInfo.size === 'number' && verified.size !== sourceInfo.size)) {
    throw new Error('SQLITE_SNAPSHOT_VERIFICATION_FAILED');
  }
}

async function refreshLegacyIndexFromSqlite(
  basePath: string,
  db: SQLite.SQLiteDatabase,
  preserveCurrentIndex = true,
): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
  const cycles = await readSqliteDriveCycles(db);
  const currentInfo = await FileSystem.getInfoAsync(indexFile);
  if (preserveCurrentIndex && currentInfo.exists && !currentInfo.isDirectory) {
    const currentCycles = await readCyclesFromFile(indexFile);
    if (currentCycles !== null) {
      const previousFile = indexBackupPath(indexFile);
      await FileSystem.deleteAsync(previousFile, { idempotent: true });
      await FileSystem.copyAsync({ from: indexFile, to: previousFile });
      if (await readCyclesFromFile(previousFile) === null) {
        throw new Error('JSON_TRIP_BACKUP_VERIFICATION_FAILED');
      }
    }
  }

  let existing: Record<string, unknown> = {};
  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as unknown;
    if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
      existing = parsed as Record<string, unknown>;
    }
  } catch {
    // SQLite has already been committed and validated; rebuild only the
    // derived JSON compatibility snapshot from this authoritative store.
  }
  await persistIndexSnapshot(indexFile, {
    ...existing,
    version: '2.0-sqlite',
    initializedAt: typeof existing.initializedAt === 'string' ? existing.initializedAt : new Date().toISOString(),
    cycles,
    totalCount: cycles.length,
    lastModified: new Date().toISOString(),
  });
}

async function ensureSqliteMigration(basePath: string): Promise<void> {
  const alreadyRunning = migrationPromises.get(basePath);
  if (alreadyRunning) return alreadyRunning;
  const operation = (async () => {
    const viagensDir = `${basePath}/VIAGENS`;
    const indexFile = `${viagensDir}/index.json`;
    const previousFile = indexBackupPath(indexFile);
    const preSqliteFile = indexFile.replace(/\\.json$/, '.pre-sqlite.json');
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const db = await openDriveCycleDatabase(basePath);
    const marker = await db.getFirstAsync<{ value: string }>(
      'SELECT value FROM drive_cycle_metadata WHERE key = ?', SQLITE_MIGRATION_KEY,
    );
    if (marker?.value === 'completed') return;

    const mainInfo = await FileSystem.getInfoAsync(indexFile);
    const previousInfo = await FileSystem.getInfoAsync(previousFile);
    let legacyCycles: DriveCycle[] | null = await readCyclesFromFile(indexFile);
    let sourceFile = legacyCycles !== null ? indexFile : null;
    if (legacyCycles === null) {
      legacyCycles = await readCyclesFromFile(previousFile);
      if (legacyCycles !== null) sourceFile = previousFile;
    }
    if (legacyCycles === null) {
      if (mainInfo.exists || previousInfo.exists) {
        throw new Error('LEGACY_TRIP_HISTORY_INVALID; SQLITE_MIGRATION_ABORTED_WITHOUT_DATA_LOSS');
      }
      legacyCycles = [];
    }

    // Keep a one-time untouched migration source. It is distinct from the
    // rolling .previous.json snapshot so recovery remains possible after later writes.
    const preSqliteInfo = await FileSystem.getInfoAsync(preSqliteFile);
    if (preSqliteInfo.exists) {
      if (await readCyclesFromFile(preSqliteFile) === null) {
        throw new Error('PRE_SQLITE_BACKUP_INVALID; SQLITE_MIGRATION_ABORTED');
      }
    } else if (sourceFile !== null) {
      await FileSystem.copyAsync({ from: sourceFile, to: preSqliteFile });
      if (await readCyclesFromFile(preSqliteFile) === null) {
        throw new Error('PRE_SQLITE_BACKUP_VERIFICATION_FAILED; SQLITE_MIGRATION_ABORTED');
      }
    }

    const validCycles = legacyCycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
    await db.withTransactionAsync(async () => {
      for (const cycle of validCycles) await insertDriveCycle(db, cycle, 'IGNORE');
      const ids = await db.getAllAsync<{ id: string }>('SELECT id FROM drive_cycles');
      const storedIds = new Set(ids.map((row) => row.id));
      if (!validCycles.every((cycle) => storedIds.has(cycle.id))) {
        throw new Error('SQLITE_MIGRATION_COUNT_VALIDATION_FAILED');
      }
      await db.runAsync(
        'INSERT OR REPLACE INTO drive_cycle_metadata (key, value) VALUES (?, ?)',
        SQLITE_MIGRATION_KEY, 'completed',
      );
    });

    await refreshLegacyIndexFromSqlite(basePath, db, false);
    await copySqliteFileToSnapshot(basePath);
  })();
  migrationPromises.set(basePath, operation);
  try {
    await operation;
  } catch (cause) {
    if (migrationPromises.get(basePath) === operation) migrationPromises.delete(basePath);
    throw cause;
  }
}

/** Flushes the DB to a checked, restorable file inside VIAGENS before backup/export. */
export async function prepareDriveCycleDatabaseBackup(basePath: string): Promise<void> {
  await ensureSqliteMigration(basePath);
  const db = await openDriveCycleDatabase(basePath);
  await db.execAsync('PRAGMA wal_checkpoint(FULL);');
  await copySqliteFileToSnapshot(basePath);
}

/**
 * Explicit recovery path. It validates a JSON backup completely before replacing
 * SQLite rows; a missing/corrupt backup never clears the active database.
 */
export async function restoreDriveCyclesFromBackup(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  const candidates = [
    indexFile,
    indexBackupPath(indexFile),
    indexFile.replace(/\\.json$/, '.pre-sqlite.json'),
  ];
  let restoredCycles: DriveCycle[] | null = null;
  let sourceFile: string | null = null;
  for (const candidate of candidates) {
    const cycles = await readCyclesFromFile(candidate);
    if (cycles !== null) {
      restoredCycles = cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
      sourceFile = candidate;
      break;
    }
  }
  if (restoredCycles === null || sourceFile === null) {
    throw new Error('NO_VALID_TRIP_HISTORY_BACKUP; SQLITE_DATA_PRESERVED');
  }

  // Do not delete the current database until a valid source has been found.
  if (databasePromise) {
    try { await (await databasePromise).closeAsync(); } catch { /* a failed/corrupt DB may not close */ }
  }
  databasePromise = null;
  const databasePath = sqliteDatabasePath();
  await FileSystem.deleteAsync(databasePath, { idempotent: true });
  await FileSystem.deleteAsync(databasePath + '-wal', { idempotent: true });
  await FileSystem.deleteAsync(databasePath + '-shm', { idempotent: true });
  await FileSystem.deleteAsync(databasePath + '-journal', { idempotent: true });
  const db = await openDriveCycleDatabase(basePath);
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM drive_cycles');
    for (const cycle of restoredCycles as DriveCycle[]) await insertDriveCycle(db, cycle, 'IGNORE');
    await db.runAsync(
      'INSERT OR REPLACE INTO drive_cycle_metadata (key, value) VALUES (?, ?)',
      SQLITE_MIGRATION_KEY, 'completed',
    );
  });
  await refreshLegacyIndexFromSqlite(basePath, db, false);
  await copySqliteFileToSnapshot(basePath);
  return restoredCycles;
}

/** @internal Test-only reset for the module's connection/cache state. */
export function __resetDriveCycleStorageForTests(): void {
  databasePromise = null;
  migrationPromises.clear();
  indexWriteQueues.clear();
}

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

  await serializeIndexWrite(indexFile, async () => {
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
          const hasSeed = originalCycles.some(
            (cycle) => typeof cycle === 'object' && cycle !== null &&
              (cycle as { source?: unknown }).source === 'CARSCANNER_SEED',
          );
          if (hasSeed) {
            const invalidNonSeeds = originalCycles.some((cycle) =>
              !(typeof cycle === 'object' && cycle !== null &&
                (cycle as { source?: unknown }).source === 'CARSCANNER_SEED') &&
              !isDriveCycle(cycle),
            );
            if (invalidNonSeeds) throw new Error('INDEX_HAS_INVALID_CYCLES_DURING_MIGRATION');
            const cycles = cyclesFromUnknown(originalCycles).filter(
              (cycle) => cycle.source !== 'CARSCANNER_SEED',
            );
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
  await ensureSqliteMigration(basePath);
  await refreshLegacyIndexFromSqlite(basePath, await openDriveCycleDatabase(basePath), false);
  await copySqliteFileToSnapshot(basePath);
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
    return valid.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  } catch {
    return null;
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  await ensureSqliteMigration(basePath);
  const db = await openDriveCycleDatabase(basePath);
  return readSqliteDriveCycles(db);
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (!isDriveCycle(cycle)) throw new Error('DRIVE_CYCLE_INVALID_NOT_SAVED');
  if (cycle.source === 'CARSCANNER_SEED') return;
  await ensureSqliteMigration(basePath);
  const indexFile = `${basePath}/VIAGENS/index.json`;
  return serializeIndexWrite(indexFile, async () => {
    const db = await openDriveCycleDatabase(basePath);
    await db.withTransactionAsync(async () => {
      await insertDriveCycle(db, cycle, 'REPLACE');
    });

    // SQLite is authoritative. JSON and the checked DB snapshot remain
    // compatibility/recovery artifacts and are refreshed only after commit.
    await refreshLegacyIndexFromSqlite(basePath, db, true);
    await copySqliteFileToSnapshot(basePath);

    const parsedStart = Date.parse(cycle.startedAt);
    const csvDate = new Date(Number.isFinite(parsedStart) ? parsedStart : Date.now());
    const today = localDateKey(csvDate);
    const csvFile = `${basePath}/VIAGENS/viagens_${today}.csv`;
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
