import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DtcRecord, DataSource } from '../types/sourceTypes';
import type { DriveCycle } from '../data/driveCycles';
import type { SensorTestSample, SensorTestMode, SensorAssessmentState } from '../diagnostics/sensorTestEngine';

export const DIAGNOSTIC_DATABASE_NAME = 'meriva-smart-diagnostic.db';
export const DIAGNOSTIC_DATABASE_SCHEMA_VERSION = 1;
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
  schemaVersion: number;
  pidSampleCount: number;
  dtcRecordCount: number;
  tripCount: number;
  sensorTestRunCount: number;
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

let databasePromise: Promise<SQLiteDatabase> | null = null;
let writeQueue: Promise<void> = Promise.resolve();
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
  const db = await SQLite.openDatabaseAsync(DIAGNOSTIC_DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at_utc TEXT NOT NULL
    );
  `);
  const row = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  const version = Number(row?.version ?? 0);
  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(SCHEMA_V1);
      await db.runAsync(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at_utc) VALUES (?, ?)',
        1,
        new Date().toISOString(),
      );
    });
  }
  return db;
}

/** One shared connection; failed initialization can be retried on the next call. */
export function initializeDiagnosticDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = openAndMigrate().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
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
  const db = await initializeDiagnosticDatabase();
  const migration = await db.getFirstAsync<{ version: number }>(
    'SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1',
  );
  const count = async (table: string): Promise<number> => {
    const allowed = ['pid_samples', 'dtc_records', 'trips', 'sensor_test_runs'];
    if (!allowed.includes(table)) return 0;
    const row = await db.getFirstAsync<{ count: number }>('SELECT COUNT(*) AS count FROM ' + table);
    return Number(row?.count ?? 0);
  };
  const [pidSampleCount, dtcRecordCount, tripCount, sensorTestRunCount] = await Promise.all([
    count('pid_samples'),
    count('dtc_records'),
    count('trips'),
    count('sensor_test_runs'),
  ]);
  return {
    schemaVersion: Number(migration?.version ?? 0),
    pidSampleCount,
    dtcRecordCount,
    tripCount,
    sensorTestRunCount,
  };
}

/** Test/lifecycle hook. It closes no native handles; the shared connection lives for process lifetime. */
export function resetDiagnosticDatabaseForTests(): void {
  databasePromise = null;
  writeQueue = Promise.resolve();
  lastLiveSampleAt.clear();
}
