'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const { loadTs } = require('./helpers/loadTs');

const { integrateFuelRateLph, FuelRateIntegrator } = mod.exports;

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
