'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/storage/cleanup.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const calls = [];
const fakeFs = {
  getInfoAsync: async (file) => {
    if (file.endsWith('/LOGS/bad.csv')) throw new Error('falha simulada');
    if (file.endsWith('/LOGS')) return { exists: true, isDirectory: true };
    if (file.endsWith('/LOGS/good.csv')) return { exists: true, modificationTime: (Date.now() - 9 * 86400000) / 1000 };
    return { exists: false };
  },
  readDirectoryAsync: async () => ['bad.csv', 'good.csv'],
  deleteAsync: async (file, options) => { calls.push({ file, options }); },
};
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFs;
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(output, sourcePath); } finally { Module._load = originalLoad; }
(async () => {
  const result = await mod.exports.cleanupOldLogs('/base');
  assert.deepEqual(result, { removed: 1, failed: 1 });
  assert.equal(calls.length, 1, 'a falha em um arquivo não deve interromper a limpeza dos demais');
  assert.deepEqual(calls[0].options, { idempotent: true });
  console.log('cleanupRobustness.test.js: PASS');
})().catch(error => { console.error(error); process.exitCode = 1; });
