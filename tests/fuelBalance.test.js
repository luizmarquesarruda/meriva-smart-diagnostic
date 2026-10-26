'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function loadTs(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const loaded = new Module(file, null);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === file && Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    return originalLoad.apply(this, arguments);
  };
  try { loaded._compile(output, file); } finally { Module._load = originalLoad; }
  return loaded.exports;
}
const fuelLevel = loadTs(path.join(ROOT, 'src/trip/fuelLevel.ts'));
const { estimateFuelRemainingFromFullTank } = loadTs(path.join(ROOT, 'src/trip/fuelBalance.ts'), { './fuelLevel': fuelLevel, './tripRecorder': { MIN_TRIP_FUEL_L: 0.05 } });
const full = { id: 'full', occurredAt: '2026-10-01T08:00:00.000Z', odometerKm: 10000, liters: 40, totalCost: 250, type: 'GASOLINA', fullTank: true };
const partial = { id: 'partial', occurredAt: '2026-10-01T09:10:00.000Z', odometerKm: 10100, liters: 6, totalCost: 40, type: 'GASOLINA', fullTank: false };
const trip1 = { id: 'real1', startedAt: '2026-10-01T08:10:00.000Z', finishedAt: '2026-10-01T09:00:00.000Z', distanceTotalKm: 100, fuelUsedL: 8, avgFuelConsumptionKml: 12.5, fuelDataValid: true, source: 'REAL_OBD', telemetrySamples: [] };
const trip2 = { id: 'real2', startedAt: '2026-10-01T09:20:00.000Z', finishedAt: '2026-10-01T10:00:00.000Z', distanceTotalKm: 50, fuelUsedL: 4, avgFuelConsumptionKml: 12.5, fuelDataValid: true, source: 'REAL_OBD', telemetrySamples: [] };
const active = { active: true, startedAtMs: Date.parse('2026-10-01T10:10:00.000Z'), distanceKm: 10, fuelUsedL: 1, fuelDataValid: true };
const estimate = estimateFuelRemainingFromFullTank({ fuelings: [full, partial], trips: [trip1, trip2], activeTrip: active });
assert.equal(estimate?.remainingFuelL, 49, '56 L - 8 L + 6 L - 4 L - 1 L');
assert.equal(estimate?.tripsCount, 3);
assert.equal(estimate?.partialFuelingsCount, 1);
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full, partial],
  trips: [trip1, trip2],
  activeTrip: active,
  currentOdometerKm: 10160,
})?.remainingFuelL, 49, 'odômetro atual coerente com 50 km após o abastecimento parcial e 10 km ativos');
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full, partial],
  trips: [trip1, trip2],
  activeTrip: active,
  currentOdometerKm: 10100,
}), null, 'odômetro desatualizado não pode ocultar 60 km percorridos depois do abastecimento parcial');
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full, partial],
  trips: [trip1, trip2],
  currentOdometerKm: 10050,
}), null, 'odômetro anterior ao último abastecimento invalida a estimativa');
assert.equal(estimateFuelRemainingFromFullTank({ fuelings: [partial], trips: [trip1] }), null,
  'abastecimento parcial sem baseline completo não permite inferir o tanque');
assert.equal(estimateFuelRemainingFromFullTank({ fuelings: [full], trips: [{ ...trip1, fuelDataValid: false }]}), null,
  'viagem real sem combustível válido invalida o balanço');
assert.equal(estimateFuelRemainingFromFullTank({ fuelings: [full, { ...partial, liters: 10 }], trips: [trip1] }), null,
  'abastecimento que excede a capacidade física não é aceito');
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full, partial],
  trips: [{ ...trip1, distanceTotalKm: 80 }],
}), null, 'odômetro divergente no próximo abastecimento denuncia viagem não contabilizada');
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full, { ...partial, occurredAt: '2026-10-01T08:30:00.000Z' }],
  trips: [trip1],
}), null, 'abastecimento no meio de uma viagem invalida a ordenação do balanço');
assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full],
  trips: [],
  activeTrip: { active: true, startedAtMs: Date.parse('2026-10-01T07:50:00.000Z'), distanceKm: 10, fuelUsedL: 1, fuelDataValid: true },
}), null, 'viagem ativa iniciada antes do baseline não pode ser subtraída integralmente');
assert.equal(estimateFuelRemainingFromFullTank({ fuelings: [full], trips: [] })?.remainingFuelL, 56,
  'tanque completo válido sem viagens posteriores começa em 56 L');

assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full],
  trips: [{ ...trip1, fuelUsedL: 1 }],
}), null, 'consumo da viagem deve ser coerente com distância / litros');

assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full],
  trips: [{ ...trip1, distanceTotalKm: 1, fuelUsedL: 0.01, avgFuelConsumptionKml: 100, fuelDataValid: undefined }],
}), null, 'menos de 0,05 L não deve alimentar o balanço e superestimar a autonomia');

assert.equal(estimateFuelRemainingFromFullTank({
  fuelings: [full],
  trips: [
    trip1,
    { ...trip2, startedAt: '2026-10-01T08:50:00.000Z' },
  ],
}), null, 'viagens REAL_OBD sobrepostas indicam histórico incoerente e invalidam o fallback');
console.log('fuelBalance.test.js: PASS');
