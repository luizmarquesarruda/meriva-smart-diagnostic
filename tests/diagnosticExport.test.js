'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadPureTs(relativePath) {
  const sourcePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const moduleObject = { exports: {} };
  new Function('exports', 'module', output)(moduleObject.exports, moduleObject);
  return moduleObject.exports;
}

const reportUtils = loadPureTs('src/obd/diagnosticReportUtils.ts');
const exportContract = loadPureTs('src/storage/diagnosticExportContract.ts');

const trace = [
  '[2026-10-31T09:00:00.000Z] CONNECT_FAILURE | {"error":"RFCOMM TIMEOUT"}',
  '[2026-10-31T09:00:05.000Z] ELM_SESSION_FAILURE | {"error":"ELM INITIALIZATION FAILED"}',
  '[2026-10-31T09:00:06.000Z] BLUETOOTH_ATTEMPT_RESULT | {"attempt":1,"result":"FAILURE","error":"ECU NÃO RESPONDEU AO 010C: TIMEOUT | RX=N/D"}',
].join('\n');

const failure = reportUtils.extractLastTraceFailure(trace);
assert.deepStrictEqual(failure, {
  timestamp: '2026-10-31T09:00:06.000Z',
  event: 'BLUETOOTH_ATTEMPT_RESULT',
  error: 'ECU NÃO RESPONDEU AO 010C: TIMEOUT | RX=N/D',
}, 'the report must identify the newest failure in the actual trace');

assert.strictEqual(reportUtils.extractLastTraceFailure('[2026-10-31T09:00:00.000Z] BLUETOOTH_READY_START'), null,
  'a trace without failure events must not invent an error');

assert.strictEqual(reportUtils.resolveAndroidModel('SM-A065M'), 'SM-A065M',
  'Android hardware model reported by the platform must be preserved');
assert.strictEqual(reportUtils.resolveAndroidModel('  '), undefined,
  'empty model metadata must be omitted instead of guessed');
assert.strictEqual(reportUtils.resolveAndroidModel(undefined), undefined,
  'missing hardware model metadata must remain unavailable');

const sensitive = [
  'PAIRED: OBDII | 01:23:45:67:89:BA',
  'TRACE: {"address":"BE:76:46:00:00:B4"}',
  'OTHER: AA-BB-CC-DD-EE-FF',
].join('\n');
const shared = reportUtils.redactBluetoothAddresses(sensitive);
assert(!shared.includes('01:23:45:67:89:BA'));
assert(!shared.includes('BE:76:46:00:00:B4'));
assert(!shared.includes('AA-BB-CC-DD-EE-FF'));
assert.strictEqual((shared.match(/XX:XX:XX:XX:XX:XX/g) || []).length, 3,
  'shareable output must redact colon- and hyphen-separated MACs');
const personalReport = [
  'VIN: 1HGCM82633A004352',
  'deviceName: Phone Name XYZ',
  'latitude: -23.501234',
  'longitude: -47.452345',
  'GPS: -23.501234, -47.452345',
  'TRACE: 01:23:45:67:89:BA',
].join('\\n');
const safeReport = reportUtils.redactSensitiveReportData(personalReport, ['Galaxy Duzentos']);
assert(!safeReport.includes('1HGCM82633A004352'), 'shareable report must redact labeled VIN values');
assert(!safeReport.includes('Galaxy Duzentos'), 'shareable report must redact paired device names');
assert(!safeReport.includes('-23.501234'), 'shareable report must redact labeled GPS coordinates');
assert(!safeReport.includes('-47.452345'), 'shareable report must redact longitude and coordinate pairs');
assert(!safeReport.includes('01:23:45:67:89:BA'), 'shareable report must redact MACs in raw traces');


const document = exportContract.buildDiagnosticExportDocument({
  exportedAt: '2026-10-31T10:00:00.000Z',
  stateSnapshotAt: '2026-10-31T09:59:59.000Z',
  appVersion: '1.0.1',
  platform: { os: 'android', androidRelease: '16', apiLevel: 36, manufacturer: 'samsung', model: 'SM-A065M' },
  vehicle: { make: 'Chevrolet', model: 'Meriva' },
  obd: { connected: false },
  lastReadings: [],
  dtcs: [],
  driveCycles: [],
  autonomy: null,
  maintenance: [],
});

assert.strictEqual(document.schemaVersion, 1);
assert.strictEqual(document.dataType, 'MERIVA_DIAGNOSTIC_EXPORT');
assert.strictEqual(document.app.version, '1.0.1');
assert.strictEqual(document.platform.model, 'SM-A065M');
assert.strictEqual(document.sourcePolicy.realObd, 'REAL_OBD');
assert.strictEqual(document.sourcePolicy.importedReference, 'CARSCANNER_SEED');
assert.strictEqual(document.sourcePolicy.simulation, 'SIMULACAO');
assert.ok(Object.prototype.hasOwnProperty.call(document, 'maintenance'));

console.log('diagnosticExport.test.js: report trace, privacy, Android model and JSON contract OK');
