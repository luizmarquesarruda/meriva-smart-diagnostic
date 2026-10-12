'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/meriva/autosaveIntegration.ts');
const integrationSource = fs.readFileSync(sourcePath, 'utf8');
const autoTripSource = fs.readFileSync(path.join(ROOT, 'src/trip/autoTripService.ts'), 'utf8');
const csvSource = fs.readFileSync(path.join(ROOT, 'src/database/csvLogger.ts'), 'utf8');
const autosaveManagerSource = fs.readFileSync(path.join(ROOT, 'src/meriva/autosaveManager.ts'), 'utf8');

assert.ok(integrationSource.includes('registerBackgroundPersistenceFlushHandler(() => flushObdPersistence())'),
  'app-state deve poder drenar a fila de persistência OBD antes de suspender');
assert.ok(autosaveManagerSource.includes('backgroundPersistenceFlushHandler()'),
  'transição para segundo plano deve descarregar a fila OBD antes dos CSVs');
assert.ok(integrationSource.indexOf('recordLivePidQuery(result, source)') < integrationSource.indexOf('await persistObdQuery('),
  'live telemetry must be published before awaited persistence');
assert.ok(integrationSource.includes('options.deferPersistence'), 'polling must support non-blocking persistence');
assert.ok(autoTripSource.includes('deferPersistence: true'), 'automatic polling must use the non-blocking path');
assert.ok(autoTripSource.includes('private canQueryPid(pid: string)'), 'non-critical PIDs must have a backoff gate');
assert.ok(autoTripSource.includes('lastFuelFallbackAttemptAtMs'), 'fuel fallback attempts must be rate-limited');
assert.ok(csvSource.includes('appendCsvRowBuffered'), 'high-frequency telemetry must be batched');
assert.ok(csvSource.includes('flushBufferedCsvRows'), 'batched logs must expose an explicit flush');

const liveEvents = [];
const savedReadings = [];
const logCalls = [];
const never = new Promise(() => {});
const fakeAutosave = {
  pushLastReading(reading) { savedReadings.push(reading); },
  updateAutoSaveState() {},
  scheduleCriticalSave: async () => true,
};
const mocks = {
  '../database/obdLogger': {
    logRawObdData: async (_base, _result, _pid, _source, options = {}) => {
      logCalls.push({ kind: 'raw', buffered: options.buffered === true });
      return options.buffered ? never : Promise.resolve();
    },
    logInterpretedData: async (_base, _result, _pid, _source, options = {}) => {
      logCalls.push({ kind: 'interpreted', buffered: options.buffered === true });
      return options.buffered ? never : Promise.resolve();
    },
  },
  '../database/pidBank': {
    readPidConfirmations: async () => [],
    recordPidConfirmation: async () => {},
  },
  '../database/learningProfile': { updateLearningProfileRealSample: async () => {} },
  './autosaveManager': fakeAutosave,
  './autosaveValidation': { shouldFeedLearning: () => false },
  '../obd/liveTelemetry': {
    recordLivePidQuery(result) { liveEvents.push(result.parsed.pid); },
    getVehicleConditionSnapshot: () => ({ condition: 'UNKNOWN' }),
  },
  '../database/csvLogger': { flushBufferedCsvRows: async () => {} },
};

const output = ts.transpileModule(integrationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const originalLoad = Module._load;
Module._load = function(request) {
  if (Object.prototype.hasOwnProperty.call(mocks, request)) return mocks[request];
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { registerObdQuery } = mod.exports;
const result = {
  tx: '010C',
  rx: '41 0C 0C 80',
  elapsedMs: 12,
  commandStatus: 'OK',
  protocol: 'ISO 14230-4 KWP FAST',
  parsed: {
    pid: '010C',
    name: 'Engine RPM',
    value: 800,
    unit: 'rpm',
    status: 'RESPONDEU',
    definition: { formulaId: 'RPM', bytes: 2, description: 'Engine speed' },
  },
};

(async () => {
  const startedAt = Date.now();
  await registerObdQuery('/doc/MERIVA_SMART', result, 'REAL', undefined, { deferPersistence: true });
  const elapsed = Date.now() - startedAt;
  assert.ok(elapsed < 100, 'the polling path must not wait for slow persistence');
  assert.deepStrictEqual(liveEvents, ['010C'], 'live telemetry is updated synchronously');
  assert.deepStrictEqual(savedReadings.map((reading) => reading.pid), ['010C'],
    'last reading is published before queued disk work');

  // Allow the queued persistence task to begin; the mocked buffered file writes
  // never resolve, proving the caller has already returned.
  await new Promise((resolve) => setTimeout(resolve, 0));
  assert.deepStrictEqual(logCalls, [
    { kind: 'raw', buffered: true },
    { kind: 'interpreted', buffered: true },
  ], 'both original and interpreted OBD evidence remain queued for buffered persistence');

  console.log('obdFastPath.test.js: live reading is immediate; persistence is queued');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
