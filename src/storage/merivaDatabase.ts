import * as SQLite from 'expo-sqlite';
import type { SQLiteDatabase } from 'expo-sqlite';
import type { DriveCycle } from '../data/driveCycles';
import type { DtcRecord } from '../types/sourceTypes';
import type { LastPidReading, MerivaPersistedState, ObdConnectionState } from '../meriva/autosaveState';
import type { SensorTestMode, SensorTestSample } from '../diagnostics/sensorTestEngine';

/**
 * Camada operacional SQLite do Meriva Smart Diagnostic.
 *
 * O autosave JSON continua sendo a fonte de recuperação do estado mutável.
 * SQLite guarda séries temporais e entidades relacionais; os arquivos TXT
 * continuam sendo o formato exportado ao usuário.
 */
export const MERIVA_DATABASE_NAME = 'meriva-smart-diagnostic.db';
export const MERIVA_DATABASE_SCHEMA_VERSION = 2;
const MIN_PID_SAMPLE_INTERVAL_MS = 2_000;

let databasePromise: Promise<SQLiteDatabase> | null = null;
let activeSessionId: string | null = null;
let serializedWrites: Promise<void> = Promise.resolve();
const lastPidSampleAt = new Map<string, number>();
const lastPersistedDtcFingerprints = new Map<string, string>();
const lastPersistedTripFingerprints = new Map<string, string>();

function makeId(prefix: string): string {
  return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 10);
}

function asJson(value: unknown): string {
  try {
    return JSON.stringify(value ?? null);
  } catch {
    return 'null';
  }
}

function stableHash(value: string): string {
  // Identificador determinístico local; não é usado para autenticação/segurança.
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function serializeWrite<T>(operation: () => Promise<T>): Promise<T> {
  const result = serializedWrites.then(operation, operation);
  serializedWrites = result.then(() => undefined, () => undefined);
  return result;
}

const MIGRATION_1 = `
  CREATE TABLE IF NOT EXISTS obd_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    adapter_name TEXT,
    protocol TEXT,
    ecu_address TEXT,
    ecu_identification TEXT,
    status TEXT NOT NULL DEFAULT 'OPEN'
      CHECK (status IN ('OPEN', 'CLOSED', 'RECOVERED')),
    close_reason TEXT,
    recovered INTEGER NOT NULL DEFAULT 0,
    metadata_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS pid_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    pid TEXT NOT NULL,
    name TEXT NOT NULL,
    value REAL NOT NULL,
    unit TEXT NOT NULL,
    status TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source = 'REAL_OBD'),
    timestamp TEXT NOT NULL,
    FOREIGN KEY (session_id) REFERENCES obd_sessions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS dtc_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    session_id TEXT,
    code TEXT NOT NULL,
    status TEXT NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    source TEXT NOT NULL CHECK (source = 'REAL_OBD'),
    details_json TEXT NOT NULL DEFAULT '{}',
    UNIQUE (code, status, last_seen),
    FOREIGN KEY (session_id) REFERENCES obd_sessions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS learned_pids (
    pid TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL,
    unit TEXT NOT NULL,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    successful_reads INTEGER NOT NULL DEFAULT 1,
    last_value REAL,
    evidence_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE INDEX IF NOT EXISTS idx_pid_readings_session_timestamp
    ON pid_readings(session_id, timestamp);
  CREATE INDEX IF NOT EXISTS idx_pid_readings_pid_timestamp
    ON pid_readings(pid, timestamp);
  CREATE INDEX IF NOT EXISTS idx_dtc_events_code_last_seen
    ON dtc_events(code, last_seen);
`;

const MIGRATION_2 = `
  CREATE TABLE IF NOT EXISTS sensor_tests (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    mode TEXT NOT NULL CHECK (mode IN ('ENGINE_OFF', 'ENGINE_ON')),
    status TEXT NOT NULL CHECK (status IN ('COMPLETED', 'PARTIAL', 'CANCELLED')),
    protocol TEXT,
    supported_pid_count INTEGER NOT NULL DEFAULT 0,
    attempted_read_count INTEGER NOT NULL DEFAULT 0,
    report_path TEXT,
    summary_json TEXT NOT NULL DEFAULT '{}',
    source TEXT NOT NULL DEFAULT 'REAL_OBD' CHECK (source = 'REAL_OBD'),
    FOREIGN KEY (session_id) REFERENCES obd_sessions(id) ON DELETE SET NULL
  );

  CREATE TABLE IF NOT EXISTS sensor_test_readings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    test_id TEXT NOT NULL,
    pid TEXT NOT NULL,
    name TEXT NOT NULL,
    value REAL,
    unit TEXT NOT NULL,
    status TEXT NOT NULL,
    raw_response TEXT NOT NULL DEFAULT '',
    elapsed_ms INTEGER NOT NULL DEFAULT 0,
    timestamp TEXT NOT NULL,
    reading_number INTEGER NOT NULL DEFAULT 0,
    source TEXT NOT NULL DEFAULT 'REAL_OBD' CHECK (source = 'REAL_OBD'),
    FOREIGN KEY (test_id) REFERENCES sensor_tests(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS trip_records (
    id TEXT PRIMARY KEY NOT NULL,
    started_at TEXT NOT NULL,
    finished_at TEXT NOT NULL,
    distance_km REAL NOT NULL DEFAULT 0,
    fuel_used_l REAL NOT NULL DEFAULT 0,
    average_consumption_km_l REAL NOT NULL DEFAULT 0,
    average_speed_kmh REAL NOT NULL DEFAULT 0,
    maximum_speed_kmh REAL,
    source TEXT NOT NULL CHECK (source = 'REAL_OBD'),
    details_json TEXT NOT NULL DEFAULT '{}'
  );

  CREATE TABLE IF NOT EXISTS diagnostic_findings (
    id TEXT PRIMARY KEY NOT NULL,
    session_id TEXT,
    code TEXT NOT NULL,
    severity TEXT NOT NULL,
    summary TEXT NOT NULL,
    evidence_json TEXT NOT NULL DEFAULT '{}',
    created_at TEXT NOT NULL,
    source TEXT NOT NULL DEFAULT 'REAL_OBD' CHECK (source = 'REAL_OBD'),
    FOREIGN KEY (session_id) REFERENCES obd_sessions(id) ON DELETE SET NULL
  );

  CREATE INDEX IF NOT EXISTS idx_sensor_tests_started_at
    ON sensor_tests(started_at);
  CREATE INDEX IF NOT EXISTS idx_sensor_test_readings_test_pid
    ON sensor_test_readings(test_id, pid, timestamp);
  CREATE INDEX IF NOT EXISTS idx_trip_records_started_at
    ON trip_records(started_at);
  CREATE INDEX IF NOT EXISTS idx_diagnostic_findings_created_at
    ON diagnostic_findings(created_at);
`;

async function migrateDatabase(db: SQLiteDatabase): Promise<void> {
  await db.execAsync('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;');
  await db.execAsync(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL,
      description TEXT NOT NULL
    );
  `);

  const row = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
  let version = Number(row?.user_version ?? 0);
  if (version > MERIVA_DATABASE_SCHEMA_VERSION) {
    throw new Error('SQLITE_SCHEMA_NEWER_THAN_APP:' + version);
  }

  if (version < 1) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_1);
      await db.runAsync(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES (?, ?, ?)',
        1,
        new Date().toISOString(),
        'Sessões ECU, leituras reais, eventos DTC e descoberta de PIDs',
      );
      await db.execAsync('PRAGMA user_version = 1');
    });
    version = 1;
  }

  if (version < 2) {
    await db.withTransactionAsync(async () => {
      await db.execAsync(MIGRATION_2);
      await db.runAsync(
        'INSERT OR IGNORE INTO schema_migrations(version, applied_at, description) VALUES (?, ?, ?)',
        2,
        new Date().toISOString(),
        'Testes de sensores, amostras, viagens reais e achados diagnósticos',
      );
      await db.execAsync('PRAGMA user_version = 2');
    });
  }
}

async function openDatabase(): Promise<SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      // Expo SQLite da linha 14 (SDK 51) usa o diretório privado padrão.
      // A opção de diretório customizado foi introduzida em versão posterior.
      const db = await SQLite.openDatabaseAsync(MERIVA_DATABASE_NAME);
      await migrateDatabase(db);

      // Uma sessão deixada como OPEN só pode pertencer a um processo anterior.
      // Nunca apresentar uma sessão persistida como ECU ainda conectada.
      const recoveredAt = new Date().toISOString();
      await db.runAsync(
        `UPDATE obd_sessions
         SET status = 'RECOVERED', ended_at = COALESCE(ended_at, ?),
             close_reason = COALESCE(close_reason, 'PROCESS_RESTART'), recovered = 1
         WHERE status = 'OPEN'`,
        recoveredAt,
      );
      return db;
    })().catch((error) => {
      databasePromise = null;
      throw error;
    });
  }
  return databasePromise;
}

export async function initializeMerivaDatabase(): Promise<void> {
  await openDatabase();
}

export function getActiveSqliteSessionId(): string | null {
  return activeSessionId;
}

export async function openSqliteObdSession(connection: ObdConnectionState): Promise<string | null> {
  if (!connection.connected) return null;
  return serializeWrite(async () => {
    const db = await openDatabase();
    const startedAt = new Date().toISOString();

    if (activeSessionId) {
      await db.runAsync(
        `UPDATE obd_sessions SET status = 'CLOSED', ended_at = ?, close_reason = 'REPLACED_BY_NEW_SESSION'
         WHERE id = ? AND status = 'OPEN'`,
        startedAt,
        activeSessionId,
      );
      // Never keep a stale in-memory session ID if creation of its replacement fails.
      activeSessionId = null;
      lastPidSampleAt.clear();
    }

    const id = makeId('ecu');
    await db.runAsync(
      `INSERT INTO obd_sessions
        (id, started_at, adapter_name, protocol, ecu_address, ecu_identification, status, metadata_json)
       VALUES (?, ?, ?, ?, ?, ?, 'OPEN', ?)`,
      id,
      startedAt,
      connection.adapterName ?? null,
      connection.protocol ?? connection.lastKnownProtocol ?? null,
      connection.ecuAddress ?? null,
      connection.ecuIdentification ?? null,
      asJson({
        ecuName: connection.ecuName ?? null,
        ecuValidatedAt: connection.ecuValidatedAt ?? null,
        ecuValidationSource: connection.ecuValidationSource ?? null,
      }),
    );
    activeSessionId = id;
    lastPidSampleAt.clear();
    return id;
  });
}

export async function closeSqliteObdSession(
  reason: string,
  connection?: ObdConnectionState,
): Promise<void> {
  await serializeWrite(async () => {
    const db = await openDatabase();
    const id = activeSessionId;
    if (!id) return;

    try {
      const endedAt = new Date().toISOString();
      let metadataJson: string | null = null;
      if (connection) {
        const row = await db.getFirstAsync<{ metadata_json: string }>(
          'SELECT metadata_json FROM obd_sessions WHERE id = ?',
          id,
        );
        let existingMetadata: Record<string, unknown> = {};
        try {
          const parsed = JSON.parse(row?.metadata_json ?? '{}') as unknown;
          if (typeof parsed === 'object' && parsed !== null && !Array.isArray(parsed)) {
            existingMetadata = parsed as Record<string, unknown>;
          }
        } catch {
          // Repair malformed metadata with the minimum close context without changing session facts.
        }
        metadataJson = asJson({
          ...existingMetadata,
          connected: connection.connected,
          lastKnownProtocol: connection.lastKnownProtocol ?? existingMetadata.lastKnownProtocol ?? null,
        });
      }

      await db.runAsync(
        `UPDATE obd_sessions
         SET status = 'CLOSED', ended_at = ?, close_reason = ?,
             metadata_json = COALESCE(?, metadata_json)
         WHERE id = ? AND status = 'OPEN'`,
        endedAt,
        reason,
        metadataJson,
        id,
      );
    } finally {
      // A close request is a terminal boundary for the live session even if
      // SQLite reports an I/O error. Process restart recovery remains the fallback.
      activeSessionId = null;
      lastPidSampleAt.clear();
    }
  });
}

/**
 * Persiste amostras reais válidas a cada 2 s por PID, sem transformar o ciclo
 * de telemetria de 500 ms numa escrita SQLite a cada resposta.
 */
export async function recordRealPidReading(reading: LastPidReading): Promise<void> {
  if (
    reading.source !== 'REAL' ||
    reading.status !== 'RESPONDEU' ||
    reading.value === null ||
    !Number.isFinite(reading.value)
  ) return;

  const sessionId = activeSessionId;
  if (!sessionId) return;

  const pid = reading.pid.replace(/\s/g, '').toUpperCase();
  if (!pid) return;
  const parsedTime = Date.parse(reading.timestamp);
  const timestampMs = Number.isFinite(parsedTime) ? parsedTime : Date.now();
  const previous = lastPidSampleAt.get(pid);
  if (previous !== undefined && (timestampMs < previous || timestampMs - previous < MIN_PID_SAMPLE_INTERVAL_MS)) return;
  lastPidSampleAt.set(pid, timestampMs);

  await serializeWrite(async () => {
    // A sessão pode ter sido encerrada enquanto a escrita aguardava a fila.
    if (activeSessionId !== sessionId) return;
    const db = await openDatabase();
    await db.runAsync(
      `INSERT INTO pid_readings
        (session_id, pid, name, value, unit, status, source, timestamp)
       VALUES (?, ?, ?, ?, ?, 'RESPONDEU', 'REAL_OBD', ?)`,
      sessionId,
      pid,
      reading.name,
      reading.value,
      reading.unit,
      reading.timestamp,
    );
    await db.runAsync(
      `INSERT INTO learned_pids
        (pid, name, unit, first_seen, last_seen, successful_reads, last_value, evidence_json)
       VALUES (?, ?, ?, ?, ?, 1, ?, ?)
       ON CONFLICT(pid) DO UPDATE SET
        name = excluded.name,
        unit = excluded.unit,
        last_seen = excluded.last_seen,
        successful_reads = learned_pids.successful_reads + 1,
        last_value = excluded.last_value,
        evidence_json = excluded.evidence_json`,
      pid,
      reading.name,
      reading.unit,
      reading.timestamp,
      reading.timestamp,
      reading.value,
      asJson({ source: 'REAL_OBD', lastStatus: reading.status }),
    );
  });
}

async function persistDtcSnapshot(
  dtcs: DtcRecord[],
  db: SQLiteDatabase,
  skipUnchanged = false,
): Promise<void> {
  const realDtcs = dtcs.filter((dtc) => dtc.source === 'REAL_OBD' && /^[PCBU][0-9A-F]{4}$/i.test(dtc.code));
  for (const dtc of realDtcs) {
    const eventKey = dtc.code.toUpperCase() + '|' + dtc.status + '|' + dtc.lastSeen;
    const details = asJson({
      description: dtc.description ?? null,
      historical: dtc.historical,
      confirmed: dtc.confirmed ?? null,
    });
    const fingerprint = asJson({
      code: dtc.code.toUpperCase(),
      status: dtc.status,
      occurrences: dtc.occurrences,
      firstSeen: dtc.firstSeen,
      lastSeen: dtc.lastSeen,
      details,
      sessionId: activeSessionId,
    });
    if (skipUnchanged && lastPersistedDtcFingerprints.get(eventKey) === fingerprint) continue;

    await db.runAsync(
      `INSERT INTO dtc_events
        (session_id, code, status, occurrences, first_seen, last_seen, source, details_json)
       VALUES (?, ?, ?, ?, ?, ?, 'REAL_OBD', ?)
       ON CONFLICT(code, status, last_seen) DO UPDATE SET
         session_id = COALESCE(dtc_events.session_id, excluded.session_id),
         occurrences = excluded.occurrences,
         details_json = excluded.details_json`,
      activeSessionId,
      dtc.code.toUpperCase(),
      dtc.status,
      Math.max(1, Number.isFinite(dtc.occurrences) ? dtc.occurrences : 1),
      dtc.firstSeen,
      dtc.lastSeen,
      details,
    );
    lastPersistedDtcFingerprints.set(eventKey, fingerprint);
  }
}

async function persistRealTrips(
  cycles: DriveCycle[],
  db: SQLiteDatabase,
  skipUnchanged = false,
): Promise<void> {
  const trips = cycles.filter((cycle) => cycle.source === 'REAL_OBD');
  for (const trip of trips) {
    const fingerprint = asJson(trip);
    if (skipUnchanged && lastPersistedTripFingerprints.get(trip.id) === fingerprint) continue;
    await db.runAsync(
      `INSERT INTO trip_records
        (id, started_at, finished_at, distance_km, fuel_used_l, average_consumption_km_l,
         average_speed_kmh, maximum_speed_kmh, source, details_json)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'REAL_OBD', ?)
       ON CONFLICT(id) DO UPDATE SET
         finished_at = excluded.finished_at,
         distance_km = excluded.distance_km,
         fuel_used_l = excluded.fuel_used_l,
         average_consumption_km_l = excluded.average_consumption_km_l,
         average_speed_kmh = excluded.average_speed_kmh,
         maximum_speed_kmh = excluded.maximum_speed_kmh,
         details_json = excluded.details_json`,
      trip.id,
      trip.startedAt,
      trip.finishedAt,
      trip.distanceTotalKm,
      trip.fuelUsedL,
      trip.avgFuelConsumptionKml,
      trip.avgDrivingSpeedKmh,
      trip.maxSpeedKmh ?? null,
      fingerprint,
    );
    lastPersistedTripFingerprints.set(trip.id, fingerprint);
  }
}

/** Reimportação idempotente do snapshot JSON antigo; nunca importa seed/simulação. */
export async function migrateLegacyStateToSqlite(state: MerivaPersistedState): Promise<void> {
  try {
    await serializeWrite(async () => {
      const db = await openDatabase();
      await db.withTransactionAsync(async () => {
        await persistDtcSnapshot(state.dtcs, db);
        await persistRealTrips(state.driveCycles, db);
      });
    });
  } catch (cause) {
    // Uma transação revertida invalida os fingerprints provisórios.
    lastPersistedDtcFingerprints.clear();
    lastPersistedTripFingerprints.clear();
    throw cause;
  }
}

export async function persistOperationalStateToSqlite(
  dtcs: DtcRecord[],
  cycles: DriveCycle[],
): Promise<void> {
  try {
    await serializeWrite(async () => {
      const db = await openDatabase();
      await db.withTransactionAsync(async () => {
        await persistDtcSnapshot(dtcs, db, true);
        await persistRealTrips(cycles, db, true);
      });
    });
  } catch (cause) {
    lastPersistedDtcFingerprints.clear();
    lastPersistedTripFingerprints.clear();
    throw cause;
  }
}

export interface SensorTestReportInput {
  id: string;
  sessionId?: string | null;
  startedAt: string;
  finishedAt: string;
  mode: SensorTestMode;
  status: 'COMPLETED' | 'PARTIAL' | 'CANCELLED';
  protocol?: string | null;
  supportedPidCount: number;
  reportPath?: string | null;
  summary: unknown;
  readings: SensorTestSample[];
}

export async function persistSensorTestReport(report: SensorTestReportInput): Promise<void> {
  await serializeWrite(async () => {
    const db = await openDatabase();
    await db.withTransactionAsync(async () => {
      await db.runAsync(
        `INSERT INTO sensor_tests
          (id, session_id, started_at, finished_at, mode, status, protocol,
           supported_pid_count, attempted_read_count, report_path, summary_json, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REAL_OBD')
         ON CONFLICT(id) DO UPDATE SET
           session_id = excluded.session_id, finished_at = excluded.finished_at,
           mode = excluded.mode, status = excluded.status, protocol = excluded.protocol,
           supported_pid_count = excluded.supported_pid_count,
           attempted_read_count = excluded.attempted_read_count,
           report_path = excluded.report_path, summary_json = excluded.summary_json`,
        report.id,
        report.sessionId ?? null,
        report.startedAt,
        report.finishedAt,
        report.mode,
        report.status,
        report.protocol ?? null,
        Math.max(0, report.supportedPidCount),
        report.readings.length,
        report.reportPath ?? null,
        asJson(report.summary),
      );
      await db.runAsync('DELETE FROM sensor_test_readings WHERE test_id = ?', report.id);
      for (const sample of report.readings) {
        await db.runAsync(
          `INSERT INTO sensor_test_readings
            (test_id, pid, name, value, unit, status, raw_response, elapsed_ms, timestamp, reading_number, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'REAL_OBD')`,
          report.id,
          sample.pid.replace(/\s/g, '').toUpperCase(),
          sample.name,
          sample.value !== null && Number.isFinite(sample.value) ? sample.value : null,
          sample.unit,
          sample.status,
          sample.rawResponse ?? '',
          Math.max(0, Math.round(sample.elapsedMs || 0)),
          sample.timestamp,
          Math.max(0, Math.round(sample.readingNumber || 0)),
        );
      }
    });
  });
}

export interface PersistableDiagnosticFinding {
  id: string;
  label: string;
  score: number;
  confidence: string;
  evidence: unknown[];
  nextTests: string[];
}

export async function persistDiagnosticFindings(
  findings: PersistableDiagnosticFinding[],
  sessionId: string | null = activeSessionId,
): Promise<void> {
  const valid = findings.filter((finding) =>
    Boolean(finding.id)
    && Boolean(finding.label)
    && Array.isArray(finding.evidence)
    && finding.evidence.length > 0
    && Number.isFinite(finding.score),
  );
  if (!valid.length) return;

  await serializeWrite(async () => {
    const db = await openDatabase();
    await db.withTransactionAsync(async () => {
      for (const finding of valid) {
        const evidenceJson = asJson({
          score: finding.score,
          confidence: finding.confidence,
          evidence: finding.evidence,
          nextTests: finding.nextTests,
          source: 'REAL_OBD',
        });
        const evidenceIdentity = finding.evidence.map((item) => {
          if (!item || typeof item !== 'object') return item;
          const evidence = item as { ruleId?: unknown; source?: unknown; pid?: unknown; dtc?: unknown };
          return {
            ruleId: evidence.ruleId ?? null,
            source: evidence.source ?? null,
            pid: evidence.pid ?? null,
            dtc: evidence.dtc ?? null,
          };
        });
        // Mesmo tipo de evidência na mesma sessão atualiza a linha existente.
        // Valores flutuantes ficam no JSON de evidência, não no ID da linha.
        const id = 'finding_' + stableHash(asJson({
          sessionId,
          rule: finding.id,
          evidenceIdentity,
        }));
        await db.runAsync(
          `INSERT INTO diagnostic_findings
            (id, session_id, code, severity, summary, evidence_json, created_at, source)
           VALUES (?, ?, ?, ?, ?, ?, ?, 'REAL_OBD')
           ON CONFLICT(id) DO UPDATE SET
             severity = excluded.severity,
             summary = excluded.summary,
             evidence_json = excluded.evidence_json`,
          id,
          sessionId,
          finding.id,
          finding.confidence,
          finding.label,
          evidenceJson,
          new Date().toISOString(),
        );
      }
    });
  });
}

export interface SqliteStorageOverview {
  schemaVersion: number;
  databaseSizeBytes: number;
  openSessions: number;
  recordedPidSamples: number;
  recordedDtcEvents: number;
  recordedSensorTests: number;
  recordedRealTrips: number;
  recordedDiagnosticFindings: number;
  learnedPids: number;
}

export async function getSqliteStorageOverview(): Promise<SqliteStorageOverview> {
  // Também serializa leituras de estatística para que não cruzem transações
  // iniciadas por withTransactionAsync no mesmo handle SQLite.
  return serializeWrite(async () => {
    const db = await openDatabase();
    const version = await db.getFirstAsync<{ user_version: number }>('PRAGMA user_version');
    const pageCount = await db.getFirstAsync<{ page_count: number }>('PRAGMA page_count');
    const pageSize = await db.getFirstAsync<{ page_size: number }>('PRAGMA page_size');
    const count = async (table: string, where = '') => {
      // Nomes são constantes internas; não há interpolação de entrada do usuário.
      const row = await db.getFirstAsync<{ count: number }>(`SELECT COUNT(*) AS count FROM ${table} ${where}`);
      return Number(row?.count ?? 0);
    };
    return {
      schemaVersion: Number(version?.user_version ?? 0),
      databaseSizeBytes: Number(pageCount?.page_count ?? 0) * Number(pageSize?.page_size ?? 0),
      openSessions: await count('obd_sessions', "WHERE status = 'OPEN'"),
      recordedPidSamples: await count('pid_readings'),
      recordedDtcEvents: await count('dtc_events'),
      recordedSensorTests: await count('sensor_tests'),
      recordedRealTrips: await count('trip_records'),
      recordedDiagnosticFindings: await count('diagnostic_findings'),
      learnedPids: await count('learned_pids'),
    };
  });
}
