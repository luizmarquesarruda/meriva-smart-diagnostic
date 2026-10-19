'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/trip/tripSummary.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const { summarizeTripTelemetry } = mod.exports;

const summary = summarizeTripTelemetry([
  { timestamp: '2026-10-01T10:00:00.000Z', speedKmh: 0, rpm: 800, coolantTempC: 25 },
  { timestamp: '2026-10-01T10:00:10.000Z', speedKmh: 20, rpm: 1800, coolantTempC: 40 },
  { timestamp: '2026-10-01T10:00:20.000Z', speedKmh: 40, rpm: 2200, coolantTempC: null },
  { timestamp: '2026-10-01T10:00:30.000Z', speedKmh: null, rpm: null, coolantTempC: 80 },
  { timestamp: '2026-10-01T10:00:40.000Z', speedKmh: null, rpm: null, coolantTempC: -10 },
]);
assert.strictEqual(summary.sampleCount, 5);
assert.deepStrictEqual(summary.speed, { count: 3, min: 0, max: 40, average: 20 });
assert.deepStrictEqual(summary.rpm, { count: 3, min: 800, max: 2200, average: 1600 });
assert.deepStrictEqual(summary.coolant, { count: 4, min: -10, max: 80, average: (25 + 40 + 80 - 10) / 4 });
assert.strictEqual(summarizeTripTelemetry([]).speed, null, 'absence of samples must remain N/D, not zero');
console.log('Trip telemetry summary: PASS');
