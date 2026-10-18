'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sqlitePolicy = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/knowledge/sqlite_policy.json'), 'utf8'));
const compiled = new Map();
const sqlCalls = [];
const execCalls = [];
let openCount = 0;
let schemaVersion = 0;
let rowId = 0;

const fakeDb = {
  async execAsync(sql) { execCalls.push(sql); },
  async getFirstAsync(sql) {
    sqlCalls.push({ sql, params: [] });
    if (/FROM schema_migrations/i.test(sql) && /version/i.test(sql)) {
      return schemaVersion ? { version: schemaVersion } : null;
    }
    if (/SELECT COUNT\(\*\) AS count FROM ([a-z_]+)/i.test(sql)) {
      const table = sql.match(/FROM ([a-z_]+)/i)[1];
      return { count: sqlCalls.filter(call => call.sql.includes('INSERT') && call.sql.includes(table)).length };
    }
    return null;
  },
  async getAllAsync(sql, ...params) {
    sqlCalls.push({ sql, params });
    if (/FROM pid_samples WHERE pid = \?/i.test(sql)) {
      return [{
        id: 1, pid: '010C', name: 'Engine RPM', value: 812, unit: 'rpm',
        status: 'RESPONDEU', source: 'REAL_OBD', observed_at_utc: '2026-10-17T12:00:00.000Z',
        observed_at_local: '17/10/2026, 09:00:00', session_id: null,
        raw_response: '41 0C 0C B0', created_at_utc: '2026-10-17T12:00:01.000Z',
      }];
    }
    return [];
  },
  async runAsync(sql, ...params) {
    sqlCalls.push({ sql, params });
    if (/INSERT OR IGNORE INTO schema_migrations/i.test(sql)) schemaVersion = Number(params[0]);
    return { lastInsertRowId: ++rowId, changes: 1 };
  },
  async withTransactionAsync(task) { await task(); },
  async withExclusiveTransactionAsync(task) { await task(this); },
};
const fakeSqlite = {
  async openDatabaseAsync(name) {
    openCount += 1;
    assert.strictEqual(name, 'meriva_diagnostics.db');
    return fakeDb;
  },
};

function loadTs(tsPath) {
  tsPath = path.normalize(tsPath);
  if (compiled.has(tsPath)) return compiled.get(tsPath).exports;
  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiled.set(tsPath, mod);
  mod._compile(output, tsPath);
  return mod.exports;
}

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-sqlite') return fakeSqlite;
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};

const dbModule = loadTs(path.join(ROOT, 'src/database/diagnosticDatabase.ts'));

async function main() {
  const firstOpen = dbModule.initializeDiagnosticDatabase();
  const secondOpen = dbModule.initializeDiagnosticDatabase();
  assert.strictEqual(firstOpen, secondOpen, 'concurrent initialization must share one promise');
  const dbA = await firstOpen;
  const dbB = await secondOpen;
  assert.strictEqual(dbA, dbB);
  assert.strictEqual(openCount, 1, 'SQLite handle should open only once');
  assert.ok(execCalls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS pid_samples')));
  assert.ok(execCalls.some(sql => sql.includes('CREATE INDEX IF NOT EXISTS idx_pid_samples_pid_time')));
  assert.ok(execCalls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS sensor_test_runs')));
  assert.ok(execCalls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS telemetry_samples')));
  assert.strictEqual(schemaVersion, 2, 'schema migration v2 must be recorded');
  assert.strictEqual(sqlitePolicy.schemaVersion, dbModule.DIAGNOSTIC_DATABASE_SCHEMA_VERSION, 'policy and implementation schema versions must agree');

  const rawQueryStored = await dbModule.recordTelemetryQuery({
    commandStatus: 'TIMEOUT',
    protocol: 'AUTO, ISO 14230-4 (KWP FAST)',
    elapsedMs: 2200,
    tx: '010C',
    rx: 'NO DATA',
    parsed: { pid: '01 0C', name: 'Engine RPM', value: null, unit: 'rpm', status: 'SEM_DADOS' },
  }, 'REAL', '2026-10-17T12:00:00.000Z', 'session-1');
  assert.strictEqual(rawQueryStored, true, 'failed raw queries are still kept for protocol audit');
  const rawInsert = sqlCalls.findLast(call => /INSERT INTO telemetry_samples/i.test(call.sql));
  assert.ok(rawInsert);
  assert.strictEqual(rawInsert.params[1], '010C');
  assert.strictEqual(rawInsert.params[3], null, 'unavailable values remain SQL NULL, not zero');
  assert.strictEqual(rawInsert.params[6], 'REAL_OBD');
  assert.strictEqual(rawInsert.params[7], 'TIMEOUT');
  assert.strictEqual(rawInsert.params[10], '010C');
  assert.strictEqual(rawInsert.params[11], 'NO DATA');

  const insertedId = await dbModule.recordPidSample({
    pid: '01 0c', name: 'Engine RPM', value: 812, unit: 'rpm', status: 'RESPONDEU',
    source: 'REAL_OBD', timestamp: '2026-10-17T12:00:00.000Z', rawResponse: '41 0C 0C B0',
  });
  assert.ok(insertedId > 0);
  const pidInsert = sqlCalls.findLast(call => /INSERT INTO pid_samples/i.test(call.sql));
  assert.ok(pidInsert, 'PID should be inserted into SQLite');
  assert.strictEqual(pidInsert.params[0], '010C', 'PID normalization should remove whitespace and uppercase');
  assert.strictEqual(pidInsert.params[5], 'REAL_OBD', 'source provenance must be retained');
  assert.ok(pidInsert.sql.includes('?'), 'values should use bound parameters');

  const history = await dbModule.readPidHistory('01 0C', 500, 'REAL_OBD');
  assert.strictEqual(history.length, 1);
  assert.strictEqual(history[0].pid, '010C');
  assert.strictEqual(history[0].value, 812);
  assert.strictEqual(history[0].source, 'REAL_OBD');
  const historyQuery = sqlCalls.findLast(call => /FROM pid_samples WHERE pid = \? AND source = \?/i.test(call.sql));
  assert.ok(historyQuery);
  assert.deepStrictEqual(historyQuery.params.slice(0, 2), ['010C', 'REAL_OBD']);

  const rejected = await dbModule.recordPidSample({
    pid: '010C', name: 'Engine RPM', value: Infinity, unit: 'rpm', status: 'RESPONDEU',
    source: 'REAL_OBD', timestamp: '2026-10-17T12:00:00.000Z',
  });
  assert.strictEqual(rejected, null, 'non-finite data must not enter the history');

  await dbModule.persistDtcHistory([{
    code: 'P0135', description: 'O2 heater circuit', status: 'CURRENT',
    firstSeen: '2026-10-17T10:00:00.000Z', lastSeen: '2026-10-17T12:00:00.000Z',
    occurrences: 2, source: 'REAL_OBD', historical: false, confirmed: true,
  }]);
  const dtcInsert = sqlCalls.findLast(call => /INSERT INTO dtc_records/i.test(call.sql));
  assert.ok(dtcInsert);
  assert.strictEqual(dtcInsert.params[3], 'REAL_OBD');

  const seedAccepted = await dbModule.upsertDriveCycle({
    id: 'seed', source: 'CARSCANNER_SEED', startedAt: '2026-10-17T09:00:00.000Z',
    finishedAt: '2026-10-17T09:20:00.000Z', distanceTotalKm: 10, distanceIceKm: 10,
    fuelUsedL: 1, totalTimeHms: '00:20:00', drivingTimeHms: '00:18:00',
    standingTimeHms: '00:02:00', avgDrivingSpeedKmh: 30, avgFuelConsumptionKml: 10,
    importedAt: '2026-10-17T09:20:00.000Z',
  });
  assert.strictEqual(seedAccepted, false, 'imported seed trips must not enter the real-trip table');

  const realAccepted = await dbModule.upsertDriveCycle({
    id: 'real-trip-1', source: 'REAL_OBD', startedAt: '2026-10-17T09:00:00.000Z',
    finishedAt: '2026-10-17T09:20:00.000Z', distanceTotalKm: 10, distanceIceKm: 10,
    fuelUsedL: 1, totalTimeHms: '00:20:00', drivingTimeHms: '00:18:00',
    standingTimeHms: '00:02:00', avgDrivingSpeedKmh: 30, avgFuelConsumptionKml: 10,
    fuelDataValid: true, telemetrySamples: [{ timestamp: '2026-10-17T09:10:00.000Z', speedKmh: 30, rpm: 1800, coolantTempC: 90 }],
    importedAt: '2026-10-17T09:20:00.000Z',
  });
  assert.strictEqual(realAccepted, true);
  assert.ok(sqlCalls.some(call => /INSERT INTO trip_telemetry/i.test(call.sql)));

  await dbModule.saveSensorTestRun({
    id: 'sensor-test-1', mode: 'ENGINE_ON',
    startedAt: '2026-10-17T12:00:00.000Z', finishedAt: '2026-10-17T12:01:00.000Z',
    completed: true, source: 'REAL_OBD',
    samples: [{
      pid: '010C', name: 'Engine RPM', value: 812, unit: 'rpm', status: 'RESPONDEU',
      rawResponse: '41 0C 0C B0', elapsedMs: 70, timestamp: '2026-10-17T12:00:20.000Z',
      readingNumber: 1,
    }],
    assessments: [{ pid: '010C', state: 'CONSISTENTE' }],
  });
  const sensorInsert = sqlCalls.findLast(call => /INSERT (?:OR IGNORE )?INTO sensor_test_results/i.test(call.sql));
  assert.ok(sensorInsert);
  assert.strictEqual(sensorInsert.params[1], '010C');
  assert.strictEqual(sensorInsert.params[10], 'CONSISTENTE');
  assert.strictEqual(sensorInsert.params[11], 'REAL_OBD');

  const health = await dbModule.getDiagnosticDatabaseHealth();
  assert.strictEqual(health.schemaVersion, 2);
  assert.ok(health.pidSampleCount >= 0);
  assert.ok(health.telemetrySampleCount >= 0);
  assert.strictEqual(health.maxPendingWrites, 500);

  // An existing telemetry-only schema v1 must be upgraded without deleting its tables.
  dbModule.resetDiagnosticDatabaseForTests();
  schemaVersion = 1;
  await dbModule.initializeDiagnosticDatabase();
  assert.strictEqual(schemaVersion, 2, 'an existing v1 database should migrate to v2');
  assert.ok(execCalls.some(sql => sql.includes('CREATE TABLE IF NOT EXISTS telemetry_samples')));

  // Concurrent bursts must not create an unbounded second queue for PID samples.
  const maxPendingWrites = sqlitePolicy.writeQueue.maxPendingWrites;
  const priorPidInsertCount = sqlCalls.filter(call => /INSERT INTO pid_samples/i.test(call.sql)).length;
  const burst = await Promise.all(Array.from({ length: maxPendingWrites + 25 }, (_, index) =>
    dbModule.recordPidSample({
      pid: index % 2 ? '010C' : '0105',
      name: 'Burst sample',
      value: index,
      unit: 'test',
      status: 'RESPONDEU',
      source: 'REAL_OBD',
      timestamp: '2026-10-17T12:02:00.000Z',
    })
  ));
  const accepted = burst.filter(value => value !== null).length;
  const rejectedOverflowSamples = burst.filter(value => value === null).length;
  assert.strictEqual(accepted, maxPendingWrites, 'only the configured maximum may be pending in a burst');
  assert.strictEqual(rejectedOverflowSamples, 25, 'overflow samples should be dropped from the secondary SQLite index');
  const pidInsertCountAfterBurst = sqlCalls.filter(call => /INSERT INTO pid_samples/i.test(call.sql)).length;
  assert.strictEqual(pidInsertCountAfterBurst - priorPidInsertCount, maxPendingWrites, 'only accepted samples should be written');
  const healthAfterBurst = await dbModule.getDiagnosticDatabaseHealth();
  assert.strictEqual(healthAfterBurst.pendingWrites, 0, 'all queued writes should be settled after Promise.all');
  assert.strictEqual(healthAfterBurst.droppedSamples, 25, 'dropped secondary samples should be observable in health metrics');
  assert.strictEqual(healthAfterBurst.maxPendingWrites, maxPendingWrites);
  console.log('SQLite database repository contract: OK (mocked Expo SQLite API; native device database not exercised)');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
