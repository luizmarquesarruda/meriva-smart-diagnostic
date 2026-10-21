'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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

const { getDrivingModePresentation } = loadTs('src/ui/drivingMode.ts');
const samples = (value) => [value, value, value, value, value];

assert.equal(getDrivingModePresentation({ currentSamplesKml: samples(10), historicalAverageKml: 8, ecuConnected: false }).status, 'NO_DATA');
assert.equal(getDrivingModePresentation({ currentSamplesKml: [], historicalAverageKml: 8, ecuConnected: true }).status, 'NO_DATA');

const collecting = getDrivingModePresentation({ currentSamplesKml: [8, 9, 8, 9], historicalAverageKml: 8, ecuConnected: true });
assert.equal(collecting.status, 'COLLECTING');
assert.equal(collecting.detail, '4/5 LEITURAS VÁLIDAS');

const calibrating = getDrivingModePresentation({ currentSamplesKml: samples(10), historicalAverageKml: null, ecuConnected: true });
assert.equal(calibrating.status, 'CALIBRATING');
assert.equal(calibrating.averageKml, 10);

const economical = getDrivingModePresentation({ currentSamplesKml: samples(10), historicalAverageKml: 8, ecuConnected: true });
assert.equal(economical.status, 'ECONOMICAL');
assert.equal(economical.label, 'ECONÔMICO');
assert.equal(economical.tone, 'good');

assert.equal(getDrivingModePresentation({ currentSamplesKml: samples(8), historicalAverageKml: 8, ecuConnected: true }).status, 'NORMAL');

const high = getDrivingModePresentation({ currentSamplesKml: samples(6), historicalAverageKml: 8, ecuConnected: true });
assert.equal(high.status, 'HIGH_CONSUMPTION');
assert.equal(high.label, 'CONSUMO ALTO');

for (const invalid of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, 30.1]) {
  assert.equal(getDrivingModePresentation({ currentSamplesKml: [invalid, invalid, invalid, invalid, invalid], historicalAverageKml: 8, ecuConnected: true }).status, 'NO_DATA');
}
assert.equal(getDrivingModePresentation({ currentSamplesKml: samples(10), historicalAverageKml: 30.1, ecuConnected: true }).status, 'CALIBRATING');
console.log('Tendência de consumo e modo econômico: OK');
