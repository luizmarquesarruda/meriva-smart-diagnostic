import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { PidQueryResult } from '../obd/elm327';
import storagePolicy from '../knowledge/sqlite_policy.json';

export type SqliteTelemetrySource = 'REAL_OBD' | 'SIMULACAO';

export interface SqliteTelemetrySample {
  id?: number;
  timestamp: string;
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  status: string;
  source: SqliteTelemetrySource;
  command_status: string;
  protocol: string;
  elapsed_ms: number;
  tx: string;
  rx: string;
  session_id: string | null;
}

export interface SqliteDiagnosticsHealth {
  enabled: boolean;
  available: boolean;
  databaseName: string;
  schemaVersion: number;
  sqliteVersion: string | null;
  sampleCount: number | null;
  pendingWrites: number;
  droppedSamples: number;
  maxPendingWrites: number;
  lastError: string | null;
}

const DATABASE_NAME = storagePolicy.databaseName;
const SCHEMA_VERSION = 1;
// Bound memory use if the device is slow or SQLite is temporarily blocked.
// CSV/raw TXT remain the primary diagnostic record when this secondary index is saturated.
export const MAX_PENDING_SQLITE_WRITES: number = storagePolicy.writeQueue.maxPendingWrites;
let pendingWriteCount = 0;
let droppedSampleCount = 0;
let lastQueueFullWarningAt = 0;
let databasePromise: Promise<SQLiteDatabase> | null = null;
let databaseRetryAfterMs = 0;
let writeQueue: Promise<void> = Promise.resolve();
let lastError: string | null = null;
let lastErrorLogAt = 0;

function safeErrorCode(cause: unknown): string {
  const message = cause instanceof Error ? cause.message : String(cause);
  // Persist only a short reason code. Never attach protocol bytes or user data.
  return message.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100) || 'SQLITE_UNKNOWN_ERROR';
}

function logStoreError(cause: unknown): void {
  lastError = safeErrorCode(cause);
  const now = Date.now();
  if (now - lastErrorLogAt >= 60_000) {
    lastErrorLogAt = now;
    console.warn('[sqlite] armazenamento secundário indisponível; TXT/JSON/CSV continuam ativos:', lastError);
  }
}

async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  const currentVersion = Number(row?.version ?? 0);
  if (currentVersion > SCHEMA_VERSION) {
    throw new Error('SQLITE_SCHEMA_NEWER_THAN_APP');
  }
  if (currentVersion >= 1) return;

  await db.withExclusiveTransactionAsync(async (transaction) => {
    await transaction.execAsync(`
      CREATE TABLE IF NOT EXISTS telemetry_samples (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        timestamp TEXT NOT NULL,
        pid TEXT NOT NULL,
        name TEXT NOT NULL,
        value REAL,
        unit TEXT NOT NULL,
        status TEXT NOT NULL,
        source TEXT NOT NULL CHECK (source IN ('REAL_OBD', 'SIMULACAO')),
        command_status TEXT NOT NULL,
        protocol TEXT NOT NULL,
        elapsed_ms INTEGER NOT NULL,
        tx TEXT NOT NULL,
        rx TEXT NOT NULL,
        session_id TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp
        ON telemetry_samples(timestamp);
      CREATE INDEX IF NOT EXISTS idx_telemetry_pid_timestamp
        ON telemetry_samples(pid, timestamp);
    `);
    await transaction.runAsync(
      'INSERT OR IGNORE INTO schema_migrations(version, applied_at) VALUES (?, ?)',
      1,
      new Date().toISOString(),
    );
  });
}

async function getDatabase(): Promise<SQLiteDatabase> {
  if (!storagePolicy.enabled) throw new Error('SQLITE_DISABLED_BY_POLICY');
  if (Date.now() < databaseRetryAfterMs) {
    throw new Error('SQLITE_OPEN_RETRY_COOLDOWN_ACTIVE');
  }
  if (!databasePromise) {
    databasePromise = SQLite.openDatabaseAsync(DATABASE_NAME)
      .then(async (db) => {
        await migrateDatabase(db);
        databaseRetryAfterMs = 0;
        lastError = null;
        return db;
      })
      .catch((cause) => {
        databasePromise = null;
        databaseRetryAfterMs = Date.now() + storagePolicy.database.openRetryCooldownMs;
        throw cause;
      });
  }
  return databasePromise;
}

function enqueueWrite(operation: () => Promise<void>): Promise<boolean> | null {
  if (pendingWriteCount >= MAX_PENDING_SQLITE_WRITES) {
    droppedSampleCount += 1;
    const now = Date.now();
    if (now - lastQueueFullWarningAt >= storagePolicy.writeQueue.warningThrottleMs) {
      lastQueueFullWarningAt = now;
      console.warn(
        '[sqlite] fila secundária cheia; amostras SQLite omitidas:',
        droppedSampleCount,
        '(CSV/TXT canônicos continuam independentes)',
      );
    }
    return null;
  }

  pendingWriteCount += 1;
  const current = writeQueue.catch(() => undefined).then(operation);
  writeQueue = current.catch(() => undefined);
  return current.then(() => true).finally(() => {
    pendingWriteCount = Math.max(0, pendingWriteCount - 1);
  });
}

/**
 * Append one real transport query to the local SQLite index without blocking
 * the ELM327 request loop. REAL_OBD identifies the acquisition channel only;
 * a valid measurement still requires commandStatus=OK, status=RESPONDEU and a
 * finite numeric value. Exact TX/RX are retained for post-incident analysis.
 */
export function recordSqliteTelemetrySample(
  query: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  timestamp = new Date().toISOString(),
  sessionId: string | null = null,
): Promise<boolean> {
  if (!storagePolicy.enabled) return Promise.resolve(false);

  const queued = enqueueWrite(async () => {
    const db = await getDatabase();
    const rowSource: SqliteTelemetrySource = source === 'REAL' ? 'REAL_OBD' : 'SIMULACAO';
    const numericValue = query.parsed.value;
    const safeValue = numericValue != null && Number.isFinite(numericValue) ? numericValue : null;
    await db.runAsync(
      `INSERT INTO telemetry_samples
        (timestamp, pid, name, value, unit, status, source, command_status, protocol, elapsed_ms, tx, rx, session_id)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      timestamp,
      String(query.parsed.pid ?? 'N/D').replace(/\\s/g, '').toUpperCase(),
      String(query.parsed.name ?? 'N/D'),
      safeValue,
      String(query.parsed.unit ?? 'N/D'),
      String(query.parsed.status ?? 'NÃO RESPONDEU'),
      rowSource,
      String(query.commandStatus ?? 'NO_RESPONSE'),
      String(query.protocol ?? 'N/D'),
      Number.isFinite(query.elapsedMs) ? Math.max(0, Math.trunc(query.elapsedMs)) : 0,
      String(query.tx ?? ''),
      String(query.rx ?? ''),
      sessionId,
    );
  });
  if (!queued) return Promise.resolve(false);
  return queued.then(() => {
    lastError = null;
    return true;
  }).catch((cause) => {
    logStoreError(cause);
    return false;
  });
}

export async function getRecentSqliteTelemetrySamples(limit = storagePolicy.retention.defaultQueryLimit): Promise<SqliteTelemetrySample[]> {
  const boundedLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.trunc(limit))) : 200;
  const db = await getDatabase();
  const rows = await db.getAllAsync<SqliteTelemetrySample>(
    'SELECT id, timestamp, pid, name, value, unit, status, source, command_status, protocol, elapsed_ms, tx, rx, session_id FROM telemetry_samples ORDER BY id DESC LIMIT ?',
    boundedLimit,
  );
  return rows;
}

export async function getSqliteDiagnosticsHealth(): Promise<SqliteDiagnosticsHealth> {
  if (!storagePolicy.enabled) {
    return {
      enabled: false,
      available: false,
      databaseName: DATABASE_NAME,
      schemaVersion: SCHEMA_VERSION,
      sqliteVersion: null,
      sampleCount: null,
      pendingWrites: pendingWriteCount,
      droppedSamples: droppedSampleCount,
      maxPendingWrites: MAX_PENDING_SQLITE_WRITES,
      lastError: 'SQLITE_DISABLED_BY_POLICY',
    };
  }

  try {
    const db = await getDatabase();
    const version = await db.getFirstAsync<{ version: string }>('SELECT sqlite_version() AS version');
    const count = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM telemetry_samples');
    return {
      enabled: true,
      available: true,
      databaseName: DATABASE_NAME,
      schemaVersion: SCHEMA_VERSION,
      sqliteVersion: version?.version ?? null,
      sampleCount: Number(count?.count ?? 0),
      pendingWrites: pendingWriteCount,
      droppedSamples: droppedSampleCount,
      maxPendingWrites: MAX_PENDING_SQLITE_WRITES,
      lastError: droppedSampleCount > 0 ? 'SQLITE_WRITE_QUEUE_FULL' : null,
    };
  } catch (cause) {
    logStoreError(cause);
    return {
      enabled: true,
      available: false,
      databaseName: DATABASE_NAME,
      schemaVersion: SCHEMA_VERSION,
      sqliteVersion: null,
      sampleCount: null,
      pendingWrites: pendingWriteCount,
      droppedSamples: droppedSampleCount,
      maxPendingWrites: MAX_PENDING_SQLITE_WRITES,
      lastError,
    };
  }
}

/** Test hook: wait for queued inserts; production code does not need to call it. */
export async function flushSqliteTelemetryWrites(): Promise<void> {
  await writeQueue;
}
