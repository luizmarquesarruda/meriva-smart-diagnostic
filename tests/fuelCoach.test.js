'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'fuelCoach.ts');
const output = ts.transpileModule(require('node:fs').readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const { buildFuelCoachReference, evaluateFuelCoach } = mod.exports;

function trip(id, overrides = {}) {
  return {
    id,
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T10:30:00.000Z',
    distanceTotalKm: 8,
    distanceIceKm: 8,
    fuelUsedL: 2,
    totalTimeHms: '00:30:00',
    drivingTimeHms: '00:20:00',
    standingTimeHms: '00:10:00',
    avgDrivingSpeedKmh: 24,
    avgFuelConsumptionKml: 4,
    fuelDataValid: true,
    fuelType: 'ETANOL',
    source: 'REAL_OBD',
    fuelRateSource: 'MEASURED_015E',
    importedAt: '2026-10-01T10:30:00.000Z',
    ...overrides,
  };
}

function windowSamples(nowMs, consumptionKmL = 4.5, overrides = {}) {
  return [20_000, 15_000, 10_000, 5_000].map((age) => ({
    timestampMs: nowMs - age,
    consumptionKmL,
    speedKmh: 40,
    source: 'MEASURED_015E',
    fuelType: 'ETANOL',
    ...overrides,
  }));
}

const compatibleTrips = [trip('1'), trip('2'), trip('3')];
const reference = buildFuelCoachReference(compatibleTrips, 'ETANOL', 'MEASURED_015E');
assert.strictEqual(reference.ready, true);
assert.strictEqual(reference.sampleCount, 3);
assert.strictEqual(reference.totalDistanceKm, 24);
assert.strictEqual(reference.averageKmL, 4);

const mixedTrips = [
  ...compatibleTrips,
  trip('gas', { fuelType: 'GASOLINA' }),
  trip('mixed', { fuelRateSource: 'MIXED' }),
  trip('invalid', { fuelDataValid: false }),
  trip('seed', { source: 'CARSCANNER_SEED' }),
  trip('legacy', { fuelType: undefined }),
];
assert.strictEqual(buildFuelCoachReference(mixedTrips, 'ETANOL', 'MEASURED_015E').sampleCount, 3,
  'referência utiliza somente viagens reais compatíveis');
assert.strictEqual(buildFuelCoachReference(compatibleTrips.slice(0, 2), 'ETANOL', 'MEASURED_015E').ready, false);
assert.strictEqual(buildFuelCoachReference(compatibleTrips, 'GASOLINA', 'MEASURED_015E').ready, false);
assert.strictEqual(buildFuelCoachReference(compatibleTrips, 'ETANOL', 'ESTIMATED_MAF').ready, false);

const nowMs = 1_800_000_000_000;
function evaluate(kmL, sampleSet = windowSamples(nowMs, kmL), overrides = {}) {
  return evaluateFuelCoach({
    ecuConnected: true,
    currentKmL: kmL,
    currentTimestampMs: nowMs - 1000,
    currentSpeedKmh: 40,
    source: 'MEASURED_015E',
    fuelType: 'ETANOL',
    samples: sampleSet,
    reference,
    nowMs,
    ...overrides,
  });
}

assert.strictEqual(evaluate(4.5).status, 'GOOD', '10% ou mais acima da referência classifica como bom');
assert.strictEqual(evaluate(3.2).status, 'ELEVATED', '15% ou mais abaixo da referência classifica como elevado');
assert.strictEqual(evaluate(3.8).status, 'NORMAL');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5), { ecuConnected: false }).status, 'WAITING_FOR_ECU');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5), { currentTimestampMs: nowMs - 20_000 }).status, 'WAITING_FOR_DATA');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5).slice(0, 2)).status, 'COLLECTING');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5, { speedKmh: 10 })).status, 'CONTEXT_UNSTABLE');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5), {
  reference: buildFuelCoachReference([], 'ETANOL', 'MEASURED_015E'),
}).status, 'CALIBRATING');
assert.strictEqual(evaluate(4.5, windowSamples(nowMs, 4.5, { source: 'ESTIMATED_MAF' }), {
  source: 'ESTIMATED_MAF',
}).status, 'CALIBRATING', 'fontes diferentes exigem referências diferentes');

console.log('PASS fuel coach: referência, fonte, frescor, estabilidade e faixas');
