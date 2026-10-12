'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const files = new Map();
const directories = new Set(['/doc']);
let readCount = 0;
let writeCount = 0;

function parentDir(value) {
  const index = value.lastIndexOf('/');
  return index <= 0 ? '/' : value.slice(0, index);
}

const fakeFS = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync(value) {
    const parts = value.split('/').filter(Boolean);
    let current = '';
    for (const part of parts) {
      current += '/' + part;
      directories.add(current);
    }
  },
  async getInfoAsync(value) {
    if (files.has(value)) return { exists: true, isDirectory: false, size: files.get(value).length };
    if (directories.has(value)) return { exists: true, isDirectory: true, size: 0 };
    return { exists: false, isDirectory: false, size: 0 };
  },
  async readAsStringAsync(value) {
    readCount += 1;
    if (!files.has(value)) throw new Error('FILE_NOT_FOUND: ' + value);
    return files.get(value);
  },
  async writeAsStringAsync(value, content) {
    writeCount += 1;
    const parent = parentDir(value);
    if (parent && !directories.has(parent)) await this.makeDirectoryAsync(parent);
    files.set(value, String(content));
  },
};

const sourcePath = path.join(ROOT, 'src/database/csvLogger.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFS;
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const {
  appendCsvRow,
  appendCsvRowBuffered,
  flushBufferedCsvRows,
  getBufferedCsvRowCount,
} = mod.exports;

(async () => {
  const target = '/doc/MERIVA_SMART/LOGS/obd_raw_2026-10-12.csv';

  for (let index = 0; index < 24; index += 1) {
    appendCsvRowBuffered(target, {
      timestamp: new Date(1_800_000_000_000 + index).toISOString(),
      pid: '010C',
      value: index,
      source: 'REAL',
    });
  }

  assert.ok(getBufferedCsvRowCount(target) <= 24);
  await flushBufferedCsvRows(target);
  const saved = files.get(target);
  const rows = saved.trim().split(/\r?\n/);
  assert.strictEqual(rows.length, 25, 'a CSV header and every buffered reading must be preserved');
  assert.ok(rows[1].includes('010C'));
  assert.ok(rows[24].includes('23'));
  assert.ok(writeCount <= 3, '24 readings should be written in a few batches, not 24 full-file rewrites');
  assert.ok(readCount <= 2, 'batching should avoid a read/modify/write for each OBD sample');

  await appendCsvRow(target, {
    timestamp: new Date().toISOString(),
    pid: '010D',
    value: 36,
    source: 'REAL',
  });
  assert.strictEqual(files.get(target).trim().split(/\r?\n/).length, 26,
    'the immediate append API must remain durable for low-frequency callers');

  console.log('csvLoggerPerformance.test.js: buffered CSV batches and durable append: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
