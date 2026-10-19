'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const memory = new Map();
const mockFs = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync() {},
  async getInfoAsync(file) { return { exists: memory.has(file), isDirectory: false }; },
  async readAsStringAsync(file) {
    if (!memory.has(file)) throw new Error('ENOENT');
    return memory.get(file);
  },
  async writeAsStringAsync(file, content) { memory.set(file, content); },
};
const sourcePath = path.join(ROOT, 'src/database/dtcManager.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-file-system') return mockFs;
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(output, sourcePath); } finally { Module._load = originalLoad; }
const { recordDtc, readDtcs } = mod.exports;

(async () => {
  const basePath = '/MERIVA_SMART';
  const oldLine = '/MERIVA_SMART/DTC/dtc_records.txt';
  memory.set(oldLine, 'P0420|Eficiência do catalisador|HISTORICAL|2026-10-01T00:00:00.000Z|2026-10-01T00:00:00.000Z|1|REAL_OBD|true|false\n');
  let records = await readDtcs(basePath);
  assert.strictEqual(records.length, 1);
  assert.strictEqual(records[0].code, 'P0420');
  assert.strictEqual(records[0].freezeFrame, undefined, 'legacy records remain readable without the extended JSON field');

  const freezeFrame = {
    frame: 0,
    dtc: 'P0135',
    rpm: 920,
    coolantC: 86,
    speedKmh: 0,
    engineLoadPercent: 28,
    stftPercent: -3.5,
    ltftPercent: 4.2,
    mapKpa: 38,
    intakeAirTempC: 31,
    throttlePercent: 8,
    capturedAt: '2026-10-19T11:00:00.000Z',
    parameters: [{ pid: '010C', label: 'Rotação do motor', value: 920, unit: 'rpm', available: true }],
  };
  await recordDtc(basePath, {
    code: 'P0135', status: 'CURRENT', firstSeen: freezeFrame.capturedAt,
    lastSeen: freezeFrame.capturedAt, occurrences: 1, source: 'REAL_OBD',
    historical: false, confirmed: true, freezeFrame,
  });
  records = await readDtcs(basePath);
  const stored = records.find((item) => item.code === 'P0135');
  assert.ok(stored);
  assert.deepStrictEqual(stored.freezeFrame, freezeFrame, 'full freeze-frame snapshot should survive TXT persistence round-trip');
  assert.ok(memory.get(oldLine).includes(JSON.stringify(freezeFrame)), 'extended snapshot is serialized in the existing TXT history');
  console.log('DTC manager freeze-frame persistence + legacy compatibility: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
