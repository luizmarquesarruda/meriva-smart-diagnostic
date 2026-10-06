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
  assert.strictEqual(tracker.getState().signalQuality, 'SEM_FIX');
  assert.strictEqual(tracker.getState().speedSource, 'PARADO');

  watcher({
    coords: { latitude: 0, longitude: 0, speed: 10, accuracy: 5 },
    timestamp: 1000,
  });
  watcher({
    coords: { latitude: 0, longitude: 0.0001, speed: 10, accuracy: 5 },
    timestamp: 2000,
  });
  watcher({
    coords: { latitude: 0, longitude: 0.0002, speed: 10, accuracy: 5 },
    timestamp: 3000,
  });
  watcher({
    coords: { latitude: 0, longitude: 0.0003, speed: 10, accuracy: 5 },
    timestamp: 4000,
  });

  const state = tracker.getState();
  assert.ok(state.currentSpeedKmh >= 36 && state.currentSpeedKmh <= 40);
  assert.ok(state.distanceKm > 0.03 && state.distanceKm < 0.04);
  assert.ok(state.maxSpeedKmh >= 36);
  assert.strictEqual(state.signalQuality, 'EXCELENTE');
  assert.strictEqual(state.speedSource, 'GPS');
  assert.ok(receivedStates.length >= 3);

  const distanceBeforeStop = state.distanceKm;
  watcher({
    coords: { latitude: 0, longitude: 0.0002, speed: 0, accuracy: 5 },
    timestamp: 5000,
  });
  assert.strictEqual(tracker.getState().currentSpeedKmh, 0);
  assert.strictEqual(tracker.getState().speedSource, 'PARADO');
  assert.strictEqual(tracker.getState().distanceKm, distanceBeforeStop);

  // Quando a ECU confirma velocidade, a origem exibida passa a ser OBD.
  tracker.setVehicleSpeedHintKmh(36);
  watcher({ coords: { latitude: 0, longitude: 0.0010, speed: 10, accuracy: 5 }, timestamp: 14000 });
  watcher({ coords: { latitude: 0, longitude: 0.0012, speed: 10, accuracy: 5 }, timestamp: 15000 });
  watcher({ coords: { latitude: 0, longitude: 0.0014, speed: 10, accuracy: 5 }, timestamp: 16000 });
  watcher({ coords: { latitude: 0, longitude: 0.0016, speed: 10, accuracy: 5 }, timestamp: 17000 });
  assert.strictEqual(tracker.getState().speedSource, 'OBD');
  const distanceAfterObdMovement = tracker.getState().distanceKm;
  assert.ok(distanceAfterObdMovement > distanceBeforeStop);

  tracker.setVehicleSpeedHintKmh(0);
  watcher({ coords: { latitude: 0, longitude: 0.0016, speed: 10, accuracy: 5 }, timestamp: 18000 });
  assert.strictEqual(tracker.getState().currentSpeedKmh, 0);

  // Jitter parado de poucos metros não pode virar distância, mesmo com speed stale positivo.
  const distanceBeforeJitter = tracker.getState().distanceKm;
  watcher({ coords: { latitude: 0, longitude: 0.00161, speed: 10, accuracy: 5 }, timestamp: 19000 });
  watcher({ coords: { latitude: 0, longitude: 0.00162, speed: 10, accuracy: 5 }, timestamp: 20000 });
  assert.strictEqual(tracker.getState().distanceKm, distanceBeforeJitter);

  // Fixes com speed ausente também não podem transformar deriva do GPS em movimento.
  watcher({ coords: { latitude: 0, longitude: 0.00163, speed: null, accuracy: 5 }, timestamp: 21000 });
  watcher({ coords: { latitude: 0, longitude: 0.00164, speed: null, accuracy: 5 }, timestamp: 22000 });
  watcher({ coords: { latitude: 0, longitude: 0.00165, speed: null, accuracy: 5 }, timestamp: 23000 });
  assert.strictEqual(tracker.getState().distanceKm, distanceBeforeJitter);

  // Velocidade positiva stale não pode indicar movimento quando o deslocamento é pequeno.
  watcher({ coords: { latitude: 0, longitude: 0.00166, speed: 10, accuracy: 5 }, timestamp: 24000 });
  assert.strictEqual(tracker.getState().currentSpeedKmh, 0);

  watcher({ coords: { latitude: 0, longitude: 0.00175, speed: 10, accuracy: 5 }, timestamp: 29000 });
  assert.strictEqual(tracker.getState().distanceKm, distanceAfterObdMovement);

  await tracker.stop();
  assert.strictEqual(tracker.getState().running, false);
  unsubscribe();
  console.log('PASS GPS: automático, velocidade, distância e consumo');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
