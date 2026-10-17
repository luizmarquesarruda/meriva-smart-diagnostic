import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DtcRecord, DataSource } from '../types/sourceTypes';
import type { DriveCycle } from '../data/driveCycles';
import type { SensorTestSample, SensorTestMode, SensorAssessmentState } from '../diagnostics/sensorTestEngine';
import type { PidQueryResult } from '../obd/elm327';
import sqlitePolicy from '../knowledge/sqlite_policy.json';

export const DIAGNOSTIC_DATABASE_NAME = sqlitePolicy.databaseName;
export const DIAGNOSTIC_DATABASE_SCHEMA_VERSION = 2;
export const MAX_PENDING_SQLITE_WRITES = sqlitePolicy.writeQueue.maxPendingWrites;
export const SQLITE_LIVE_SAMPLE_MIN_INTERVAL_MS = 5_000;

const DATA_SOURCES: readonly DataSource[] = [
  'REAL_OBD',
  'CARSCANNER_BASELINE',
  'USER_REAL_OBSERVATION',
  'SIMULACAO',
  'IMPORTADO',
];

export interface PidSampleInput {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  status: string;
  source: DataSource;
  timestamp: string;
  sessionId?: string | null;
  rawResponse?: string | null;
}

export interface PidSampleRecord extends PidSampleInput {
  id: number;
  timestampLocal: string;
  createdAtUtc: string;
}

export interface SensorAssessmentForStorage {
  pid: string;
  state: SensorAssessmentState;
}

export interface SensorTestRunInput {
  id: string;
  mode: SensorTestMode;
  startedAt: string;
  finishedAt: string;
  completed: boolean;
  source: DataSource;
  samples: readonly SensorTestSample[];
  assessments?: readonly SensorAssessmentForStorage[];
}

export interface DiagnosticDatabaseHealth {
  enabled: boolean;
  available: boolean;
  databaseName: string;
  schemaVersion: number;
  sqliteVersion: string | null;
  pidSampleCount: number | null;
  telemetrySampleCount: number | null;
  dtcRecordCount: number | null;
  tripCount: number | null;
  sensorTestRunCount: number | null;
  pendingWrites: number;
  droppedSamples: number;
  maxPendingWrites: number;
  lastError: string | null;
}

const SCHEMA_V1 = `
CREATE TABLE IF NOT EXISTS pid_samples (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pid TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  status TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_BASELINE','USER_REAL_OBSERVATION','SIMULACAO','IMPORTADO')),
  observed_at_utc TEXT NOT NULL,
  observed_at_local TEXT NOT NULL,
  session_id TEXT,
  raw_response TEXT,
  created_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_pid_samples_pid_time ON pid_samples(pid, observed_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_pid_samples_source_time ON pid_samples(source, observed_at_utc DESC);

CREATE TABLE IF NOT EXISTS dtc_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL,
  description TEXT,
  status TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_BASELINE','USER_REAL_OBSERVATION','SIMULACAO','IMPORTADO')),
  first_seen_utc TEXT NOT NULL,
  last_seen_utc TEXT NOT NULL,
  occurrences INTEGER NOT NULL DEFAULT 1 CHECK (occurrences >= 0),
  historical INTEGER NOT NULL DEFAULT 0 CHECK (historical IN (0,1)),
  confirmed INTEGER,
  details_json TEXT,
  UNIQUE(code, status, source)
);
CREATE INDEX IF NOT EXISTS idx_dtc_records_code_status ON dtc_records(code, status);
CREATE INDEX IF NOT EXISTS idx_dtc_records_last_seen ON dtc_records(last_seen_utc DESC);

CREATE TABLE IF NOT EXISTS trips (
  id TEXT PRIMARY KEY NOT NULL,
  started_at_utc TEXT NOT NULL,
  started_at_local TEXT NOT NULL,
  finished_at_utc TEXT NOT NULL,
  finished_at_local TEXT NOT NULL,
  distance_total_km REAL NOT NULL CHECK (distance_total_km >= 0),
  fuel_used_l REAL NOT NULL CHECK (fuel_used_l >= 0),
  average_consumption_kml REAL,
  average_speed_kmh REAL,
  max_speed_kmh REAL,
  fuel_data_valid INTEGER NOT NULL DEFAULT 0 CHECK (fuel_data_valid IN (0,1)),
  fuel_rate_source TEXT,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_SEED','SIMULACAO')),
  stored_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_trips_started_at ON trips(started_at_utc DESC);
CREATE INDEX IF NOT EXISTS idx_trips_source_started_at ON trips(source, started_at_utc DESC);

CREATE TABLE IF NOT EXISTS trip_telemetry (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  trip_id TEXT NOT NULL REFERENCES trips(id) ON DELETE CASCADE,
  observed_at_utc TEXT NOT NULL,
  speed_kmh REAL,
  rpm REAL,
  coolant_temp_c REAL,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','SIMULACAO','IMPORTADO'))
);
CREATE INDEX IF NOT EXISTS idx_trip_telemetry_trip_time ON trip_telemetry(trip_id, observed_at_utc);

CREATE TABLE IF NOT EXISTS sensor_test_runs (
  id TEXT PRIMARY KEY NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('ENGINE_OFF','ENGINE_ON')),
  started_at_utc TEXT NOT NULL,
  started_at_local TEXT NOT NULL,
  finished_at_utc TEXT NOT NULL,
  finished_at_local TEXT NOT NULL,
  completed INTEGER NOT NULL CHECK (completed IN (0,1)),
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_BASELINE','USER_REAL_OBSERVATION','SIMULACAO','IMPORTADO')),
  sample_count INTEGER NOT NULL DEFAULT 0 CHECK (sample_count >= 0),
  saved_at_utc TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_sensor_test_runs_start ON sensor_test_runs(started_at_utc DESC);

CREATE TABLE IF NOT EXISTS sensor_test_results (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES sensor_test_runs(id) ON DELETE CASCADE,
  pid TEXT NOT NULL,
  name TEXT NOT NULL,
  value REAL,
  unit TEXT NOT NULL,
  status TEXT NOT NULL,
  raw_response TEXT NOT NULL,
  elapsed_ms REAL NOT NULL DEFAULT 0 CHECK (elapsed_ms >= 0),
  reading_number INTEGER,
  observed_at_utc TEXT NOT NULL,
  assessment_state TEXT,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_BASELINE','USER_REAL_OBSERVATION','SIMULACAO','IMPORTADO')),
  UNIQUE(run_id, pid, reading_number, observed_at_utc)
);
CREATE INDEX IF NOT EXISTS idx_sensor_test_results_run_pid ON sensor_test_results(run_id, pid);

CREATE TABLE IF NOT EXISTS diagnostic_runs (
  id TEXT PRIMARY KEY NOT NULL,
  generated_at_utc TEXT NOT NULL,
  source TEXT NOT NULL CHECK (source IN ('REAL_OBD','CARSCANNER_BASELINE','USER_REAL_OBSERVATION','SIMULACAO','IMPORTADO')),
  hypotheses_json TEXT NOT NULL,
  blocked_simulation_samples INTEGER NOT NULL DEFAULT 0,
  blocked_stale_samples INTEGER NOT NULL DEFAULT 0,
  blocked_non_live_dtcs INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_diagnostic_runs_generated ON diagnostic_runs(generated_at_utc DESC);
`;

const SCHEMA_V2 = `
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
  elapsed_ms INTEGER NOT NULL CHECK (elapsed_ms >= 0),
  tx TEXT NOT NULL,
  rx TEXT NOT NULL,
  session_id TEXT
);
CREATE INDEX IF NOT EXISTS idx_telemetry_timestamp ON telemetry_samples(timestamp);
CREATE INDEX IF NOT EXISTS idx_telemetry_pid_timestamp ON telemetry_samples(pid, timestamp);
`;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
let databaseRetryAfterMs = 0;
let pendingTelemetryWrites = 0;
let droppedTelemetrySamples = 0;
let lastQueueFullWarningAt = 0;
let lastDatabaseError: string | null = null;
let lastDatabaseErrorLogAt = 0;
const lastLiveSampleAt = new Map<string, number>();

function isDataSource(value: unknown): value is DataSource {
  return typeof value === 'string' && DATA_SOURCES.includes(value as DataSource);
}

function normalizePid(pid: string): string {
  return pid.replace(/\s/g, '').toUpperCase();
}

function parseTimestamp(value: string): Date | null {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function toUtc(value: string): string | null {
  const date = parseTimestamp(value);
  return date ? date.toISOString() : null;
}

function toLocal(value: string): string | null {
  const date = parseTimestamp(value);
  return date ? date.toLocaleString() : null;
}

function enqueueWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = writeQueue.then(operation, operation);
  writeQueue = result.then(() => undefined, () => undefined);
  return result;
}

async function openAndMigrate(): Promise<SQLiteDatabase> {
  if (!sqlitePolicy.enabled) throw new Error('SQLITE_DISABLED_BY_POLICY');
  if (Date.now() < databaseRetryAfterMs) throw new Error('SQLITE_OPEN_RETRY_COOLDOWN_ACTIVE');

  const db = await SQLite.openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at_utc TEXT NOT NULL
    );
  `);
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
  );
  let version = Number(row?.version ?? 0);
  if (version > DIAGNOSTIC_DATABASE_SCHEMA_VERSION) throw new Error('SQLITE_SCHEMA_NEWER_THAN_APP');
  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V1);
      await db.runAsync(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at_utc) VALUES (?, ?)',
        1,
        new Date().toISOString(),
      );
    });
    version = 1;
  }
  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V2);
      await db.runAsync(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at_utc) VALUES (?, ?)',
        2,
        new Date().toISOString(),
      );
    });
  }
  databaseRetryAfterMs = 0;
  lastDatabaseError = null;
  return db;
}

/** One shared connection; failed initialization backs off and can be retried later. */
export function initializeDiagnosticDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndMigrate().catch((error) => {
      databasePromise = null;
      const message = error instanceof Error ? error.message : String(error);
      // Não prolongar o cooldown a cada consulta que chega durante a janela de espera.
      if (message !== 'SQLITE_OPEN_RETRY_COOLDOWN_ACTIVE') {
        databaseRetryAfterMs = Date.now() + sqlitePolicy.database.openRetryCooldownMs;
      }
      lastDatabaseError = message.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100) || 'SQLITE_OPEN_FAILED';
      throw error;
    });
  }
  return databasePromise;
}

/**
 * Append the exact OBD query to the secondary local index, including failures.
 * Bounded queue drops only secondary SQLite records if storage is blocked; CSV/TXT remain authoritative.
 */
export async function recordTelemetryQuery(
  query: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  timestamp = new Date().toISOString(),
  sessionId: string | null = null,
): Promise<boolean> {
  if (!sqlitePolicy.enabled) return false;
  if (pendingTelemetryWrites >= MAX_PENDING_SQLITE_WRITES) {
    droppedTelemetrySamples += 1;
    const now = Date.now();
    if (now - lastQueueFullWarningAt >= sqlitePolicy.writeQueue.warningThrottleMs) {
      lastQueueFullWarningAt = now;
      console.warn('[sqlite] fila secundária cheia; amostras omitidas:', droppedTelemetrySamples);
    }
    return false;
  }
  pendingTelemetryWrites += 1;
  try {
    const db = await initializeDiagnosticDatabase();
    const numericValue = query.parsed.value;
    const safeValue = numericValue != null && Number.isFinite(numericValue) ? numericValue : null;
    await enqueueWrite(async () => {
      await db.runAsync(
        `INSERT INTO telemetry_samples
          (timestamp, pid, name, value, unit, status, source, command_status, protocol, elapsed_ms, tx, rx, session_id)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        toUtc(timestamp) ?? new Date().toISOString(),
        normalizePid(String(query.parsed.pid ?? 'N/D')),
        String(query.parsed.name ?? 'N/D'),
        safeValue,
        String(query.parsed.unit ?? 'N/D'),
        String(query.parsed.status ?? 'NÃO RESPONDEU'),
        source === 'REAL' ? 'REAL_OBD' : 'SIMULACAO',
        String(query.commandStatus ?? 'NO_RESPONSE'),
        String(query.protocol ?? 'N/D'),
        Number.isFinite(query.elapsedMs) ? Math.max(0, Math.trunc(query.elapsedMs)) : 0,
        String(query.tx ?? ''),
        String(query.rx ?? ''),
        sessionId,
      );
    });
    lastDatabaseError = null;
    return true;
  } catch (cause) {
    lastDatabaseError = cause instanceof Error
      ? cause.message.replace(/[^A-Za-z0-9_.:-]/g, '_').slice(0, 100)
      : 'SQLITE_WRITE_FAILED';
    const now = Date.now();
    if (now - lastDatabaseErrorLogAt >= 60_000) {
      lastDatabaseErrorLogAt = now;
      console.warn('[sqlite] telemetria secundária falhou; CSV/TXT mantidos:', lastDatabaseError);
    }
    return false;
  } finally {
    pendingTelemetryWrites = Math.max(0, pendingTelemetryWrites - 1);
  }
}

export async function recordPidSample(sample: PidSampleInput): Promise<number | null> {
  const pid = normalizePid(sample.pid);
  const timestampUtc = toUtc(sample.timestamp);
  if (!pid || !timestampUtc || !isDataSource(sample.source)) return null;
  if (sample.value !== null && !Number.isFinite(sample.value)) return null;
  const db = await initializeDiagnosticDatabase();
  return enqueueWrite(async () => {
    const result = await db.runAsync(
      `INSERT INTO pid_samples
        (pid, name, value, unit, status, source, observed_at_utc, observed_at_local, session_id, raw_response, created_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      pid,
      sample.name || pid,
      sample.value,
      sample.unit || 'N/D',
      sample.status || 'N/D',
      sample.source,
      timestampUtc,
      toLocal(timestampUtc) ?? timestampUtc,
      sample.sessionId ?? null,
      sample.rawResponse ?? null,
      new Date().toISOString(),
    );
    return result.lastInsertRowId;
  });
}

/** Throttle only history sampling; live values remain updated in the existing in-memory telemetry cache. */
export async function recordLivePidSample(sample: PidSampleInput, nowMs = Date.now()): Promise<boolean> {
  const key = sample.source + ':' + normalizePid(sample.pid);
  const last = lastLiveSampleAt.get(key);
  if (last !== undefined && nowMs - last < SQLITE_LIVE_SAMPLE_MIN_INTERVAL_MS) return false;
  const timestamp = parseTimestamp(sample.timestamp);
  if (!timestamp || !Number.isFinite(sample.value) || !isDataSource(sample.source)) return false;
  lastLiveSampleAt.set(key, nowMs);
  await recordPidSample(sample);
  return true;
}

export async function readPidHistory(
  pid: string,
  limit = 500,
  source?: DataSource,
): Promise<PidSampleRecord[]> {
  const db = await initializeDiagnosticDatabase();
  const safeLimit = Math.max(1, Math.min(20_000, Math.floor(Number.isFinite(limit) ? limit : 500)));
  const normalized = normalizePid(pid);
  const rows = source
    ? await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, pid, name, value, unit, status, source, observed_at_utc, observed_at_local, session_id, raw_response, created_at_utc
       FROM pid_samples WHERE pid = ? AND source = ? ORDER BY observed_at_utc DESC LIMIT ?`,
      normalized,
      source,
      safeLimit,
    )
    : await db.getAllAsync<Record<string, unknown>>(
      `SELECT id, pid, name, value, unit, status, source, observed_at_utc, observed_at_local, session_id, raw_response, created_at_utc
       FROM pid_samples WHERE pid = ? ORDER BY observed_at_utc DESC LIMIT ?`,
      normalized,
      safeLimit,
    );
  return rows.map((row) => ({
    id: Number(row.id),
    pid: String(row.pid),
    name: String(row.name),
    value: row.value == null ? null : Number(row.value),
    unit: String(row.unit),
    status: String(row.status),
    source: String(row.source) as DataSource,
    timestamp: String(row.observed_at_utc),
    timestampLocal: String(row.observed_at_local),
    sessionId: row.session_id == null ? null : String(row.session_id),
    rawResponse: row.raw_response == null ? null : String(row.raw_response),
    createdAtUtc: String(row.created_at_utc),
  }));
}

export async function persistDtcHistory(records: readonly DtcRecord[]): Promise<void> {
  if (!records.length) return;
  const db = await initializeDiagnosticDatabase();
  await enqueueWrite(() => db.withTransactionAsync(async () => {
    for (const item of records) {
      if (!/^[PBCU][0-3][0-9A-F]{3}$/i.test(item.code)) continue;
      if (!isDataSource(item.source)) continue;
      const firstSeen = toUtc(item.firstSeen);
      const lastSeen = toUtc(item.lastSeen);
      if (!firstSeen || !lastSeen) continue;
      const details = JSON.stringify({
        historical: Boolean(item.historical),
        freezeFrame: item.freezeFrame ?? null,
      });
      await db.runAsync(
        `INSERT INTO dtc_records
          (code, description, status, source, first_seen_utc, last_seen_utc, occurrences, historical, confirmed, details_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(code, status, source) DO UPDATE SET
           description = excluded.description,
           first_seen_utc = MIN(dtc_records.first_seen_utc, excluded.first_seen_utc),
           last_seen_utc = MAX(dtc_records.last_seen_utc, excluded.last_seen_utc),
           occurrences = MAX(dtc_records.occurrences, excluded.occurrences),
           historical = MAX(dtc_records.historical, excluded.historical),
           confirmed = COALESCE(excluded.confirmed, dtc_records.confirmed),
           details_json = excluded.details_json`,
        item.code.toUpperCase(),
        item.description ?? null,
        item.status,
        item.source,
        firstSeen,
        lastSeen,
        Math.max(0, Math.floor(item.occurrences || 0)),
        item.historical ? 1 : 0,
        item.confirmed == null ? null : item.confirmed ? 1 : 0,
        details,
      );
    }
  }));
}

export async function upsertDriveCycle(cycle: DriveCycle): Promise<boolean> {
  // Historical seeds and simulations never enter the real-trips table.
  if (cycle.source !== 'REAL_OBD') return false;
  const startedUtc = toUtc(cycle.startedAt);
  const finishedUtc = toUtc(cycle.finishedAt);
  if (!startedUtc || !finishedUtc) return false;
  const db = await initializeDiagnosticDatabase();
  await enqueueWrite(() => db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO trips
        (id, started_at_utc, started_at_local, finished_at_utc, finished_at_local, distance_total_km, fuel_used_l,
         average_consumption_kml, average_speed_kmh, max_speed_kmh, fuel_data_valid, fuel_rate_source, source, stored_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REAL_OBD', ?)
       ON CONFLICT(id) DO UPDATE SET
         finished_at_utc = excluded.finished_at_utc,
         finished_at_local = excluded.finished_at_local,
         distance_total_km = excluded.distance_total_km,
         fuel_used_l = excluded.fuel_used_l,
         average_consumption_kml = excluded.average_consumption_kml,
         average_speed_kmh = excluded.average_speed_kmh,
         max_speed_kmh = excluded.max_speed_kmh,
         fuel_data_valid = excluded.fuel_data_valid,
         fuel_rate_source = excluded.fuel_rate_source`,
      cycle.id,
      startedUtc,
      toLocal(startedUtc) ?? startedUtc,
      finishedUtc,
      toLocal(finishedUtc) ?? finishedUtc,
      Math.max(0, Number(cycle.distanceTotalKm) || 0),
      Math.max(0, Number(cycle.fuelUsedL) || 0),
      cycle.fuelDataValid === false || !(cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0)
        ? null
        : cycle.avgFuelConsumptionKml,
      Number.isFinite(cycle.avgDrivingSpeedKmh) && cycle.avgDrivingSpeedKmh >= 0 ? cycle.avgDrivingSpeedKmh : null,
      Number.isFinite(cycle.maxSpeedKmh) && (cycle.maxSpeedKmh ?? -1) >= 0 ? cycle.maxSpeedKmh as number : null,
      cycle.fuelDataValid === false || !(cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0) ? 0 : 1,
      cycle.fuelRateSource ?? null,
      new Date().toISOString(),
    );
    await db.runAsync('DELETE FROM trip_telemetry WHERE trip_id = ?', cycle.id);
    for (const sample of cycle.telemetrySamples ?? []) {
      await db.runAsync(
        `INSERT INTO trip_telemetry (trip_id, observed_at_utc, speed_kmh, rpm, coolant_temp_c, source)
         VALUES (?, ?, ?, ?, ?, 'REAL_OBD')`,
        cycle.id,
        toUtc(sample.timestamp) ?? new Date().toISOString(),
        Number.isFinite(sample.speedKmh) ? sample.speedKmh : null,
        Number.isFinite(sample.rpm) ? sample.rpm : null,
        Number.isFinite(sample.coolantTempC) ? sample.coolantTempC : null,
      );
    }
  }));
  return true;
}

export async function saveSensorTestRun(run: SensorTestRunInput): Promise<void> {
  if (!run.id.trim() || !isDataSource(run.source)) throw new Error('Metadados do teste de sensor inválidos.');
  const startedUtc = toUtc(run.startedAt);
  const finishedUtc = toUtc(run.finishedAt);
  if (!startedUtc || !finishedUtc) throw new Error('Timestamps inválidos no relatório de sensores.');
  const db = await initializeDiagnosticDatabase();
  const assessments = new Map((run.assessments ?? []).map((item) => [normalizePid(item.pid), item.state]));
  await enqueueWrite(() => db.withTransactionAsync(async () => {
    await db.runAsync(
      `INSERT INTO sensor_test_runs
        (id, mode, started_at_utc, started_at_local, finished_at_utc, finished_at_local, completed, source, sample_count, saved_at_utc)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(id) DO UPDATE SET
         finished_at_utc = excluded.finished_at_utc,
         finished_at_local = excluded.finished_at_local,
         completed = excluded.completed,
         sample_count = excluded.sample_count`,
      run.id,
      run.mode,
      startedUtc,
      toLocal(startedUtc) ?? startedUtc,
      finishedUtc,
      toLocal(finishedUtc) ?? finishedUtc,
      run.completed ? 1 : 0,
      run.source,
      run.samples.length,
      new Date().toISOString(),
    );
    for (const sample of run.samples) {
      if (!/^01[0-9A-F]{2}$/i.test(normalizePid(sample.pid))) continue;
      const timestampUtc = toUtc(sample.timestamp);
      if (!timestampUtc) continue;
      const readingNumber = sample.readingNumber ?? null;
      await db.runAsync(
        `INSERT OR IGNORE INTO sensor_test_results
          (run_id, pid, name, value, unit, status, raw_response, elapsed_ms, reading_number, observed_at_utc, assessment_state, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        run.id,
        normalizePid(sample.pid),
        sample.name,
        sample.value !== null && Number.isFinite(sample.value) ? sample.value : null,
        sample.unit || 'N/D',
        sample.status || 'N/D',
        sample.rawResponse || '',
        Math.max(0, Number(sample.elapsedMs) || 0),
        readingNumber,
        timestampUtc,
        assessments.get(normalizePid(sample.pid)) ?? null,
        run.source,
      );
    }
  }));
}

export async function getDiagnosticDatabaseHealth(): Promise<DiagnosticDatabaseHealth> {
  const base = {
    enabled: Boolean(sqlitePolicy.enabled),
    available: false,
    databaseName: DIAGNOSTIC_DATABASE_NAME,
    schemaVersion: 0,
    sqliteVersion: null as string | null,
    pidSampleCount: null as number | null,
    telemetrySampleCount: null as number | null,
    dtcRecordCount: null as number | null,
    tripCount: null as number | null,
    sensorTestRunCount: null as number | null,
    pendingWrites: pendingTelemetryWrites,
    droppedSamples: droppedTelemetrySamples,
    maxPendingWrites: MAX_PENDING_SQLITE_WRITES,
    lastError: lastDatabaseError,
  };
  if (!sqlitePolicy.enabled) return { ...base, lastError: 'SQLITE_DISABLED_BY_POLICY' };
  try {
    const db = await initializeDiagnosticDatabase();
    const migration = await db.getFirstAsync<{ version: number }>(
      'SELECT COALESCE(MAX(version), 0) AS version FROM schema_migrations',
    );
    const count = async (table: string): Promise<number> => {
      const allowed = ['pid_samples', 'telemetry_samples', 'dtc_records', 'trips', 'sensor_test_runs'];
      if (!allowed.includes(table)) return 0;
      const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM ' + table);
      return Number(row?.count ?? 0);
    };
    const [sqliteVersion, pidSampleCount, telemetrySampleCount, dtcRecordCount, tripCount, sensorTestRunCount] = await Promise.all([
      db.getFirstAsync<{ version: string }>('SELECT sqlite_version() AS version'),
      count('pid_samples'),
      count('telemetry_samples'),
      count('dtc_records'),
      count('trips'),
      count('sensor_test_runs'),
    ]);
    return {
      ...base,
      available: true,
      schemaVersion: Number(migration?.version ?? 0),
      sqliteVersion: sqliteVersion?.version ?? null,
      pidSampleCount,
      telemetrySampleCount,
      dtcRecordCount,
      tripCount,
      sensorTestRunCount,
      lastError: droppedTelemetrySamples > 0 ? 'SQLITE_WRITE_QUEUE_FULL' : lastDatabaseError,
    };
  } catch {
    return { ...base, lastError: lastDatabaseError ?? 'SQLITE_UNAVAILABLE' };
  }
}

/** Test/lifecycle hook. It closes no native handles; the shared connection lives for process lifetime. */
export function resetDiagnosticDatabaseForTests(): void {
  databasePromise = null;
  writeQueue = Promise.resolve();
  lastLiveSampleAt.clear();
  databaseRetryAfterMs = 0;
  pendingTelemetryWrites = 0;
  droppedTelemetrySamples = 0;
  lastQueueFullWarningAt = 0;
  lastDatabaseError = null;
  lastDatabaseErrorLogAt = 0;
}
