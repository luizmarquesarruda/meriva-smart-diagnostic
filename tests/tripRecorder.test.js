'use strict';

const assert = require('assert');
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');

function loadTs(file) {
  const sourcePath = path.join(ROOT, file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(output, sourcePath);
  return mod.exports;
}

const fuelPath = path.join(ROOT, 'src', 'obd', 'fuelConsumption.ts');
const fuelOutput = ts.transpileModule(fs.readFileSync(fuelPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const fuelMod = new Module(fuelPath, null);
fuelMod.filename = fuelPath;
fuelMod.paths = Module._nodeModulePaths(path.dirname(fuelPath));
fuelMod._compile(fuelOutput, fuelPath);

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === '../obd/fuelConsumption') return fuelMod.exports;
  if (request === '../data/driveCycles') return {};
  return originalLoad.apply(this, arguments);
};

function assertApprox(actual, expected, epsilon = 1e-9) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);
}

const { RealTripRecorder } = loadTs('src/trip/tripRecorder.ts');
Module._load = originalLoad;

const recorder = new RealTripRecorder(1000, 5.000);
recorder.addSample({ timestampMs: 1000, distanceKm: 5.000, speedKmh: 0, fuelRateLph: 10 });
recorder.addSample({ timestampMs: 3000, distanceKm: 5.020, speedKmh: 36, fuelRateLph: 10 });
const state = recorder.addSample({ timestampMs: 5000, distanceKm: 5.040, speedKmh: 36, fuelRateLph: 10 });

assert.strictEqual(state.distanceKm, 0.04);
assertApprox(state.fuelUsedL, 0.011111111111111112, 1e-12);
assert.strictEqual(state.validFuelSamples, 3);
assert.strictEqual(state.durationMs, 4000);
assert.strictEqual(state.movingTimeMs, 4000);
assert.strictEqual(state.maxSpeedKmh, 36);

const noFuel = new RealTripRecorder(0, 0);
noFuel.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: null });
noFuel.addSample({ timestampMs: 1000, distanceKm: 0.2, speedKmh: 20, fuelRateLph: null });
assert.strictEqual(noFuel.buildDriveCycle(2000), null);

const cycle = new RealTripRecorder(1000, 0);
cycle.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 8 });
cycle.addSample({ timestampMs: 16000, distanceKm: 1, speedKmh: 36, fuelRateLph: 8 });
cycle.addSample({ timestampMs: 31000, distanceKm: 2, speedKmh: 36, fuelRateLph: 8 });
const saved = cycle.buildDriveCycle(32000);

assert.ok(saved);
assert.strictEqual(saved.source, 'REAL_OBD');
assert.strictEqual(saved.distanceTotalKm, 2);
assertApprox(saved.fuelUsedL, 8 * 30_000 / 3_600_000, 1e-6);
assert.strictEqual(saved.avgFuelConsumptionKml, Number((2 / saved.fuelUsedL).toFixed(3)));

const tinyFuel = new RealTripRecorder(0, 0);
tinyFuel.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: 0.5 });
tinyFuel.addSample({ timestampMs: 10_000, distanceKm: 1, speedKmh: 36, fuelRateLph: 0.5 });
tinyFuel.addSample({ timestampMs: 20_000, distanceKm: 1.1, speedKmh: 36, fuelRateLph: 0.5 });
assert.strictEqual(tinyFuel.buildDriveCycle(21_000), null, 'tiny fuel totals must not publish a misleading economy average');

const outOfOrder = new RealTripRecorder(0, 0);
outOfOrder.addSample({ timestampMs: 10_000, distanceKm: 1, speedKmh: 30, fuelRateLph: 8 });
outOfOrder.addSample({ timestampMs: 5_000, distanceKm: 5, speedKmh: 100, fuelRateLph: 100 });
assert.strictEqual(outOfOrder.getState().distanceKm, 1, 'out-of-order sample must not change distance');
assert.strictEqual(outOfOrder.getState().maxSpeedKmh, 30, 'out-of-order sample must not change max speed');

const gap = new RealTripRecorder(0, 0);
gap.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: 10 });
gap.addSample({ timestampMs: 40_001, distanceKm: 1, speedKmh: 30, fuelRateLph: 10 });
assert.strictEqual(gap.getState().durationMs, 0);
assert.strictEqual(gap.getState().fuelUsedL, 0);

console.log('PASS trip recorder: GPS + PID 015E + persistência de ciclo real');