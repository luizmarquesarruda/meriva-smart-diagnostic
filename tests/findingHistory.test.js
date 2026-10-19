'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const memory = new Map();
const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync() {},
  async getInfoAsync(file) { return { exists: memory.has(file), isDirectory: false }; },
  async readAsStringAsync(file) {
    if (!memory.has(file)) throw new Error('ENOENT');
    return memory.get(file);
  },
  async writeAsStringAsync(file, content) { memory.set(file, content); },
};
const sourcePath = path.join(ROOT, 'src/diagnostics/findingHistory.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFileSystem;
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(output, sourcePath); } finally { Module._load = originalLoad; }
const { recordDiagnosticFindings, readRecentDiagnosticFindings } = mod.exports;

function result(id = 'MISTURA_POBRE', score = 0.45) {
  return {
    engine: 'LOCAL_EVIDENCE_ENGINE',
    version: 2,
    generatedAt: new Date().toISOString(),
    hypotheses: [{
      id, label: id.replace(/_/g, ' '), score, confidence: 'LOW',
      evidence: [{ ruleId: 'FUEL_TRIM_LEAN', text: 'STFT + LTFT = 18%', source: 'PID', pid: '0106/0107', value: 18 }],
      nextTests: ['Confirmar motor aquecido'],
    }],
    blockedSimulationSamples: 0,
    blockedStaleObservations: 0,
    freshDiagnosticEvidenceGroups: 1,
    blockedNonLiveDtcs: 0,
    disclaimer: 'TESTE',
  };
}

(async () => {
  const basePath = '/MERIVA_SMART';
  const start = new Date(2026, 9, 18, 10, 0, 0);
  let entries = await recordDiagnosticFindings(basePath, result(), 'IDLE_WARM', start);
  assert.strictEqual(entries.length, 1);
  assert.strictEqual(entries[0].observations, 1);
  assert.strictEqual(entries[0].timeline.length, 1, 'each finding episode begins with one trend point');

  entries = await recordDiagnosticFindings(basePath, result('MISTURA_POBRE', 0.5), 'IDLE_WARM', new Date(start.getTime() + 30000));
  assert.strictEqual(entries.length, 1, 'same finding in same context within five minutes is merged');
  assert.strictEqual(entries[0].observations, 1, 'sub-minute polling must not inflate observation counts');
  assert.strictEqual(entries[0].timeline.length, 1, 'sub-minute samples must not add duplicate trend points');

  entries = await recordDiagnosticFindings(basePath, result('MISTURA_POBRE', 0.55), 'IDLE_WARM', new Date(start.getTime() + 90000));
  assert.strictEqual(entries[0].observations, 2, 'a sustained finding may be counted once per minute');
  assert.strictEqual(entries[0].score, 0.55);
  assert.strictEqual(entries[0].timeline.length, 2, 'a one-minute observation appends a trend point');
  assert.strictEqual(entries[0].timeline[1].score, 0.55);

  entries = await recordDiagnosticFindings(basePath, result(), 'IDLE_WARM', new Date(start.getTime() + 7 * 60000));
  assert.strictEqual(entries.length, 2, 'a finding after the active episode window starts a new episode');
  assert.ok(entries[0].lastSeenAt > entries[1].lastSeenAt);

  const recent = await readRecentDiagnosticFindings(basePath, 10, new Date(start.getTime() + 7 * 60000));
  assert.strictEqual(recent.length, 2);
  const txtPath = [...memory.keys()].find((file) => file.endsWith('.txt'));
  assert.ok(txtPath, 'a daily text history file should be created');
  assert.ok(memory.get(txtPath).includes('OBSERVAÇÕES REGISTRADAS'));
  assert.ok(memory.get(txtPath).includes('PRIMEIRA OBSERVAÇÃO UTC'));
  assert.ok(memory.get(txtPath).includes('TENDÊNCIA '), 'daily TXT should include sampled score trend points');
  console.log('Diagnostic finding history: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
