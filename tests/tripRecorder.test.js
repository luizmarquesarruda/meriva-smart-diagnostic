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

const { RealTripRecorder, shouldFinalizeStoppedTrip } = loadTs('src/trip/tripRecorder.ts');
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
const noFuelCycle = noFuel.buildDriveCycle(2000);
assert.ok(noFuelCycle, 'a real trip with distance must be retained even without fuel telemetry');
assert.strictEqual(noFuelCycle.fuelDataValid, false);
assert.strictEqual(noFuelCycle.avgFuelConsumptionKml, 0, 'unavailable consumption must not be fabricated');

const tinyFuel = new RealTripRecorder(1000, 0);
tinyFuel.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 8 });
tinyFuel.addSample({ timestampMs: 11000, distanceKm: 1, speedKmh: 36, fuelRateLph: 8 });
tinyFuel.addSample({ timestampMs: 21000, distanceKm: 2, speedKmh: 36, fuelRateLph: 8 });
assert.strictEqual(tinyFuel.getState().fuelUsedL < 0.05, true);
const tinyFuelCycle = tinyFuel.buildDriveCycle(22000);
assert.ok(tinyFuelCycle, 'trip below 0.05 L must remain in the real-trip history');
assert.strictEqual(tinyFuelCycle.fuelDataValid, false, 'trip under 0.05 L must not publish an unstable km/L average');
assert.strictEqual(tinyFuelCycle.avgFuelConsumptionKml, 0);

const cycle = new RealTripRecorder(1000, 0);
cycle.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 12, rpm: 800, coolantTempC: 25 });
cycle.addSample({ timestampMs: 11000, distanceKm: 1, speedKmh: 36, fuelRateLph: 12, rpm: 1800, coolantTempC: 40 });
cycle.addSample({ timestampMs: 21000, distanceKm: 2, speedKmh: 36, fuelRateLph: 12, rpm: 2200, coolantTempC: 78 });
const saved = cycle.buildDriveCycle(22000);

assert.ok(saved);
assert.strictEqual(saved.source, 'REAL_OBD');
assert.strictEqual(saved.distanceTotalKm, 2);
assertApprox(saved.fuelUsedL, 12 * 20_000 / 3_600_000, 1e-6);
assert.strictEqual(saved.avgFuelConsumptionKml, Number((2 / saved.fuelUsedL).toFixed(3)));
assert.strictEqual(saved.fuelDataValid, true, 'sufficient fuel samples must be marked valid');
assert.strictEqual(saved.maxSpeedKmh, 36, 'maximum speed must be persisted for the trip report');
assert.ok(Array.isArray(saved.telemetrySamples), 'trip must persist a bounded telemetry series');
assert.strictEqual(saved.telemetrySamples.length, 3, 'chart samples are stored no more often than every ten seconds');

// Older/duplicate timestamps cannot corrupt distance, speed, duration, or fuel.
const ordered = new RealTripRecorder(0, 10);
const orderedFirst = ordered.addSample({ timestampMs: 1000, distanceKm: 10, speedKmh: 10, fuelRateLph: 12 });
assert.deepStrictEqual(
  ordered.addSample({ timestampMs: 900, distanceKm: 100, speedKmh: 180, fuelRateLph: 12 }),
  orderedFirst,
  'out-of-order sample is ignored without mutating trip state',
);
assert.deepStrictEqual(
  ordered.addSample({ timestampMs: 1000, distanceKm: 100, speedKmh: 180, fuelRateLph: 12 }),
  orderedFirst,
  'duplicate timestamp is ignored',
);
const orderedNext = ordered.addSample({ timestampMs: 2000, distanceKm: 10.02, speedKmh: 30, fuelRateLph: 12 });
assert.strictEqual(orderedNext.distanceKm, 0.02);
assertApprox(orderedNext.fuelUsedL, 12 * 1000 / 3_600_000, 1e-12);
assert.strictEqual(orderedNext.maxSpeedKmh, 30);

// GPS cumulative-distance reset is rebased without rewinding accumulated trip distance.
const gpsReset = new RealTripRecorder(0, 10);
gpsReset.addSample({ timestampMs: 1000, distanceKm: 10, speedKmh: 0, fuelRateLph: 12 });
gpsReset.addSample({ timestampMs: 2000, distanceKm: 10.1, speedKmh: 30, fuelRateLph: 12 });
const afterReset = gpsReset.addSample({ timestampMs: 3000, distanceKm: 0.1, speedKmh: 30, fuelRateLph: 12 });
assert.strictEqual(afterReset.distanceKm, 0.1);
const recoveredDistance = gpsReset.addSample({ timestampMs: 4000, distanceKm: 0.2, speedKmh: 30, fuelRateLph: 12 });
assert.strictEqual(recoveredDistance.distanceKm, 0.2, 'GPS reset must not rewind accumulated trip distance');

// An invalid GPS distance must not be coerced to zero and poison the next
// cumulative-distance delta.
const invalidDistance = new RealTripRecorder(0, 10);
invalidDistance.addSample({ timestampMs: 1000, distanceKm: Number.NaN, speedKmh: 10, fuelRateLph: null });
const afterInvalidDistance = invalidDistance.addSample({
  timestampMs: 2000, distanceKm: 10.02, speedKmh: 20, fuelRateLph: null,
});
assert.strictEqual(
  afterInvalidDistance.distanceKm,
  0.02,
  'invalid GPS distance must preserve the last valid baseline',
);

const gap = new RealTripRecorder(0, 0);
gap.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: 10 });
gap.addSample({ timestampMs: 40_001, distanceKm: 1, speedKmh: 30, fuelRateLph: 10 });
assert.strictEqual(gap.getState().durationMs, 0);
assert.strictEqual(gap.getState().fuelUsedL, 0);

// Short stationary periods must not fragment a real drive into tiny trips.
assert.strictEqual(shouldFinalizeStoppedTrip(15_000, 850), false, 'idle at a traffic light must not close a trip after 15 seconds');
assert.strictEqual(shouldFinalizeStoppedTrip(299_999, 850), false, 'engine-running stop remains open until the longer threshold');
assert.strictEqual(shouldFinalizeStoppedTrip(300_000, 850), true, 'long stationary engine-running period can close the trip');
assert.strictEqual(shouldFinalizeStoppedTrip(59_999, 0), false, 'explicit engine-off needs a sustained zero-RPM period');
assert.strictEqual(shouldFinalizeStoppedTrip(60_000, 0), true, 'sustained explicit zero RPM closes the trip');
assert.strictEqual(shouldFinalizeStoppedTrip(300_000, null), true, 'missing RPM uses the conservative longer threshold');
assert.strictEqual(shouldFinalizeStoppedTrip(Number.NaN, 0), false, 'invalid elapsed time must not close a trip');

console.log('PASS trip recorder: GPS monotônico, timestamps, limiar de combustível e persistência REAL_OBD');
// A mathematically calculable but implausible average must be invalidated.
const implausible = new RealTripRecorder(1000, 0);
implausible.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 10 });
implausible.addSample({ timestampMs: 11000, distanceKm: 1, speedKmh: 36, fuelRateLph: 10 });
implausible.addSample({ timestampMs: 21000, distanceKm: 2, speedKmh: 36, fuelRateLph: 10 });
const implausibleCycle = implausible.buildDriveCycle(22000);
assert.ok(implausibleCycle);
assert.strictEqual(implausibleCycle.fuelDataValid, false, 'consumption above 30 km/L must be marked invalid');
assert.strictEqual(implausibleCycle.avgFuelConsumptionKml, 0, 'invalid consumption must not be stored as a real average');
