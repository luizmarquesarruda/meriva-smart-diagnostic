import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { createServer } from 'node:net';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = dirname(fileURLToPath(import.meta.url));
let child;
let port;
let dataDir;
let baseUrl;

async function findFreePort() {
  const server = createServer();
  await new Promise((resolve, reject) => server.listen(0, '127.0.0.1', resolve).once('error', reject));
  const address = server.address();
  const result = typeof address === 'object' && address ? address.port : 0;
  await new Promise(resolve => server.close(resolve));
  return result;
}
async function waitForHealth(url) {
  for (let i = 0; i < 80; i += 1) {
    try {
      const response = await fetch(url + '/api/health');
      if (response.ok) return response.json();
    } catch { /* O processo pode ainda estar inicializando o SQLite. */ }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error('Serviço local não iniciou a tempo.');
}

test('API local importa lotes reais idempotentemente e rejeita origem simulada', async (t) => {
  port = await findFreePort();
  dataDir = mkdtempSync(join(tmpdir(), 'meriva-dashboard-test-'));
  baseUrl = 'http://127.0.0.1:' + port;
  child = spawn(process.execPath, [join(ROOT, 'server.mjs')], {
    env: {
      ...process.env,
      MERIVA_DASHBOARD_PORT: String(port),
      MERIVA_DASHBOARD_DATA_DIR: dataDir,
    },
    stdio: 'ignore',
  });
  t.after(async () => {
    if (child && child.exitCode === null) {
      const exited = new Promise(resolve => child.once('exit', resolve));
      child.kill('SIGTERM');
      await Promise.race([exited, new Promise(resolve => setTimeout(resolve, 3000))]);
    }
    if (dataDir) rmSync(dataDir, { recursive: true, force: true });
  });

  const health = await waitForHealth(baseUrl);
  assert.equal(health.ok, true);
  assert.equal(health.schemaVersion, 1);
  assert.equal(typeof health.instanceId, 'string');

  const batch = {
    schemaVersion: 1,
    batchId: 'test-batch-1',
    exportedAt: new Date().toISOString(),
    sessions: [{ id: 'ecu-test-1', started_at: '2026-10-16T10:00:00.000Z', ended_at: null, adapter_name: 'OBDII', protocol: 'ISO 14230-4 (KWP FAST)', status: 'OPEN', metadata_json: {} }],
    pidReadings: [{ id: 'pid-1', session_id: 'ecu-test-1', pid: '010C', name: 'Engine RPM', value: 850, unit: 'rpm', status: 'RESPONDEU', source: 'REAL_OBD', timestamp: new Date().toISOString() }],
    dtcEvents: [{ id: 'dtc-1', session_id: 'ecu-test-1', code: 'P0135', status: 'CURRENT', occurrences: 1, first_seen: '2026-10-16T10:00:00.000Z', last_seen: new Date().toISOString(), source: 'REAL_OBD', details_json: { description: 'Test DTC' } }],
    learnedPids: [{ pid: '010C', name: 'Engine RPM', unit: 'rpm', first_seen: '2026-10-16T10:00:00.000Z', last_seen: new Date().toISOString(), successful_reads: 1, last_value: 850, evidence_json: { source: 'REAL_OBD' } }],
    sensorTests: [{ id: 'sensor-test-1', started_at: '2026-10-16T10:00:00.000Z', finished_at: '2026-10-16T10:01:00.000Z', mode: 'ENGINE_ON', status: 'COMPLETED', supported_pid_count: 1, attempted_read_count: 1, summary_json: {}, source: 'REAL_OBD' }],
    tripRecords: [{ id: 'trip-1', started_at: '2026-10-16T10:00:00.000Z', finished_at: '2026-10-16T10:05:00.000Z', distance_km: 1, fuel_used_l: 0.1, average_consumption_km_l: 10, average_speed_kmh: 12, maximum_speed_kmh: 20, source: 'REAL_OBD', details_json: {} }],
    diagnosticFindings: [{ id: 'finding-1', code: 'RULE-1', severity: 'INFO', summary: 'Test finding', evidence_json: {}, created_at: new Date().toISOString(), source: 'REAL_OBD' }],
  };

  const first = await fetch(baseUrl + '/api/sync/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(first.status, 200);
  const firstAck = await first.json();
  assert.equal(firstAck.duplicate, false);
  assert.equal(firstAck.instanceId, health.instanceId);

  const second = await fetch(baseUrl + '/api/sync/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(batch) });
  assert.equal(second.status, 200);
  assert.equal((await second.json()).duplicate, true);

  const summary = await (await fetch(baseUrl + '/api/summary')).json();
  assert.equal(summary.sessions, 1);
  assert.equal(summary.readings, 1);
  assert.equal(summary.dtcs, 1);
  assert.equal(summary.learnedPids, 1);
  assert.equal(summary.trips, 1);

  const untrusted = {
    schemaVersion: 1,
    batchId: 'test-batch-simulated',
    exportedAt: new Date().toISOString(),
    pidReadings: [{ id: 'pid-fake', pid: '010C', name: 'Fake RPM', value: 900, unit: 'rpm', status: 'RESPONDEU', source: 'CARSCANNER', timestamp: new Date().toISOString() }],
  };
  const third = await fetch(baseUrl + '/api/sync/batch', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(untrusted) });
  assert.equal(third.status, 200);
  const after = await (await fetch(baseUrl + '/api/summary')).json();
  assert.equal(after.readings, 1);
});
