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
const incomplete = noFuel.buildDriveCycle(2000);
assert.ok(incomplete, 'trajeto observado deve ser preservado mesmo sem combustível integrado');
assert.strictEqual(incomplete.source, 'REAL_OBD');
assert.strictEqual(incomplete.dataQuality, 'INCOMPLETE');
assert.strictEqual(incomplete.avgFuelConsumptionKml, 0, 'não inventar consumo sem taxa de combustível válida');
assert.ok(incomplete.incompleteReason.includes('INSUFFICIENT_FUEL_VOLUME'));

const cycle = new RealTripRecorder(1000, 0);
cycle.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 8 });
cycle.addSample({ timestampMs: 11000, distanceKm: 1, speedKmh: 36, fuelRateLph: 8 });
cycle.addSample({ timestampMs: 21000, distanceKm: 2, speedKmh: 36, fuelRateLph: 8 });
const saved = cycle.buildDriveCycle(22000);
assert.ok(saved);
assert.strictEqual(saved.source, 'REAL_OBD');
assert.strictEqual(saved.dataQuality, 'COMPLETE');
assert.strictEqual(saved.distanceTotalKm, 2);
assertApprox(saved.fuelUsedL, 8 * 20_000 / 3_600_000, 1e-6);
assert.strictEqual(saved.avgFuelConsumptionKml, Number((2 / saved.fuelUsedL).toFixed(3)));

const shortTrip = new RealTripRecorder(1000, 0);
shortTrip.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 8 });
shortTrip.addSample({ timestampMs: 11000, distanceKm: 0.04, speedKmh: 12, fuelRateLph: 8 });
const shortCycle = shortTrip.buildDriveCycle(12000);
assert.ok(shortCycle, 'viagem real curta deve permanecer no histórico');
assert.strictEqual(shortCycle.dataQuality, 'INCOMPLETE');
assert.strictEqual(shortCycle.avgFuelConsumptionKml, 0);
assert.ok(shortCycle.incompleteReason.includes('DISTANCE_TOO_SHORT'));

const outOfOrder = new RealTripRecorder(0, 0);
outOfOrder.addSample({ timestampMs: 10000, distanceKm: 1, speedKmh: 30, fuelRateLph: 8 });
const afterFirst = outOfOrder.getState();
const rejectedLate = outOfOrder.addSample({ timestampMs: 5000, distanceKm: 5, speedKmh: 100, fuelRateLph: 100 });
assert.deepStrictEqual(rejectedLate, afterFirst, 'amostra atrasada não deve alterar nenhum acumulador');
const rejectedDuplicate = outOfOrder.addSample({ timestampMs: 10000, distanceKm: 7, speedKmh: 150, fuelRateLph: 100 });
assert.deepStrictEqual(rejectedDuplicate, afterFirst, 'timestamp duplicado não deve alterar nenhum acumulador');
assert.strictEqual(outOfOrder.getState().distanceKm, 1);
assert.strictEqual(outOfOrder.getState().maxSpeedKmh, 30);

const gpsReset = new RealTripRecorder(0, 10);
gpsReset.addSample({ timestampMs: 1000, distanceKm: 10, speedKmh: 0, fuelRateLph: 8 });
gpsReset.addSample({ timestampMs: 2000, distanceKm: 10.1, speedKmh: 20, fuelRateLph: 8 });
const afterReset = gpsReset.addSample({ timestampMs: 3000, distanceKm: 0.1, speedKmh: 20, fuelRateLph: 8 });
assert.strictEqual(afterReset.distanceKm, 0.1, 'reset GPS não pode apagar distância acumulada');
const afterResetRecovery = gpsReset.addSample({ timestampMs: 4000, distanceKm: 0.2, speedKmh: 20, fuelRateLph: 8 });
assert.strictEqual(afterResetRecovery.distanceKm, 0.2, 'distância deve voltar a acumular depois do reset');

const invalidDistance = new RealTripRecorder(0, 10);
invalidDistance.addSample({ timestampMs: 1000, distanceKm: Number.NaN, speedKmh: 10, fuelRateLph: null });
const validAfterInvalid = invalidDistance.addSample({ timestampMs: 2000, distanceKm: 10.02, speedKmh: 20, fuelRateLph: null });
assert.strictEqual(validAfterInvalid.distanceKm, 0.02, 'distância inválida não pode substituir a última referência válida');

const invalidTimestamp = new RealTripRecorder(0, 0);
const initial = invalidTimestamp.addSample({ timestampMs: 1000, distanceKm: 0, speedKmh: 0, fuelRateLph: 8 });
const invalidTimeState = invalidTimestamp.addSample({ timestampMs: Number.NaN, distanceKm: 5, speedKmh: 200, fuelRateLph: 100 });
assert.deepStrictEqual(invalidTimeState, initial, 'timestamp inválido deve ser descartado sem mutar o estado');

const gap = new RealTripRecorder(0, 0);
gap.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: 10 });
gap.addSample({ timestampMs: 40_001, distanceKm: 1, speedKmh: 30, fuelRateLph: 10 });
assert.strictEqual(gap.getState().durationMs, 0);
assert.strictEqual(gap.getState().fuelUsedL, 0);

const { getDriveCycleSummary } = loadTs('src/data/driveCycles.ts');
const completeSummary = getDriveCycleSummary([saved, incomplete, shortCycle]);
assert.strictEqual(completeSummary.realCycleCount, 3, 'histórico deve contar trajetos completos e incompletos');
assert.strictEqual(completeSummary.totalDistanceKm, 2.24, 'distância de viagens incompletas continua no total observado');
assert.strictEqual(completeSummary.avgConsumptionKml, Number((2 / saved.fuelUsedL).toFixed(2)), 'média de consumo usa apenas ciclos completos');

console.log('PASS trip recorder: GPS monotônico, timestamps, viagens curtas e consumo incompleto');
