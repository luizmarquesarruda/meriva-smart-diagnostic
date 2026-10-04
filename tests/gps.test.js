'use strict';

const assert = require('assert');
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/gps/gpsTracker.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

let watcher = null;
const fakeLocation = {
  Accuracy: { BestForNavigation: 6 },
  PermissionStatus: { GRANTED: 'granted' },
  hasServicesEnabledAsync: async () => true,
  getForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  requestForegroundPermissionsAsync: async () => ({ status: 'granted' }),
  watchPositionAsync: async (_options, callback) => {
    watcher = callback;
    return {
      remove() {
        watcher = null;
      },
    };
  },
};

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-location') return fakeLocation;
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const {
  GpsTracker,
  haversineDistanceKm,
  normalizeGpsSpeedKmh,
  calculateConsumptionKml,
} = mod.exports;

assert.strictEqual(normalizeGpsSpeedKmh(10), 36);
assert.strictEqual(normalizeGpsSpeedKmh(null), 0);
assert.ok(
  Math.abs(
    haversineDistanceKm(
      { latitude: 0, longitude: 0 },
      { latitude: 0, longitude: 1 },
    ) - 111.195,
  ) < 0.2,
);
assert.strictEqual(calculateConsumptionKml(100, 8), 12.5);
assert.strictEqual(calculateConsumptionKml(0, 8), null);
assert.strictEqual(calculateConsumptionKml(100, 0), null);

(async () => {
  const tracker = new GpsTracker();
  const receivedStates = [];
  const unsubscribe = tracker.subscribe((state) => receivedStates.push(state));

  assert.strictEqual(await tracker.start(), true);
  assert.strictEqual(tracker.getState().running, true);
  assert.strictEqual(tracker.getState().permissionGranted, true);

  watcher({
    coords: {
      latitude: 0,
      longitude: 0,
      speed: 10,
      accuracy: 5,
    },
    timestamp: 1000,
  });
  watcher({
    coords: {
      latitude: 0,
      longitude: 0.0001,
      speed: 10,
      accuracy: 5,
    },
    timestamp: 2000,
  });

  const state = tracker.getState();
  assert.strictEqual(state.currentSpeedKmh, 36);
  assert.ok(state.distanceKm > 0.01 && state.distanceKm < 0.012);
  assert.ok(state.maxSpeedKmh >= 36);
  assert.ok(receivedStates.length >= 3);

  const distanceBeforeStop = state.distanceKm;
  watcher({
    coords: {
      latitude: 0,
      longitude: 0.0002,
      speed: 0,
      accuracy: 5,
    },
    timestamp: 3000,
  });
  assert.strictEqual(tracker.getState().currentSpeedKmh, 0);
  assert.strictEqual(tracker.getState().distanceKm, distanceBeforeStop);

  watcher({
    coords: {
      latitude: 0,
      longitude: 0.0005,
      speed: 10,
      accuracy: 5,
    },
    timestamp: 10_000,
  });
  assert.strictEqual(tracker.getState().distanceKm, distanceBeforeStop);

  await tracker.stop();
  assert.strictEqual(tracker.getState().running, false);
  unsubscribe();
  console.log('PASS GPS: automático, velocidade, distância e consumo');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
