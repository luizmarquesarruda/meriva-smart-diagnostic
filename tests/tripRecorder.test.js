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
cycle.addSample({ timestampMs: 16000, distanceKm: 0.2, speedKmh: 36, fuelRateLph: 8 });
cycle.addSample({ timestampMs: 31000, distanceKm: 0.4, speedKmh: 36, fuelRateLph: 8 });
const saved = cycle.buildDriveCycle(32000);
assert.ok(saved);
assert.strictEqual(saved.source, 'REAL_OBD');
assert.strictEqual(saved.dataQuality, 'COMPLETE');
assert.strictEqual(saved.distanceTotalKm, 0.4);
assertApprox(saved.fuelUsedL, 8 * 30_000 / 3_600_000, 1e-6);
assert.strictEqual(saved.avgFuelConsumptionKml, Number((0.4 / saved.fuelUsedL).toFixed(3)));

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

const subMeterSegments = new RealTripRecorder(0, 0);
subMeterSegments.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: null });
for (let i = 1; i <= 100; i += 1) {
  subMeterSegments.addSample({
    timestampMs: i * 1000,
    distanceKm: i * 0.0004,
    speedKmh: 2,
    fuelRateLph: null,
  });
}
assert.strictEqual(subMeterSegments.getState().distanceKm, 0.04, 'segmentos pequenos não podem desaparecer por arredondamento acumulado');

const gap = new RealTripRecorder(0, 0);
gap.addSample({ timestampMs: 0, distanceKm: 0, speedKmh: 0, fuelRateLph: 10 });
gap.addSample({ timestampMs: 40_001, distanceKm: 1, speedKmh: 30, fuelRateLph: 10 });
assert.strictEqual(gap.getState().durationMs, 0);
assert.strictEqual(gap.getState().fuelUsedL, 0);

const { getDriveCycleSummary } = loadTs('src/data/driveCycles.ts');
const completeSummary = getDriveCycleSummary([saved, incomplete, shortCycle]);
assert.strictEqual(completeSummary.realCycleCount, 3, 'histórico deve contar trajetos completos e incompletos');
assert.strictEqual(completeSummary.totalDistanceKm, 0.64, 'distância de viagens incompletas continua no total observado');
assert.strictEqual(completeSummary.avgConsumptionKml, Number((0.4 / saved.fuelUsedL).toFixed(2)), 'média de consumo usa apenas ciclos completos');

const summaryCycleA = {
  ...saved,
  id: 'summary-a',
  distanceTotalKm: 10,
  fuelUsedL: 1,
  avgFuelConsumptionKml: 10,
  drivingTimeHms: '00:30:00',
  dataQuality: 'COMPLETE',
};
const summaryCycleB = {
  ...saved,
  id: 'summary-b',
  distanceTotalKm: 30,
  fuelUsedL: 3,
  avgFuelConsumptionKml: 10,
  drivingTimeHms: '00:30:00',
  dataQuality: 'COMPLETE',
};
const invalidLegacyCycle = {
  ...saved,
  id: 'legacy-invalid',
  distanceTotalKm: 100,
  fuelUsedL: 0,
  avgFuelConsumptionKml: 0,
  drivingTimeHms: '00:00:00',
  dataQuality: undefined,
};
const mismatchedLegacyCycle = {
  ...saved,
  id: 'legacy-mismatched-consumption',
  distanceTotalKm: 10,
  fuelUsedL: 0.1,
  avgFuelConsumptionKml: 20,
  drivingTimeHms: '00:10:00',
  dataQuality: undefined,
};
const weightedSummary = getDriveCycleSummary([summaryCycleA, summaryCycleB]);
assert.strictEqual(weightedSummary.avgSpeedKmh, 40, 'velocidade média agregada deve ser distância total / tempo total em movimento');
const guardedSummary = getDriveCycleSummary([summaryCycleA, summaryCycleB, invalidLegacyCycle, mismatchedLegacyCycle]);
assert.strictEqual(guardedSummary.avgConsumptionKml, 10, 'ciclos legados sem combustível válido ou com fórmula inconsistente não podem inflar a média km/L');
assert.strictEqual(guardedSummary.totalDistanceKm, 150, 'distância observada continua no total mesmo quando o consumo é inválido');

// Regression: all trip-consumption surfaces must reject legacy/incomplete values.
const storageScreenSource = fs.readFileSync(path.join(ROOT, 'app', 'armazenamento.tsx'), 'utf8');
const exportSource = fs.readFileSync(path.join(ROOT, 'src', 'storage', 'exportDiagnostics.ts'), 'utf8');
assert.ok(storageScreenSource.includes("cycle.source === 'REAL_OBD'"), 'storage UI must hide Car Scanner/reference history');
assert.ok(storageScreenSource.includes('isCycleConsumptionValid(cycle)'), 'storage UI must validate consumption before display');
assert.ok(exportSource.includes("csv(isCycleConsumptionValid(cycle) ? cycle.avgFuelConsumptionKml : 'N/D')"), 'CSV must export invalid/legacy consumption as N/D');
assert.ok(exportSource.includes("avgFuelConsumptionKml: consumptionValid ? cycle.avgFuelConsumptionKml : null"), 'JSON must null out unverified consumption');
assert.ok(exportSource.includes("'LEGACY_UNVERIFIED'"), 'exports must label cycles without a quality marker as legacy/unverified');
const tripStorageSource = fs.readFileSync(path.join(ROOT, 'src', 'storage', 'driveCycleStorage.ts'), 'utf8');
assert.ok(tripStorageSource.includes("avgConsumption: isCycleConsumptionValid(cycle) ? cycle.avgFuelConsumptionKml : 'N/D'"), 'daily trip CSV must not treat unverified consumption as real');

console.log('PASS trip recorder: GPS monotônico, histórico real e consumo validado em telas/exportações');
