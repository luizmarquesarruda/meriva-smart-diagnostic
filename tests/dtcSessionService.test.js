'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src', 'obd', 'dtcSessionService.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

const storedScans = [
  { service: '03', kind: 'STORED', label: 'stored', codes: ['P0135'], available: true, response: '43 01 35', elapsedMs: 1 },
  { service: '07', kind: 'PENDING', label: 'pending', codes: [], available: true, response: '47 00 00', elapsedMs: 1 },
  { service: '0A', kind: 'PERMANENT', label: 'permanent', codes: [], available: false, response: '?', elapsedMs: 1 },
];
const emptyScans = [
  { service: '03', kind: 'STORED', label: 'stored', codes: [], available: true, response: 'NO DATA', elapsedMs: 1 },
  { service: '07', kind: 'PENDING', label: 'pending', codes: [], available: true, response: 'NO DATA', elapsedMs: 1 },
  { service: '0A', kind: 'PERMANENT', label: 'permanent', codes: [], available: false, response: '?', elapsedMs: 1 },
];
let scans = storedScans;
let frame = { frame: 0, dtc: 'P0135', rpm: null, coolantC: null, available: true, responses: { '020200': '42 02 00 01 35' } };
const db = new Map();
db.set('P0135', { code: 'P0135', status: 'CURRENT', firstSeen: '2026-10-01T00:00:00.000Z', lastSeen: '2026-10-15T00:00:00.000Z', occurrences: 3, source: 'REAL_OBD', historical: false, confirmed: true });
db.set('P0420', { code: 'P0420', status: 'CURRENT', firstSeen: '2026-10-01T00:00:00.000Z', lastSeen: '2026-10-15T00:00:00.000Z', occurrences: 5, source: 'REAL_OBD', historical: false, confirmed: true });
const persistedState = { dtcs: [...db.values()] };

const stubs = {
  './dtcScanner': { scanDtcServices: async () => scans, readFreezeFrame: async () => frame },
  './dtcDefinition': { getDtcDefinition: (code) => ({ description: 'descrição ' + code }) },
  '../database/dtcManager': {
    readDtcs: async () => [...db.values()],
    recordDtc: async (_base, item) => db.set(item.code, item),
    nextDtcOccurrences: (previous) => (Number(previous?.occurrences) || 0) + 1,
  },
  '../meriva/autosaveManager': {
    getAutoSaveState: () => persistedState,
    updateAutoSaveState: (callback) => callback(persistedState),
  },
  '../meriva/autosaveIntegration': { forceSaveOnObdEvent: async () => undefined },
};
const originalLoad = Module._load;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
Module._load = function(request, parent, isMain) {
  if (parent?.filename === sourcePath && stubs[request]) return stubs[request];
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(output, sourcePath); } finally { Module._load = originalLoad; }

(async () => {
  const service = mod.exports;
  const result = await service.refreshDtcSession('/tmp/meriva', { executeCommand: async () => ({ status: 'OK', response: '', elapsedMs: 1 }) }, 'session-A');
  assert.strictEqual(result.records.length, 1);
  assert.strictEqual(result.records[0].code, 'P0135');
  assert.strictEqual(result.records[0].validation, 'REVALIDATED_IN_SESSION');
  assert.strictEqual(result.records[0].occurrences, 4);
  assert.strictEqual(result.records[0].freezeFrame.dtc, 'P0135');
  assert.strictEqual(result.records[0].freezeFrame.rpm, null);
  assert.strictEqual(db.get('P0420').status, 'INACTIVE');
  assert.strictEqual(db.get('P0420').freezeFrame, undefined, 'a freeze frame must not be copied to a different DTC');

  scans = emptyScans;
  frame = { frame: null, dtc: null, rpm: null, coolantC: null, available: false, responses: {} };
  const second = await service.refreshDtcSession('/tmp/meriva', { executeCommand: async () => ({ status: 'OK', response: '', elapsedMs: 1 }) }, 'session-B');
  assert.strictEqual(second.freezeFrame.available, false);
  assert.strictEqual(second.freezeFrame.frame, null);
  assert.strictEqual(db.get('P0135').status, 'INACTIVE');
  assert.strictEqual(db.get('P0135').freezeFrame.dtc, 'P0135', 'historical frame stays attached only to its owner');
  assert.strictEqual(db.get('P0135').freezeFrame.rpm, null, 'empty new frame must not fabricate zero RPM');
  console.log('dtcSessionService: revalidation, occurrence count and frame ownership passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
