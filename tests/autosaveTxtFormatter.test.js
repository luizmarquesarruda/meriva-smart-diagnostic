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
  if (request === '../trip/tripRecorder') return { MAX_VALID_TRIP_CONSUMPTION_KML: 30 };
  if (request === '../knowledge/autosave_policy.json') {
    return { default: require(path.resolve(__dirname, '..', 'src', 'knowledge', 'autosave_policy.json')) };
  }
  if (request === '../knowledge/diagnostic_policy.json') {
    return { default: require(path.resolve(__dirname, '..', 'src', 'knowledge', 'diagnostic_policy.json')) };
  }
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
const implausibleTrip = {
  ...realTrips[0],
  id: 'implausible_legacy_trip',
  avgFuelConsumptionKml: 122.819,
  fuelDataValid: true,
};
const gapTrip = {
  ...realTrips[0],
  id: 'gap_trip',
  distanceTotalKm: 25,
  fuelUsedL: 0.12,
  avgFuelConsumptionKml: 20,
  fuelDataValid: false,
  fuelCoverageComplete: false,
};
const seedTrip = { ...realTrips[0], id: 'seed_trip', distanceTotalKm: 999, source: 'CARSCANNER_SEED' };
const state = {
  vehicle: null,
  obd: { connected: false },
  lastReadings: [],
  dtcs: [],
  driveCycles: [...realTrips.slice(0, 4), implausibleTrip, ...realTrips.slice(4), gapTrip, seedTrip],
  learning: null,
  settings: {},
  metadata: { savedAt: '2026-10-11T10:00:00.000Z', appVersion: '1.0.1' },
};
const options = { appVersion: '1.0.1', exportedAt: '2026-10-11T12:00:00.000Z' };

const compact = formatAutoSaveTxt(state, { ...options, historyLimit: 10 });
const compactHistory = compact.split('[HISTORY]')[1].split('[LEARNING]')[0];
const compactRows = compactHistory.split(/\r?\n/).filter((line) => line.includes('fonte=REAL_OBD') && /km \|/.test(line));
assert.strictEqual(compactRows.length, 10, 'autosave TXT should include only the newest ten real trips');
assert.ok(compactHistory.includes('25 km | N/D (cobertura insuficiente) | N/D | fonte=REAL_OBD'), 'compact TXT should label missing fuel coverage instead of showing a partial fuel total');
assert.ok(!compactHistory.includes('10 km |'), 'compact TXT should omit older trip rows');
assert.ok(!compactHistory.includes('999 km'), 'compact TXT must not include Car Scanner seed trips');

const full = formatAutoSaveTxt(state, options);
const fullHistory = full.split('[HISTORY]')[1].split('[LEARNING]')[0];
const fullRows = fullHistory.split(/\r?\n/).filter((line) => line.includes('fonte=REAL_OBD') && /km \|/.test(line));
assert.strictEqual(fullRows.length, 17, 'full export should preserve all real trips, including rows with invalid fuel coverage');
assert.ok(
  fullHistory.includes('10 km | 1 L | N/D | fonte=REAL_OBD'),
  'legacy consumption above 30 km/L must display N/D without discarding its trip row',
);
assert.ok(!fullHistory.includes('122.819 km/L'), 'implausible legacy consumption must not appear as valid');
assert.ok(fullHistory.includes('25 km | N/D (cobertura insuficiente) | N/D | fonte=REAL_OBD'), 'full TXT must disclose a dropped fuel-integration interval');
assert.ok(!fullHistory.includes('999 km'), 'full export must continue excluding Car Scanner seed trips');

const verboseState = {
  ...state,
  lastReadings: Array.from({ length: 20 }, (_, index) => ({
    pid: '010C',
    name: 'RPM_' + index,
    value: 800 + index / 4,
    unit: 'rpm',
    status: 'RESPONDEU',
    timestamp: '2026-10-11T10:00:00.000Z',
    source: 'REAL',
  })),
  learning: {
    learningStatus: 'LEARNING_ACTIVE',
    lastUpdated: '2026-10-11T10:00:00.000Z',
    globalSampleCounts: { realSamples: 55, seedSamples: 10 },
    contextualData: [{
      condition: 'MODO_TESTE_EXPANDIDO',
      sampleCount: 20,
      statistics: {
        '010C': { mean: 900.125, min: 800, max: 1000, confidence: 'HIGH' },
      },
    }],
  },
  settings: Object.fromEntries(Array.from({ length: 12 }, (_, index) => ['setting_' + index, index])),
};
const compactSnapshot = formatAutoSaveTxt(verboseState, { ...options, compact: true, historyLimit: 3 });
const compactSnapshotReadings = compactSnapshot
  .split('[LAST READINGS]')[1]
  .split('[DTC]')[0]
  .split(/\r?\n/)
  .filter((line) => /^010C RPM_/.test(line));
assert.strictEqual(compactSnapshotReadings.length, 10, 'compact snapshots must cap recent PID readings at ten');
assert.ok(!compactSnapshot.includes('MODO_TESTE_EXPANDIDO'), 'compact autosave must not duplicate contextual learning tables');
assert.ok(compactSnapshot.includes('Detalhes de estatísticas por contexto preservados no autosave JSON.'));
assert.ok(!compactSnapshot.includes('setting_8:'), 'compact snapshots must cap repeated settings');
assert.strictEqual(
  compactSnapshot.split('[HISTORY]')[1].split('[LEARNING]')[0].split(/\r?\n/).filter((line) => line.includes('fonte=REAL_OBD') && /km \|/.test(line)).length,
  3,
  'compact snapshots must include at most three trip rows',
);
for (const section of ['[VEHICLE]', '[OBD]', '[LAST READINGS]', '[DTC]', '[HISTORY]', '[LEARNING]', '[SETTINGS]']) {
  assert.ok(compactSnapshot.includes(section), 'compact snapshot missing section ' + section);
}

console.log('PASS autosave TXT formatter: compact snapshots without losing full export history');
