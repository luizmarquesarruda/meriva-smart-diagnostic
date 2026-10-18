'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const fs = require('fs');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/trip/tripChartData.ts');
const originalLoad = Module._load;
const validityPath = path.resolve(__dirname, '../src/trip/fuelValidity.ts');
const validityCompiled = ts.transpileModule(fs.readFileSync(validityPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const validityMod = new Module(validityPath, null);
validityMod.filename = validityPath;
validityMod.paths = Module._nodeModulePaths(path.dirname(validityPath));
validityMod._compile(validityCompiled, validityPath);
const source = fs.readFileSync(sourcePath, 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
Module._load = function(request) {
  if (request === './fuelValidity') return validityMod.exports;
  return originalLoad.apply(this, arguments);
};
mod._compile(compiled, sourcePath);
Module._load = originalLoad;
const { buildTripChartData } = mod.exports;

function trip(id, day, overrides = {}) {
  return {
    id,
    startedAt: `2026-10-${String(day).padStart(2, '0')}T10:00:00.000Z`,
    finishedAt: `2026-10-${String(day).padStart(2, '0')}T10:20:00.000Z`,
    distanceTotalKm: 10,
    distanceIceKm: 10,
    fuelUsedL: 1,
    totalTimeHms: '00:20:00',
    drivingTimeHms: '00:18:00',
    standingTimeHms: '00:02:00',
    avgDrivingSpeedKmh: 30,
    avgFuelConsumptionKml: 10,
    fuelDataValid: true,
    source: 'REAL_OBD',
    importedAt: `2026-10-${String(day).padStart(2, '0')}T10:20:00.000Z`,
    ...overrides,
  };
}

const real = [
  trip('day-1', 1),
  trip('unknown-fuel', 3, { fuelDataValid: undefined }),
  trip('bad-fuel', 4, { fuelDataValid: false, avgFuelConsumptionKml: 12 }),
  trip('absurd-consumption', 5, { avgFuelConsumptionKml: 75 }),
  trip('zero-fuel', 6, { fuelUsedL: 0, avgFuelConsumptionKml: 0 }),
  trip('upper-limit', 7, { avgFuelConsumptionKml: 30 }),
  trip('day-8', 8),
  trip('day-9', 9),
];
const seed = trip('seed', 10, { source: 'CARSCANNER_SEED', avgFuelConsumptionKml: 15 });
const simulation = trip('sim', 11, { source: 'SIMULACAO' });
const charts = buildTripChartData([...real, seed, simulation], 7);

assert.strictEqual(charts.distance.length, 7, 'distance chart is limited to seven latest real trips');
assert.strictEqual(charts.distance[0].label, '03/10', 'visible points are arranged chronologically after selecting recent trips');
assert.strictEqual(charts.distance[charts.distance.length - 1].label, '09/10');
assert.ok(charts.distance.every(item => Number.isFinite(item.value) && item.value >= 0));
assert.ok(!charts.consumption.some(item => item.value > 30), 'implausible consumption is not graphed');
assert.ok(charts.consumption.every(item => Number.isFinite(item.value) && item.value > 0 && item.value <= 30));
assert.ok(!charts.consumption.some(item => item.label === '03/10'), 'unknown fuel validity is omitted');
assert.ok(!charts.consumption.some(item => item.label === '04/10'), 'explicitly invalid fuel coverage is omitted');
assert.ok(!charts.consumption.some(item => item.label === '05/10'), 'implausible >30 km/L is omitted');
assert.ok(!charts.consumption.some(item => item.label === '06/10'), 'zero fuel is not treated as a valid measurement');
assert.ok(charts.consumption.some(item => item.label === '07/10' && item.value === 30), 'documented upper limit remains valid');
assert.deepStrictEqual(charts.consumption.map(item => item.label), ['07/10', '08/10', '09/10']);
const empty = buildTripChartData([seed, simulation]);
assert.deepStrictEqual(empty, { distance: [], consumption: [] }, 'seed and simulation data must not appear in charts');
assert.deepStrictEqual(buildTripChartData(real, 0).distance.length, 1, 'limit is clamped to a safe positive minimum');
console.log('Trip chart provenance and fuel-validity policy: OK');
