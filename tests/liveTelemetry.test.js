'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(output, sourcePath);
  return mod.exports;
}

const telemetry = loadTs('src/obd/liveTelemetry.ts');
telemetry.resetLiveTelemetry();

telemetry.recordLivePidReading({
  pid: '010C',
  name: 'RPM',
  value: 800,
  unit: 'rpm',
  timestamp: new Date().toISOString(),
  source: 'SIMULACAO',
});
assert.strictEqual(telemetry.getLivePidTrend('010C'), null);

for (let i = 0; i < 125; i += 1) {
  telemetry.recordLivePidReading({
    pid: '010C',
    name: 'RPM',
    value: i,
    unit: 'rpm',
    timestamp: new Date().toISOString(),
    source: 'REAL',
  });
}
let trend = telemetry.getLivePidTrend('010C');
assert.ok(trend);
assert.strictEqual(trend.samples, telemetry.LIVE_TELEMETRY_MAX_POINTS);
assert.strictEqual(trend.min, 5);
assert.strictEqual(trend.max, 124);
assert.strictEqual(trend.current, 124);
assert.strictEqual(trend.values.length, 30);
assert.ok(telemetry.formatSparkline(trend.values).length === 30);

let values = new Map([
  ['010D', 0],
  ['010C', 800],
  ['0105', 60],
]);
assert.strictEqual(telemetry.classifyVehicleCondition(values), 'IDLE_COLD');

values.set('0105', 85);
assert.strictEqual(telemetry.classifyVehicleCondition(values), 'IDLE_WARM');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 40], ['010C', 1800]]), 30), 'ACCELERATION');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 20], ['010C', 1800]]), 40), 'DECELERATION');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 60], ['010C', 2000]]), 61), 'CRUISE');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map()), 'UNKNOWN');

telemetry.resetLiveTelemetry();
const stale = new Date(Date.now() - 30_000).toISOString();
telemetry.recordLivePidReading({ pid: '010D', name: 'Speed', value: 0, unit: 'km/h', timestamp: stale, source: 'REAL' });
telemetry.recordLivePidReading({ pid: '010C', name: 'RPM', value: 800, unit: 'rpm', timestamp: stale, source: 'REAL' });
telemetry.recordLivePidReading({ pid: '0105', name: 'Coolant', value: 85, unit: 'celsius', timestamp: stale, source: 'REAL' });
assert.strictEqual(telemetry.getVehicleConditionSnapshot().condition, 'UNKNOWN');

console.log('Live telemetry: rolling window + context + simulation isolation: PASS');
