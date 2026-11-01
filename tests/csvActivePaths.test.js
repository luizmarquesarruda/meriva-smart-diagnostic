'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const sourcePath = path.resolve(__dirname, '../src/database/csvLogger.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
const fakeFs = { readDirectoryAsync: async () => [], getInfoAsync: async () => ({ exists: false }) };
const fakeReactNative = { AppState: { addEventListener: () => ({ remove() {} }) } };
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFs;
  if (request === 'react-native') return fakeReactNative;
  if (request === './csvQueuePolicy') return { BATCH_FLUSH_ROW_LIMIT: 8, HARD_MAX_PENDING_CSV_ROWS: 20000, MAX_PENDING_CSV_ROWS: 10000, SPILL_CHUNK_ROWS: 128, getCsvQueueAction: () => 'queue' };
  return originalLoad.call(this, request, parent, isMain);
};
try { mod._compile(output, sourcePath); } finally { Module._load = originalLoad; }
const today = new Date();
const key = [today.getFullYear(), String(today.getMonth()+1).padStart(2,'0'), String(today.getDate()).padStart(2,'0')].join('-');
mod.exports.queueCsvRow(`/base/LOGS/obd_raw_${key}.csv`, { pid: '010C', valor: 900 });
const active = mod.exports.getActiveCsvLogPaths();
assert.ok(active.includes(`/base/LOGS/obd_raw_${key}.csv`), 'CSV diário atual deve ficar protegido antes mesmo do flush');
console.log('csvActivePaths.test.js: PASS');
