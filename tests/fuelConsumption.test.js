'use strict';

const assert = require('assert');
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'fuelConsumption.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
}).outputText;

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const { integrateFuelRateLph, FuelRateIntegrator } = mod.exports;

assert.strictEqual(integrateFuelRateLph(null, { fuelRateLph: 12, timestampMs: 1000 }), 0);
assert.strictEqual(
  integrateFuelRateLph(
    { fuelRateLph: 12, timestampMs: 1000 },
    { fuelRateLph: 12, timestampMs: 3700 },
  ),
  0.009,
);
assert.strictEqual(
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
assert.strictEqual(
  integrateFuelRateLph(
    { fuelRateLph: 0, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 2000 },
  ),
  0,
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
assert.strictEqual(integrator.getState().fuelUsedL, 0);

console.log('PASS combustível OBD: integração L/h, intervalos e dados inválidos');
