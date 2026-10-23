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
const telemetryChart = loadTs('src/obd/telemetryChart.ts');
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

telemetry.resetLiveTelemetry();
const future = new Date(Date.now() + 60_000).toISOString();
for (const sample of [
  { pid: '010D', name: 'Speed', value: 0, unit: 'km/h', timestamp: future, source: 'REAL' },
  { pid: '010C', name: 'RPM', value: 800, unit: 'rpm', timestamp: future, source: 'REAL' },
  { pid: '0105', name: 'Coolant', value: 85, unit: 'celsius', timestamp: future, source: 'REAL' },
  { pid: '0111', name: 'Throttle', value: 30, unit: '%', timestamp: 'not-a-timestamp', source: 'REAL' },
]) telemetry.recordLivePidReading(sample);
assert.strictEqual(telemetry.getLiveSeries('010D').length, 0, 'future timestamp must not enter live telemetry');
assert.strictEqual(telemetry.getLivePidTrend('010C'), null, 'future timestamp must not appear as a current trend');
assert.strictEqual(telemetry.getVehicleConditionSnapshot().condition, 'UNKNOWN', 'future timestamps must not affect operational context');

// Chart geometry: real finite timestamps only, fixed window, and gaps are not connected.
const now = Date.now();
const chart = telemetryChart.buildTelemetryChart([
  { timestamp: new Date(now - 5000).toISOString(), value: 10 },
  { timestamp: new Date(now - 4000).toISOString(), value: 20 },
  { timestamp: new Date(now - 3000).toISOString(), value: null },
  { timestamp: 'not-a-timestamp', value: 90 },
  { timestamp: new Date(now + 1000).toISOString(), value: 999 },
  { timestamp: new Date(now - 1000).toISOString(), value: 30 },
], 320, 160, now, 4, 8);

assert.ok(chart, 'real numeric points should produce a chart model');
assert.strictEqual(chart.samples, 3);
assert.strictEqual(chart.min, 10);
assert.strictEqual(chart.max, 30);
assert.strictEqual(chart.current, 30);
assert.strictEqual(chart.average, 20);
assert.strictEqual(chart.delta, 20);
assert.strictEqual(chart.points.length, 3);
assert.strictEqual(chart.segments.length, 1, 'chart must not draw a line across a missing sample');
assert.ok(chart.points.every((point) => point.x >= 8 && point.x <= 312 && point.y >= 8 && point.y <= 152));
assert.ok(chart.segments.every((segment) => Number.isFinite(segment.length) && Number.isFinite(segment.angleDeg)));
assert.strictEqual(telemetryChart.buildTelemetryChart([], 320, 160, now), null);
assert.strictEqual(telemetryChart.buildTelemetryChart([{ timestamp: 'bad', value: 1 }], 320, 160, now), null);
assert.strictEqual(telemetryChart.buildTelemetryChart([{ timestamp: new Date(now).toISOString(), value: 1 }], 0, 160, now), null);

const flatChart = telemetryChart.buildTelemetryChart([
  { timestamp: new Date(now - 1000).toISOString(), value: 7 },
  { timestamp: new Date(now).toISOString(), value: 7 },
], 300, 120, now);
assert.ok(flatChart);
assert.strictEqual(flatChart.points[0].y, 60);
assert.strictEqual(flatChart.points[1].y, 60);

console.log('Live telemetry + chart geometry: rolling window, gap handling, invalid timestamps and simulation isolation: PASS');
