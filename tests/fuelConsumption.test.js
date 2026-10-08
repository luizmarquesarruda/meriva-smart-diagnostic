'use strict';

const assert = require('assert');
const { loadTs } = require('./helpers/loadTs');

const { integrateFuelRateLph, FuelRateIntegrator } = loadTs('src/obd/fuelConsumption.ts');

function assertApprox(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);
}

assert.strictEqual(integrateFuelRateLph(null, { fuelRateLph: 12, timestampMs: 1000 }), 0);
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 12, timestampMs: 1000 },
    { fuelRateLph: 12, timestampMs: 3700 },
  ),
  0.009,
);
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 10, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 11000 },
  ),
  0.04166666666666667,
);
assert.strictEqual(
  integrateFuelRateLph(
    { fuelRateLph: 10, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 32001 },
  ),
  0,
);
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 0, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 2000 },
  ),
  0.002777777777777778,
);

const integrator = new FuelRateIntegrator();
assert.deepStrictEqual(integrator.addSample(10, 1000), {
  fuelUsedL: 0,
  validSamples: 1,
  lastRateLph: 10,
  lastTimestampMs: 1000,
});
const state = integrator.addSample(10, 3700);
assert.strictEqual(state.validSamples, 2);
assert.strictEqual(state.fuelUsedL, 0.0075);
assert.strictEqual(integrator.addSample(NaN, 4700).fuelUsedL, 0.0075);
integrator.reset();
assert.deepStrictEqual(integrator.addSample(0, 1000), {
  fuelUsedL: 0,
  validSamples: 1,
  lastRateLph: 0,
  lastTimestampMs: 1000,
});
assertApprox(integrator.addSample(20, 2000).fuelUsedL, 0.002777777777777778, 1e-12);
assertApprox(integrator.addSample(-1, 3000).fuelUsedL, 0.002777777777777778, 1e-12);
integrator.reset();
assert.strictEqual(integrator.getState().fuelUsedL, 0);

console.log('PASS combustível OBD: integração L/h, intervalos e dados inválidos');


const fsSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'obd', 'fuelConsumption.ts'), 'utf8');
if (!fsSource.includes('ESTIMATED_MAF') || !fsSource.includes('ESTIMATED_MAP')) {
  throw new Error('fuel fallback MAF/MAP não está implementado');
}
console.log('fuelConsumption fallback: OK');


const { resolveFuelModel } = loadTs('src/obd/fuelConsumption.ts');

const gasolineModel = resolveFuelModel({ manualFuelType: 'GASOLINA' });
assert.strictEqual(gasolineModel.source, 'ESTIMATED_BRAZIL_GASOLINE_E32');
assert.strictEqual(gasolineModel.ethanolPercent, 32);
assertApprox(gasolineModel.airFuelRatio, 12.14271176277265, 1e-9);
assertApprox(gasolineModel.fuelDensityKgPerL, 0.76408, 1e-9);

const ethanolModel = resolveFuelModel({ manualFuelType: 'ETANOL' });
assert.strictEqual(ethanolModel.source, 'ESTIMATED_MANUAL_ETHANOL');
assert.strictEqual(ethanolModel.ethanolPercent, 100);
assertApprox(ethanolModel.airFuelRatio, 9, 1e-12);
assertApprox(ethanolModel.fuelDensityKgPerL, 0.794, 1e-12);

const mixtureModel = resolveFuelModel({ manualAlcoholPercent: 50 });
assert.strictEqual(mixtureModel.source, 'ESTIMATED_MANUAL_PERCENT');
assert.strictEqual(mixtureModel.ethanolPercent, 50);
assertApprox(mixtureModel.airFuelRatio, 11.088558121356218, 1e-9);
assertApprox(mixtureModel.fuelDensityKgPerL, 0.772, 1e-9);

const ecuPriorityModel = resolveFuelModel({ alcoholPercentFromObd: 100, manualFuelType: 'GASOLINA', manualAlcoholPercent: 32 });
assert.strictEqual(ecuPriorityModel.source, 'REAL_OBD_0152');
assert.strictEqual(ecuPriorityModel.ethanolPercent, 100);

console.log('PASS combustível estimado: gasolina E32, etanol, mistura e prioridade do PID 0152');
