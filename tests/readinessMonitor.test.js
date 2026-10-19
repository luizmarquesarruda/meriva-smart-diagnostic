'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/obd/readinessMonitor.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, module);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const { parseReadinessMonitorResponse, readReadinessMonitor } = mod.exports;

const spark = parseReadinessMonitorResponse('41 01 83 27 E5 41');
assert.ok(spark, 'valid PID 01 reply should parse');
assert.strictEqual(spark.milOn, true);
assert.strictEqual(spark.confirmedDtcCount, 3);
assert.strictEqual(spark.ignition, 'SPARK');
assert.strictEqual(spark.supportedCount, 8);
assert.strictEqual(spark.incompleteCount, 3);
assert.strictEqual(spark.monitors.find((item) => item.id === 'CATALYST').state, 'INCOMPLETE');
assert.strictEqual(spark.monitors.find((item) => item.id === 'O2_HEATER').state, 'INCOMPLETE');
assert.strictEqual(spark.monitors.find((item) => item.id === 'HEATED_CATALYST').state, 'NOT_SUPPORTED');
assert.strictEqual(spark.monitors.find((item) => item.id === 'FUEL_SYSTEM').state, 'INCOMPLETE');

const diesel = parseReadinessMonitorResponse('41 01 00 0F 4B 00');
assert.ok(diesel);
assert.strictEqual(diesel.ignition, 'COMPRESSION');
assert.strictEqual(diesel.monitors.find((item) => item.id === 'NOX_SCR').supported, true);
assert.strictEqual(diesel.monitors.find((item) => item.id === 'BOOST_PRESSURE').supported, true);
assert.strictEqual(diesel.monitors.find((item) => item.id === 'O2_SENSOR'), undefined);

assert.strictEqual(parseReadinessMonitorResponse('NO DATA'), null);
assert.strictEqual(parseReadinessMonitorResponse('41 01 80 00'), null);
assert.strictEqual(parseReadinessMonitorResponse('41 00 00 00 00'), null);

(async () => {
  const ok = await readReadinessMonitor({ executeCommand: async () => ({ command: '0101', response: '41 01 00 07 01 00', status: 'OK', elapsedMs: 24 }) });
  assert.strictEqual(ok.available, true);
  assert.strictEqual(ok.elapsedMs, 24);
  const unsupported = await readReadinessMonitor({ executeCommand: async () => ({ command: '0101', response: 'NO DATA', status: 'ERROR', elapsedMs: 10 }) });
  assert.strictEqual(unsupported.available, false);
  assert.strictEqual(unsupported.report, null);
  assert.ok(unsupported.reason);
  console.log('Readiness monitor parser + unsupported handling: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
