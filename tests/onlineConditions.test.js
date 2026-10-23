'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const sourcePath = path.resolve(__dirname, '../src/weather/currentConditions.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

let permissionStatus = 'denied';
let locationReads = 0;
let geocodeResult = [{ city: 'Sorocaba' }];
const fakeLocation = {
  PermissionStatus: { GRANTED: 'granted' },
  Accuracy: { Low: 2 },
  getForegroundPermissionsAsync: async () => ({ status: permissionStatus }),
  getCurrentPositionAsync: async () => {
    locationReads += 1;
    return { coords: { latitude: -23.5, longitude: -47.45 } };
  },
  reverseGeocodeAsync: async () => geocodeResult,
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

(async () => {
  const { describeWeatherCode, loadCurrentConditions } = mod.exports;
  assert.strictEqual(describeWeatherCode(0), 'CÉU LIMPO');
  assert.strictEqual(describeWeatherCode(61), 'CHUVA');
  assert.strictEqual(describeWeatherCode(95), 'TEMPESTADE');
  assert.strictEqual(describeWeatherCode(null), 'TEMPO INDISPONÍVEL');

  permissionStatus = 'denied';
  const denied = await loadCurrentConditions();
  assert.strictEqual(denied.available, false);
  assert.strictEqual(locationReads, 0, 'must not read GPS without existing permission');

  permissionStatus = 'granted';
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error('offline'); };
  const offline = await loadCurrentConditions();
  global.fetch = originalFetch;
  assert.strictEqual(offline.available, false);
  assert.strictEqual(offline.temperatureC, null);
  assert.strictEqual(offline.city, 'Sorocaba');
  assert.ok(offline.description.includes('DIAGNÓSTICO OFFLINE'));

  geocodeResult = [{ city: null, district: 'Júlio de Mesquita Filho', subregion: 'Sorocaba', region: 'São Paulo' }];
  const onlineFetch = async () => ({
    ok: true,
    json: async () => ({ current: { temperature_2m: 27.4, weather_code: 1 } }),
  });
  global.fetch = onlineFetch;
  const online = await loadCurrentConditions();
  global.fetch = originalFetch;
  assert.strictEqual(online.available, true);
  assert.strictEqual(online.city, 'Sorocaba', 'município deve ter prioridade sobre o bairro');
  assert.ok(online.locationLabels.includes('CIDADE: Sorocaba'));
  assert.ok(online.locationLabels.includes('BAIRRO: Júlio de Mesquita Filho'), 'cidade e bairro devem ficar disponíveis para alternância da UI');
  assert.strictEqual(online.temperatureC, 27.4);
  assert.strictEqual(online.description, 'PARCIALMENTE NUBLADO');

  geocodeResult = [{ city: null, district: 'Júlio de Mesquita Filho', subregion: null, region: 'São Paulo' }];
  global.fetch = onlineFetch;
  const districtOnly = await loadCurrentConditions();
  global.fetch = originalFetch;
  assert.strictEqual(districtOnly.city, null, 'bairro/estado não devem ser apresentados como cidade');
  assert.ok(districtOnly.locationLabels.includes('BAIRRO: Júlio de Mesquita Filho'), 'bairro pode aparecer explicitamente quando a cidade não está disponível');

  console.log('onlineConditions.test.js: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
