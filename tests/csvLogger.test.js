'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/database/csvLogger.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

const files = new Map();
let writes = 0;
const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync() {},
  async getInfoAsync(filePath) {
    return { exists: files.has(filePath), isDirectory: false };
  },
  async readAsStringAsync(filePath) {
    if (!files.has(filePath)) throw new Error('file not found');
    return files.get(filePath);
  },
  async writeAsStringAsync(filePath, value) {
    writes += 1;
    files.set(filePath, value);
  },
  async copyAsync({ from, to }) {
    if (!files.has(from)) throw new Error('temporary file missing');
    files.set(to, files.get(from));
  },
  async deleteAsync(filePath) {
    files.delete(filePath);
  },
};

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFileSystem;
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { appendCsvRow, flushCsvRows } = mod.exports;

(async () => {
  const filePath = '/app/LOGS/test.csv';
  await appendCsvRow(filePath, { timestamp: 't1', value: 1, note: 'first' });
  await appendCsvRow(filePath, { timestamp: 't2', value: 2, note: 'line1\r\nline2' });
  await flushCsvRows(filePath);

  assert.strictEqual(
    files.get(filePath),
    'timestamp,value,note\nt1,1,first\nt2,2,"line1\r\nline2"\n',
    'one batch must preserve header, line breaks and row order',
  );
  assert.strictEqual(writes, 1, 'multiple rows must be written in one batch');

  await appendCsvRow(filePath, { timestamp: 't3', value: 3, note: 'comma, "quoted"' });
  await flushCsvRows(filePath);
  assert.strictEqual(
    files.get(filePath),
    'timestamp,value,note\nt1,1,first\nt2,2,"line1\r\nline2"\nt3,3,"comma, ""quoted"""\n',
    'subsequent batches must append without duplicating the header',
  );
  assert.strictEqual(writes, 2, 'each explicit flush should write only one batch');
  console.log('PASS CSV logger: batching, row order and CSV escaping');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
