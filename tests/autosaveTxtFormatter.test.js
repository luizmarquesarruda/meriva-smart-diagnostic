'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '..', 'src', 'meriva', 'autosaveTxtFormatter.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;

const originalLoad = Module._load;
Module._load = function (request) {
  if (request === './autosaveTypes') return { AUTOSAVE_SCHEMA_VERSION: 1 };
  if (request === '../obd/dtcDefinition') return { getDtcDefinition: () => undefined };
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { formatAutoSaveTxt } = mod.exports;
const realTrips = Array.from({ length: 15 }, (_, index) => ({
  id: `real_${index}`,
  startedAt: `2026-10-11T10:${String(index).padStart(2, '0')}:00.000Z`,
  finishedAt: `2026-10-11T10:${String(index).padStart(2, '0')}:30.000Z`,
  distanceTotalKm: 10 + index,
  distanceIceKm: 10 + index,
  fuelUsedL: 1,
  totalTimeHms: '00:00:30',
  drivingTimeHms: '00:00:30',
  standingTimeHms: '00:00:00',
  avgDrivingSpeedKmh: 20,
  avgFuelConsumptionKml: 10 + index,
  source: 'REAL_OBD',
  importedAt: '2026-10-11T10:00:00.000Z',
}));
const seedTrip = { ...realTrips[0], id: 'seed_trip', distanceTotalKm: 999, source: 'CARSCANNER_SEED' };
const state = {
  vehicle: null,
  obd: { connected: false },
  lastReadings: [],
  dtcs: [],
  driveCycles: [...realTrips, seedTrip],
  learning: null,
  settings: {},
  metadata: { savedAt: '2026-10-11T10:00:00.000Z', appVersion: '1.0.1' },
};
const options = { appVersion: '1.0.1', exportedAt: '2026-10-11T12:00:00.000Z' };

const compact = formatAutoSaveTxt(state, { ...options, historyLimit: 10 });
const compactHistory = compact.split('[HISTORY]')[1].split('[LEARNING]')[0];
const compactRows = compactHistory.split(/\r?\n/).filter((line) => line.includes('fonte=REAL_OBD') && /km \|/.test(line));
assert.strictEqual(compactRows.length, 10, 'autosave TXT should include only the newest ten real trips');
assert.ok(compactHistory.includes('24 km |'), 'compact TXT should preserve the newest trip');
assert.ok(!compactHistory.includes('10 km |'), 'compact TXT should omit older trip rows');
assert.ok(!compactHistory.includes('999 km'), 'compact TXT must not include Car Scanner seed trips');

const full = formatAutoSaveTxt(state, options);
const fullHistory = full.split('[HISTORY]')[1].split('[LEARNING]')[0];
const fullRows = fullHistory.split(/\r?\n/).filter((line) => line.includes('fonte=REAL_OBD') && /km \|/.test(line));
assert.strictEqual(fullRows.length, 15, 'full export should preserve the complete real-trip history');
assert.ok(!fullHistory.includes('999 km'), 'full export must continue excluding Car Scanner seed trips');

console.log('PASS autosave TXT formatter: compact snapshots without losing full export history');
