import * as SQLite from 'expo-sqlite';
import type { DriveCycle } from '../data/driveCycles';

type Database = Awaited<ReturnType<typeof SQLite.openDatabaseAsync>>;
const DATABASE_NAME = 'meriva-smart-diagnostic.db';
const SCHEMA_VERSION = 1;
let databasePromise: Promise<Database> | null = null;
let transactionQueue: Promise<void> = Promise.resolve();

export interface LocalSessionEvent {
  date: string;
  eventType: 'SESSION_START' | 'SESSION_END' | 'SESSION_RECOVERED';
  timestamp: string;
  renderedTxt: string;
  payload?: unknown;
}

export interface StoredSensorReading {
  readingIndex: number;
  sample: {
    pid: string;
    name: string;
    value: number | null;
    unit: string;
    status: string;
    rawResponse: string;
    elapsedMs: number;
    timestamp: string;
    readingNumber?: number;
  };
  assessmentState?: string;
  assessmentTitle?: string;
}

export interface StoredSensorTestRun {
  id: string;
  startedAt: string;
  savedAt: string;
  mode: string;
  completed: boolean;
  catalogId: string;
  protocol: string;
  plannedPids: number;
  plannedReadings: number;
  elapsedMs: number;
  readings: StoredSensorReading[];
}

async function initializeDatabase(): Promise<Database> {
  const db = await SQLite.openDatabaseAsync(DATABASE_NAME);
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS app_metadata (
      key TEXT PRIMARY KEY NOT NULL,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS drive_cycles (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT NOT NULL,
      source TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_drive_cycles_started_at ON drive_cycles(started_at);
    CREATE INDEX IF NOT EXISTS idx_drive_cycles_source_started_at ON drive_cycles(source, started_at);
    CREATE TABLE IF NOT EXISTS obd_session_events (
      event_id TEXT PRIMARY KEY NOT NULL,
      event_date TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_at TEXT NOT NULL,
      rendered_txt TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_obd_session_events_date ON obd_session_events(event_date, event_at);
    CREATE TABLE IF NOT EXISTS sensor_test_runs (
      id TEXT PRIMARY KEY NOT NULL,
      started_at TEXT NOT NULL,
      saved_at TEXT NOT NULL,
      mode TEXT NOT NULL,
      status TEXT NOT NULL,
      catalog_id TEXT NOT NULL,
      protocol TEXT NOT NULL,
      payload_json TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sensor_test_runs_started_at ON sensor_test_runs(started_at);
    CREATE TABLE IF NOT EXISTS sensor_test_readings (
      run_id TEXT NOT NULL,
      reading_index INTEGER NOT NULL,
      pid TEXT NOT NULL,
      value REAL,
      unit TEXT NOT NULL,
      parser_status TEXT NOT NULL,
      raw_response TEXT NOT NULL,
      elapsed_ms INTEGER NOT NULL,
      observed_at TEXT NOT NULL,
      assessment_state TEXT NOT NULL,
      assessment_title TEXT NOT NULL,
      payload_json TEXT NOT NULL,
      PRIMARY KEY (run_id, reading_index),
      FOREIGN KEY (run_id) REFERENCES sensor_test_runs(id) ON DELETE CASCADE
    );
    CREATE INDEX IF NOT EXISTS idx_sensor_test_readings_pid_time ON sensor_test_readings(pid, observed_at);
  `);
  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  if (!row || row.user_version < SCHEMA_VERSION) {
    await db.execAsync(`PRAGMA user_version = ${SCHEMA_VERSION};`);
  }
  return db;
}

/** Single-flight connection: all repositories share one SQLite handle. */
export async function getLocalDatabase(): Promise<Database> {
  if (!databasePromise) {
    databasePromise = initializeDatabase().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

/** Serialize multi-table writes in an exclusive transaction. */
export async function withLocalTransaction<T>(operation: (transaction: Database) => Promise<T>): Promise<T> {
  // Serialize app-originated writes: SDK 51 opens a dedicated connection for
  // exclusive transactions and competing writers can otherwise receive SQLITE_BUSY.
  const pending = transactionQueue.catch(() => undefined).then(async () => {
    const db = await getLocalDatabase();
    let result!: T;
    await db.withExclusiveTransactionAsync(async (transaction) => {
      result = await operation(transaction);
    });
    return result;
  });
  transactionQueue = pending.then(() => undefined, () => undefined);
  return pending;
}

export async function getLocalMetadata(key: string): Promise<string | null> {
  const db = await getLocalDatabase();
  const row = await db.getFirstAsync<{ value: string }>(
    'SELECT value FROM app_metadata WHERE key = ?',
    key,
  );
  return row?.value ?? null;
}

async function setMetadataInTransaction(db: Database, key: string, value: string): Promise<void> {
  await db.runAsync(
    'INSERT OR REPLACE INTO app_metadata (key, value, updated_at) VALUES (?, ?, ?)',
    key,
    value,
    new Date().toISOString(),
  );
}

export async function setLocalMetadata(key: string, value: string): Promise<void> {
  await withLocalTransaction(async (transaction) => setMetadataInTransaction(transaction, key, value));
}

async function writeCycle(db: Database, cycle: DriveCycle, ignoreExisting: boolean): Promise<void> {
  if (cycle.source === 'CARSCANNER_SEED') return;
  const command = ignoreExisting ? 'INSERT OR IGNORE' : 'INSERT OR REPLACE';
  await db.runAsync(
    `${command} INTO drive_cycles (id, started_at, finished_at, source, payload_json, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)`,
    cycle.id,
    cycle.startedAt,
    cycle.finishedAt,
    cycle.source,
    JSON.stringify(cycle),
    new Date().toISOString(),
  );
}

/** Import legacy JSON exactly once; INSERT OR IGNORE makes recovery repeat-safe. */
export async function importLegacyDriveCycles(cycles: DriveCycle[]): Promise<void> {
  await withLocalTransaction(async (transaction) => {
    const alreadyMigrated = await transaction.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_metadata WHERE key = ?',
      'migration.drive_cycles.v1',
    );
    if (alreadyMigrated?.value === 'complete') return;
    for (const cycle of cycles) await writeCycle(transaction, cycle, true);
    await setMetadataInTransaction(transaction, 'migration.drive_cycles.v1', 'complete');
  });
}

export async function upsertDriveCycle(cycle: DriveCycle): Promise<void> {
  if (cycle.source === 'CARSCANNER_SEED') return;
  await withLocalTransaction(async (transaction) => writeCycle(transaction, cycle, false));
}

export async function readDriveCyclesFromDatabase(): Promise<DriveCycle[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<{ payload_json: string }>(
    "SELECT payload_json FROM drive_cycles WHERE source <> 'CARSCANNER_SEED' ORDER BY started_at ASC",
  );
  const result: DriveCycle[] = [];
  for (const row of rows) {
    try {
      const value = JSON.parse(row.payload_json) as DriveCycle;
      if (value && value.source !== 'CARSCANNER_SEED') result.push(value);
    } catch {
      // Skip an invalid individual payload instead of failing the entire history.
    }
  }
  return result;
}

function eventId(event: LocalSessionEvent): string {
  return `${event.date}|${event.eventType}|${event.timestamp}`;
}

async function writeSessionEvent(db: Database, event: LocalSessionEvent): Promise<void> {
  await db.runAsync(
    `INSERT OR IGNORE INTO obd_session_events
      (event_id, event_date, event_type, event_at, rendered_txt, payload_json)
      VALUES (?, ?, ?, ?, ?, ?)`,
    eventId(event),
    event.date,
    event.eventType,
    event.timestamp,
    event.renderedTxt,
    JSON.stringify(event.payload ?? {}),
  );
}

/** One-time, idempotent migration of existing daily TXT event blocks. */
export async function importLegacyObdSessionEvents(
  events: LocalSessionEvent[],
  migrationKey = 'migration.daily_obd_history.v1',
): Promise<void> {
  await withLocalTransaction(async (transaction) => {
    const alreadyMigrated = await transaction.getFirstAsync<{ value: string }>(
      'SELECT value FROM app_metadata WHERE key = ?',
      migrationKey,
    );
    if (alreadyMigrated?.value === 'complete') return;
    for (const event of events) await writeSessionEvent(transaction, event);
    await setMetadataInTransaction(transaction, migrationKey, 'complete');
  });
}

export async function recordObdSessionEvent(event: LocalSessionEvent): Promise<void> {
  await withLocalTransaction(async (transaction) => writeSessionEvent(transaction, event));
}
export interface LocalSessionEventRecord extends LocalSessionEvent {
  eventId: string;
}

export async function readLocalSessionEvents(options: {
  fromDate?: string;
  toDate?: string;
  limit?: number;
} = {}): Promise<LocalSessionEventRecord[]> {
  const db = await getLocalDatabase();
  const clauses: string[] = [];
  const values: Array<string | number> = [];
  if (options.fromDate) { clauses.push('event_date >= ?'); values.push(options.fromDate); }
  if (options.toDate) { clauses.push('event_date <= ?'); values.push(options.toDate); }
  const limit = Number.isFinite(options.limit) ? Math.min(5000, Math.max(1, Math.floor(options.limit as number))) : 500;
  values.push(limit);
  const where = clauses.length ? ' WHERE ' + clauses.join(' AND ') : '';
  const rows = await db.getAllAsync<{
    event_id: string; event_date: string; event_type: LocalSessionEvent['eventType'];
    event_at: string; rendered_txt: string; payload_json: string;
  }>(`SELECT event_id, event_date, event_type, event_at, rendered_txt, payload_json
      FROM obd_session_events${where} ORDER BY event_at DESC LIMIT ?`, ...values);
  return rows.map((row) => {
    let payload: unknown = {};
    try { payload = JSON.parse(row.payload_json); } catch { /* retain event with empty payload */ }
    return {
      eventId: row.event_id, date: row.event_date, eventType: row.event_type,
      timestamp: row.event_at, renderedTxt: row.rendered_txt, payload,
    };
  });
}

export async function saveSensorTestRun(run: StoredSensorTestRun): Promise<void> {
  await withLocalTransaction(async (transaction) => {
    await transaction.runAsync(
      `INSERT OR REPLACE INTO sensor_test_runs
       (id, started_at, saved_at, mode, status, catalog_id, protocol, payload_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      run.id,
      run.startedAt,
      run.savedAt,
      run.mode,
      run.completed ? 'COMPLETE' : 'PARTIAL',
      run.catalogId,
      run.protocol,
      JSON.stringify({
        plannedPids: run.plannedPids,
        plannedReadings: run.plannedReadings,
        elapsedMs: run.elapsedMs,
        readingCount: run.readings.length,
      }),
    );
    await transaction.runAsync('DELETE FROM sensor_test_readings WHERE run_id = ?', run.id);
    for (const reading of run.readings) {
      await transaction.runAsync(
        `INSERT INTO sensor_test_readings
         (run_id, reading_index, pid, value, unit, parser_status, raw_response, elapsed_ms,
          observed_at, assessment_state, assessment_title, payload_json)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        run.id,
        reading.readingIndex,
        reading.sample.pid,
        reading.sample.value,
        reading.sample.unit,
        reading.sample.status,
        reading.sample.rawResponse,
        Math.max(0, Math.round(reading.sample.elapsedMs)),
        reading.sample.timestamp,
        reading.assessmentState ?? 'NAO_CONCLUSIVO',
        reading.assessmentTitle ?? 'N/D',
        JSON.stringify(reading.sample),
      );
    }
  });
}

export interface StoredSensorTestRunSummary {
  id: string;
  startedAt: string;
  savedAt: string;
  mode: string;
  status: 'COMPLETE' | 'PARTIAL';
  catalogId: string;
  protocol: string;
  metadata: Record<string, unknown>;
}

export async function readSensorTestRuns(limit = 100): Promise<StoredSensorTestRunSummary[]> {
  const db = await getLocalDatabase();
  const safeLimit = Number.isFinite(limit) ? Math.min(1000, Math.max(1, Math.floor(limit))) : 100;
  const rows = await db.getAllAsync<{
    id: string; started_at: string; saved_at: string; mode: string; status: 'COMPLETE' | 'PARTIAL';
    catalog_id: string; protocol: string; payload_json: string;
  }>('SELECT id, started_at, saved_at, mode, status, catalog_id, protocol, payload_json FROM sensor_test_runs ORDER BY started_at DESC LIMIT ?', safeLimit);
  return rows.map((row) => {
    let metadata: Record<string, unknown> = {};
    try { metadata = JSON.parse(row.payload_json) as Record<string, unknown>; } catch { /* retain summary */ }
    return {
      id: row.id, startedAt: row.started_at, savedAt: row.saved_at, mode: row.mode,
      status: row.status, catalogId: row.catalog_id, protocol: row.protocol, metadata,
    };
  });
}

export async function readSensorTestReadings(runId: string): Promise<StoredSensorReading[]> {
  const db = await getLocalDatabase();
  const rows = await db.getAllAsync<{
    reading_index: number; payload_json: string; assessment_state: string; assessment_title: string;
  }>('SELECT reading_index, payload_json, assessment_state, assessment_title FROM sensor_test_readings WHERE run_id = ? ORDER BY reading_index ASC', runId);
  const readings: StoredSensorReading[] = [];
  for (const row of rows) {
    try {
      readings.push({
        readingIndex: row.reading_index,
        sample: JSON.parse(row.payload_json) as StoredSensorReading['sample'],
        assessmentState: row.assessment_state,
        assessmentTitle: row.assessment_title,
      });
    } catch {
      // Ignore a single corrupt sample without hiding the rest of the run.
    }
  }
  return readings;
}

export async function getLocalDatabaseStats(): Promise<Record<string, number>> {
  const db = await getLocalDatabase();
  const tables = ['drive_cycles', 'obd_session_events', 'sensor_test_runs', 'sensor_test_readings'];
  const result: Record<string, number> = {};
  for (const table of tables) {
    const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table}`);
    result[table] = row?.count ?? 0;
  }
  return result;
}

/** Export structured SQLite records to the backup directory as a portable snapshot. */
export async function exportLocalDatabaseSnapshot(): Promise<{
  schemaVersion: number;
  exportedAt: string;
  metadata: Array<Record<string, unknown>>;
  driveCycles: Array<Record<string, unknown>>;
  obdSessionEvents: Array<Record<string, unknown>>;
  sensorTestRuns: Array<Record<string, unknown>>;
  sensorTestReadings: Array<Record<string, unknown>>;
}> {
  const db = await getLocalDatabase();
  const [metadata, driveCycles, obdSessionEvents, sensorTestRuns, sensorTestReadings] = await Promise.all([
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM app_metadata ORDER BY key'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM drive_cycles ORDER BY started_at'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM obd_session_events ORDER BY event_at'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM sensor_test_runs ORDER BY started_at'),
    db.getAllAsync<Record<string, unknown>>('SELECT * FROM sensor_test_readings ORDER BY run_id, reading_index'),
  ]);
  return { schemaVersion: SCHEMA_VERSION, exportedAt: new Date().toISOString(), metadata, driveCycles, obdSessionEvents, sensorTestRuns, sensorTestReadings };
}
