'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const statements = [];
const samples = [];
const migrations = new Set();
let openCalls = 0;
const sqlitePolicy = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'knowledge', 'sqlite_policy.json'), 'utf8'));
assert.deepStrictEqual(sqlitePolicy.allowedTelemetryRowSources, ['REAL_OBD', 'SIMULACAO']);
assert.strictEqual(sqlitePolicy.migration.legacyImportEnabled, false);
assert.strictEqual(sqlitePolicy.migration.destructiveMigrationAllowed, false);
assert.ok(sqlitePolicy.nonTelemetrySourcesRemainOutsideSamples.includes('CARSCANNER_BASELINE'));

const fakeDatabase = {
  async execAsync(sql) { statements.push(String(sql)); },
  async withExclusiveTransactionAsync(task) { await task(this); },
  async runAsync(sql, ...params) {
    statements.push(String(sql));
    if (/INSERT\s+OR\s+IGNORE\s+INTO\s+schema_migrations/i.test(sql)) {
      migrations.add(Number(params[0]));
      return { lastInsertRowId: 1, changes: 1 };
    }
    if (/INSERT\s+INTO\s+telemetry_samples/i.test(sql)) {
      samples.push({
        id: samples.length + 1,
        timestamp: params[0],
        pid: params[1],
        name: params[2],
        value: params[3],
        unit: params[4],
        status: params[5],
        source: params[6],
        command_status: params[7],
        protocol: params[8],
        elapsed_ms: params[9],
        tx: params[10],
        rx: params[11],
        session_id: params[12],
      });
      return { lastInsertRowId: samples.length, changes: 1 };
    }
    return { lastInsertRowId: 0, changes: 0 };
  },
  async getFirstAsync(sql) {
    statements.push(String(sql));
    if (/MAX\(version\)/i.test(sql)) return { version: migrations.size ? Math.max(...migrations) : 0 };
    if (/sqlite_version\(\)/i.test(sql)) return { version: '3.45.3' };
    if (/COUNT\(\*\).*telemetry_samples/i.test(sql)) return { count: samples.length };
    return null;
  },
  async getAllAsync(sql, ...params) {
    statements.push(String(sql));
    if (/FROM\s+telemetry_samples/i.test(sql)) return samples.slice().reverse().slice(0, Number(params[0]) || 200);
    return [];
  },
};

const fakeSQLite = {
  async openDatabaseAsync(name) {
    openCalls += 1;
    assert.strictEqual(name, 'meriva_diagnostics.db');
    return fakeDatabase;
  },
};

const storageScreenSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'armazenamento.tsx'), 'utf8');
assert.ok(storageScreenSource.includes('getSqliteDiagnosticsHealth'), 'storage screen must expose SQLite availability');
assert.ok(storageScreenSource.includes('BASE LOCAL SQLITE'), 'storage screen must label the local database');
assert.ok(storageScreenSource.includes('sampleCount'), 'storage screen must show indexed sample count');
assert.ok(storageScreenSource.includes('VERIFICAR SQLITE'), 'storage screen must allow health refresh');

const sourcePath = path.join(__dirname, '..', 'src', 'database', 'sqliteTelemetryStore.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
}).outputText;

const originalLoad = Module._load;
Module._load = function(request, parentModule, isMain) {
  if (request === 'expo-sqlite') return fakeSQLite;
  return originalLoad.call(this, request, parentModule, isMain);
};
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

function query(pid, value, tx, rx, status = 'RESPONDEU') {
  return {
    tx,
    rx,
    elapsedMs: 123,
    commandStatus: status === 'RESPONDEU' ? 'OK' : 'NO_RESPONSE',
    protocol: 'ISO 14230-4 (KWP FAST)',
    parsed: {
      pid,
      name: pid === '010C' ? 'Engine RPM' : 'Coolant Temperature',
      value,
      unit: pid === '010C' ? 'rpm' : '°C',
      status,
    },
  };
}

async function main() {
  const realTx = '010C\r';
  const realRx = '410C 0C80\r\n>';
  const failedRx = 'NO DATA\r\n>';

  const results = await Promise.all([
    mod.exports.recordSqliteTelemetrySample(
      query('010C', 800, realTx, realRx), 'REAL', '2026-10-17T12:00:00.000Z', 'ecu-session-1',
    ),
    mod.exports.recordSqliteTelemetrySample(
      query('0105', Number.NaN, '0105\r', failedRx, 'NÃO RESPONDEU'),
      'REAL', '2026-10-17T12:00:01.000Z', 'ecu-session-1',
    ),
    mod.exports.recordSqliteTelemetrySample(
      query('010C', 900, '010C\r', '410C 0E10\r\n>'),
      'SIMULACAO', '2026-10-17T12:00:02.000Z', null,
    ),
  ]);
  assert.deepStrictEqual(results, [true, true, true]);
  await mod.exports.flushSqliteTelemetryWrites();

  assert.strictEqual(openCalls, 1, 'database must be opened once');
  assert.strictEqual(samples.length, 3, 'all samples should be appended');
  assert.strictEqual(samples[0].source, 'REAL_OBD');
  assert.strictEqual(samples[0].tx, realTx, 'raw TX must be preserved exactly');
  assert.strictEqual(samples[0].rx, realRx, 'raw RX must be preserved exactly');
  assert.strictEqual(samples[0].session_id, 'ecu-session-1');
  assert.strictEqual(samples[1].value, null, 'non-finite values must not enter SQLite as real measurements');
  assert.strictEqual(samples[1].rx, failedRx, 'failed raw responses must still be recorded');
  assert.strictEqual(samples[2].source, 'SIMULACAO', 'simulation data must keep its own source label');

  const sql = statements.join('\n');
  assert.match(sql, /PRAGMA journal_mode = WAL/i);
  assert.match(sql, /CREATE TABLE IF NOT EXISTS telemetry_samples/i);
  assert.match(sql, /tx TEXT NOT NULL/i);
  assert.match(sql, /rx TEXT NOT NULL/i);
  assert.match(sql, /CREATE INDEX IF NOT EXISTS idx_telemetry_pid_timestamp/i);
  assert.doesNotMatch(sql, /\bDROP\s+TABLE\b|\bDELETE\s+FROM\s+telemetry_samples\b/i);

  const recent = await mod.exports.getRecentSqliteTelemetrySamples(2);
  assert.strictEqual(recent.length, 2, 'recent reads must be bounded');
  const health = await mod.exports.getSqliteDiagnosticsHealth();
  assert.strictEqual(health.available, true);
  assert.strictEqual(health.schemaVersion, 1);
  assert.strictEqual(health.sqliteVersion, '3.45.3');
  assert.strictEqual(health.sampleCount, 3);

  console.log('sqliteTelemetryStore: migrations, source separation, raw TX/RX, and health checks passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
