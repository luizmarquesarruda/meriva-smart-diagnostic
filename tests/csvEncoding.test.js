'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/storage/csvEncoding.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const { escapeCsvCell } = mod.exports;
assert.strictEqual(escapeCsvCell('REAL_OBD'), '"REAL_OBD"');
assert.strictEqual(escapeCsvCell('say "hello"'), '"say ""hello"""');
assert.strictEqual(escapeCsvCell('=1+1').charAt(1), "'", 'formula-prefixed text must be neutralized');
assert.strictEqual(escapeCsvCell('  +1+1').charAt(1), "'", 'leading whitespace must not bypass formula neutralization');
assert.strictEqual(escapeCsvCell('\t=1+1').charAt(1), "'", 'tab-prefixed formula-like text must be neutralized');
assert.strictEqual(escapeCsvCell(-12.5), '"-12.5"', 'numeric negatives must remain numeric data');
assert.strictEqual(escapeCsvCell(null), '""');
assert.ok(fs.readFileSync(path.resolve(__dirname, '../src/storage/exportDiagnostics.ts'), 'utf8').includes('escapeCsvCell'),
  'drive-cycle CSV exporter must use the tested encoder');

console.log('csvEncoding.test.js: PASS');
