import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { dirname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { DatabaseSync } from 'node:sqlite';

const ROOT = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = process.env.MERIVA_DASHBOARD_DATA_DIR || join(ROOT, 'data');
const DB_PATH = join(DATA_DIR, 'meriva-dashboard.db');
const HOST = '127.0.0.1';
const PORT = Number(process.env.MERIVA_DASHBOARD_PORT || 8765);
const MAX_BODY = 8 * 1024 * 1024;
const SCHEMA_VERSION = 1;

await mkdir(DATA_DIR, { recursive: true });
const db = new DatabaseSync(DB_PATH);
db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS service_meta (key TEXT PRIMARY KEY NOT NULL, value TEXT NOT NULL);
  CREATE TABLE IF NOT EXISTS sync_batches (
    batch_id TEXT PRIMARY KEY NOT NULL,
    received_at TEXT NOT NULL,
    exported_at TEXT NOT NULL,
    schema_version INTEGER NOT NULL,
    record_count INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS obd_sessions (
    id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, ended_at TEXT,
    adapter_name TEXT, protocol TEXT, ecu_address TEXT, ecu_identification TEXT,
    status TEXT, close_reason TEXT, metadata_json TEXT
  );
  CREATE TABLE IF NOT EXISTS pid_readings (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT, pid TEXT NOT NULL, name TEXT NOT NULL,
    value REAL NOT NULL, unit TEXT NOT NULL, status TEXT NOT NULL,
    source TEXT NOT NULL, timestamp TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_dashboard_pid_time ON pid_readings(pid, timestamp);
  CREATE INDEX IF NOT EXISTS idx_dashboard_pid_session ON pid_readings(session_id);
  CREATE TABLE IF NOT EXISTS dtc_events (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT, code TEXT NOT NULL, status TEXT NOT NULL,
    occurrences INTEGER NOT NULL DEFAULT 1, first_seen TEXT NOT NULL, last_seen TEXT NOT NULL,
    source TEXT NOT NULL, details_json TEXT
  );
  CREATE TABLE IF NOT EXISTS learned_pids (
    pid TEXT PRIMARY KEY NOT NULL, name TEXT NOT NULL, unit TEXT NOT NULL,
    first_seen TEXT NOT NULL, last_seen TEXT NOT NULL, successful_reads INTEGER NOT NULL,
    last_value REAL, evidence_json TEXT
  );
  CREATE TABLE IF NOT EXISTS sensor_tests (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
    mode TEXT NOT NULL, status TEXT NOT NULL, protocol TEXT, supported_pid_count INTEGER NOT NULL,
    attempted_read_count INTEGER NOT NULL, summary_json TEXT, source TEXT NOT NULL
  );
  CREATE TABLE IF NOT EXISTS trip_records (
    id TEXT PRIMARY KEY NOT NULL, started_at TEXT NOT NULL, finished_at TEXT NOT NULL,
    distance_km REAL NOT NULL, fuel_used_l REAL NOT NULL, average_consumption_km_l REAL NOT NULL,
    average_speed_kmh REAL NOT NULL, maximum_speed_kmh REAL, source TEXT NOT NULL, details_json TEXT
  );
  CREATE TABLE IF NOT EXISTS diagnostic_findings (
    id TEXT PRIMARY KEY NOT NULL, session_id TEXT, code TEXT NOT NULL, severity TEXT NOT NULL,
    summary TEXT NOT NULL, evidence_json TEXT NOT NULL, created_at TEXT NOT NULL, source TEXT NOT NULL
  );
`);

let instanceId = db.prepare('SELECT value FROM service_meta WHERE key=?').get('instanceId')?.value;
if (!instanceId) { instanceId = randomUUID(); db.prepare('INSERT OR REPLACE INTO service_meta(key,value) VALUES(?,?)').run('instanceId', instanceId); }

const q = {
  summary: db.prepare(`SELECT
    (SELECT COUNT(*) FROM obd_sessions) AS sessions,
    (SELECT COUNT(*) FROM pid_readings WHERE source='REAL_OBD') AS readings,
    (SELECT COUNT(*) FROM dtc_events WHERE source='REAL_OBD') AS dtcs,
    (SELECT COUNT(*) FROM learned_pids) AS learnedPids,
    (SELECT COUNT(*) FROM trip_records WHERE source='REAL_OBD') AS trips,
    (SELECT MAX(received_at) FROM sync_batches) AS lastSync`),
  sessions: db.prepare('SELECT * FROM obd_sessions ORDER BY started_at DESC LIMIT 500'),
  dtcs: db.prepare('SELECT * FROM dtc_events WHERE source=? ORDER BY last_seen DESC LIMIT 1000'),
  learned: db.prepare('SELECT * FROM learned_pids ORDER BY last_seen DESC'),
  trips: db.prepare('SELECT * FROM trip_records WHERE source=? ORDER BY started_at DESC LIMIT 1000'),
  tests: db.prepare('SELECT * FROM sensor_tests WHERE source=? ORDER BY started_at DESC LIMIT 500'),
  findings: db.prepare('SELECT * FROM diagnostic_findings WHERE source=? ORDER BY created_at DESC LIMIT 1000'),
};

function json(res, status, body) {
  const bytes = Buffer.from(JSON.stringify(body));
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'content-length': bytes.length, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(bytes);
}
function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0; const chunks = [];
    req.on('data', chunk => { size += chunk.length; if (size > MAX_BODY) { reject(Object.assign(new Error('BODY_TOO_LARGE'), { status: 413 })); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => { try { resolve(JSON.parse(Buffer.concat(chunks).toString('utf8'))); } catch { reject(Object.assign(new Error('INVALID_JSON'), { status: 400 })); } });
    req.on('error', reject);
  });
}
function validText(v, max=500) { return typeof v === 'string' && v.length > 0 && v.length <= max; }
function validDate(v) { return validText(v, 50) && Number.isFinite(Date.parse(v)); }
function rows(v, max=10000) { return Array.isArray(v) && v.length <= max; }
function safeJson(v) { try { return JSON.stringify(v ?? {}); } catch { return '{}'; } }\nfunction jsonColumn(v) { if (typeof v === 'string') { try { JSON.parse(v); return v; } catch { return safeJson(v); } } return safeJson(v); }

function importBatch(batch) {
  if (!batch || batch.schemaVersion !== SCHEMA_VERSION || !validText(batch.batchId, 128) || !validDate(batch.exportedAt)) {
    throw Object.assign(new Error('INVALID_BATCH_ENVELOPE'), { status: 400 });
  }
  const collections = ['sessions','pidReadings','dtcEvents','learnedPids','sensorTests','tripRecords','diagnosticFindings'];
  if (collections.some(k => !rows(batch[k] ?? [], 20000))) throw Object.assign(new Error('INVALID_BATCH_COLLECTION'), { status: 400 });
  const existing = db.prepare('SELECT batch_id FROM sync_batches WHERE batch_id=?').get(batch.batchId);
  if (existing) return { duplicate: true, imported: 0, instanceId };

  let imported = 0;
  const tx = db.prepare('INSERT INTO sync_batches(batch_id,received_at,exported_at,schema_version,record_count) VALUES(?,?,?,?,?)');
  db.exec('BEGIN IMMEDIATE');
  try {
    for (const x of batch.sessions ?? []) {
      if (!validText(x.id,128) || !validDate(x.started_at)) continue;
      db.prepare(`INSERT INTO obd_sessions VALUES(?,?,?,?,?,?,?,?,?,?)
        ON CONFLICT(id) DO UPDATE SET ended_at=excluded.ended_at,status=excluded.status,
        close_reason=excluded.close_reason,metadata_json=excluded.metadata_json`)
        .run(x.id,x.started_at,x.ended_at??null,x.adapter_name??null,x.protocol??null,x.ecu_address??null,x.ecu_identification??null,x.status??null,x.close_reason??null,jsonColumn(x.metadata_json));
      imported++;
    }
    for (const x of batch.pidReadings ?? []) {
      if (!validText(x.id,128) || !validText(x.pid,24) || !validText(x.name,200) || !Number.isFinite(x.value) || !validDate(x.timestamp) || x.source !== 'REAL_OBD') continue;
      db.prepare(`INSERT OR IGNORE INTO pid_readings VALUES(?,?,?,?,?,?,?,?,?)`)
        .run(x.id,x.session_id??null,x.pid,x.name,x.value,String(x.unit??''),String(x.status??''),x.source,x.timestamp);
      imported++;
    }
    for (const x of batch.dtcEvents ?? []) {
      if (!validText(x.id,128) || !/^[PCBU][0-9A-F]{4}$/i.test(x.code??'') || x.source !== 'REAL_OBD' || !validDate(x.last_seen)) continue;
      db.prepare('INSERT INTO dtc_events VALUES(?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET status=excluded.status,occurrences=excluded.occurrences,last_seen=excluded.last_seen,details_json=excluded.details_json')
        .run(x.id,x.session_id??null,x.code,x.status??'UNKNOWN',Number.isFinite(x.occurrences)?x.occurrences:1,x.first_seen??x.last_seen,x.last_seen,x.source,jsonColumn(x.details_json));
      imported++;
    }
    for (const x of batch.learnedPids ?? []) {
      if (!validText(x.pid,24) || !validText(x.name,200) || !validDate(x.last_seen)) continue;
      db.prepare('INSERT INTO learned_pids VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(pid) DO UPDATE SET name=excluded.name,unit=excluded.unit,last_seen=excluded.last_seen,successful_reads=MAX(learned_pids.successful_reads,excluded.successful_reads),last_value=excluded.last_value,evidence_json=excluded.evidence_json')
        .run(x.pid,x.name,String(x.unit??''),x.first_seen??x.last_seen,x.last_seen,Math.max(0,Number(x.successful_reads)||0),Number.isFinite(x.last_value)?x.last_value:null,jsonColumn(x.evidence_json));
      imported++;
    }
    for (const x of batch.sensorTests ?? []) {
      if (!validText(x.id,128) || !validDate(x.started_at) || x.source !== 'REAL_OBD') continue;
      db.prepare('INSERT INTO sensor_tests VALUES(?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET finished_at=excluded.finished_at,status=excluded.status,summary_json=excluded.summary_json')
        .run(x.id,x.session_id??null,x.started_at,x.finished_at??x.started_at,x.mode??'UNKNOWN',x.status??'UNKNOWN',x.protocol??null,Number(x.supported_pid_count)||0,Number(x.attempted_read_count)||0,jsonColumn(x.summary_json),x.source);
      imported++;
    }
    for (const x of batch.tripRecords ?? []) {
      if (!validText(x.id,128) || !validDate(x.started_at) || x.source !== 'REAL_OBD') continue;
      db.prepare('INSERT INTO trip_records VALUES(?,?,?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET finished_at=excluded.finished_at,distance_km=excluded.distance_km,fuel_used_l=excluded.fuel_used_l,average_consumption_km_l=excluded.average_consumption_km_l,details_json=excluded.details_json')
        .run(x.id,x.started_at,x.finished_at??x.started_at,Number(x.distance_km)||0,Number(x.fuel_used_l)||0,Number(x.average_consumption_km_l)||0,Number(x.average_speed_kmh)||0,Number.isFinite(x.maximum_speed_kmh)?x.maximum_speed_kmh:null,x.source,safeJson(x.details_json));
      imported++;
    }
    for (const x of batch.diagnosticFindings ?? []) {
      if (!validText(x.id,128) || !validDate(x.created_at) || x.source !== 'REAL_OBD') continue;
      db.prepare('INSERT INTO diagnostic_findings VALUES(?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET severity=excluded.severity,summary=excluded.summary,evidence_json=excluded.evidence_json')
        .run(x.id,x.session_id??null,x.code??'UNKNOWN',x.severity??'INFO',x.summary??'',safeJson(x.evidence_json),x.created_at,x.source);
      imported++;
    }
    const total = collections.reduce((n,k)=>n+(batch[k]??[]).length,0);
    tx.run(batch.batchId,new Date().toISOString(),batch.exportedAt,SCHEMA_VERSION,total);
    db.exec('COMMIT');
    return { duplicate: false, imported, batchId: batch.batchId, instanceId };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

const server = http.createServer(async (req,res) => {
  try {
    const url = new URL(req.url ?? '/', 'http://127.0.0.1');
    if (req.method === 'GET' && url.pathname === '/api/health') return json(res,200,{ok:true,service:'meriva-desktop-dashboard',schemaVersion:SCHEMA_VERSION,instanceId,now:new Date().toISOString()});
    if (req.method === 'GET' && url.pathname === '/api/summary') return json(res,200,q.summary.get());
    if (req.method === 'GET' && url.pathname === '/api/sessions') return json(res,200,q.sessions.all());
    if (req.method === 'GET' && url.pathname === '/api/dtcs') return json(res,200,q.dtcs.all('REAL_OBD'));
    if (req.method === 'GET' && url.pathname === '/api/learned-pids') return json(res,200,q.learned.all());
    if (req.method === 'GET' && url.pathname === '/api/trips') return json(res,200,q.trips.all('REAL_OBD'));
    if (req.method === 'GET' && url.pathname === '/api/tests') return json(res,200,q.tests.all('REAL_OBD'));
    if (req.method === 'GET' && url.pathname === '/api/findings') return json(res,200,q.findings.all('REAL_OBD'));
    if (req.method === 'GET' && url.pathname === '/api/readings') {
      const pid = (url.searchParams.get('pid') ?? '').replace(/[^a-zA-Z0-9]/g,'').toUpperCase();
      const limit = Math.max(1,Math.min(5000,Number(url.searchParams.get('limit'))||500));
      if (!pid) return json(res,400,{error:'PID_REQUIRED'});
      const rows = db.prepare('SELECT id,session_id,pid,name,value,unit,status,source,timestamp FROM pid_readings WHERE pid=? AND source=? ORDER BY timestamp DESC LIMIT ?').all(pid,'REAL_OBD',limit);
      return json(res,200,rows.reverse());
    }
    if (req.method === 'POST' && url.pathname === '/api/sync/batch') {
      const origin = req.headers.origin;
      if (origin && !/^http:\/\/127\.0\.0\.1:8765$/.test(origin)) return json(res,403,{error:'ORIGIN_NOT_ALLOWED'});
      const batch = await readBody(req);
      return json(res,200,importBatch(batch));
    }
    if (req.method === 'GET' && (url.pathname === '/' || url.pathname === '/index.html')) {
      const html = await readFile(join(ROOT,'index.html'));
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','content-length':html.length,'cache-control':'no-store','x-content-type-options':'nosniff'}); return res.end(html);
    }
    return json(res,404,{error:'NOT_FOUND'});
  } catch(error) {
    return json(res,error.status||500,{error:error.message||'INTERNAL_ERROR'});
  }
});
server.listen(PORT,HOST,()=>console.log('Meriva dashboard: http://127.0.0.1:'+PORT+' | SQLite: '+DB_PATH+' | Bind: '+HOST));
function shutdown(){server.close(()=>{db.close();process.exit(0);});}
process.on('SIGINT',shutdown); process.on('SIGTERM',shutdown);
