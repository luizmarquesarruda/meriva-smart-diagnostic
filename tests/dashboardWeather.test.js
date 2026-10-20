'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/weather/dashboardWeather.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const cacheFiles = new Map();
let networkState = { type: 'WIFI', isConnected: true, isInternetReachable: true };
let networkMode = 'WIFI_AND_MOBILE';
let permissionStatus = 'granted';
const fakeLocation = {
  Accuracy: { Balanced: 3 },
  getForegroundPermissionsAsync: async () => ({ status: permissionStatus }),
  getLastKnownPositionAsync: async () => ({ coords: { latitude: -23.50123, longitude: -47.45234 } }),
  getCurrentPositionAsync: async () => ({ coords: { latitude: -23.50123, longitude: -47.45234 } }),
  reverseGeocodeAsync: async () => [{ city: 'Sorocaba', region: 'São Paulo' }],
};
const fakeFileSystem = {
  documentDirectory: '/doc/',
  EncodingType: { UTF8: 'utf8' },
  makeDirectoryAsync: async () => undefined,
  getInfoAsync: async (target) => ({ exists: cacheFiles.has(target), isDirectory: false }),
  readAsStringAsync: async (target) => {
    if (!cacheFiles.has(target)) throw new Error('cache ausente');
    return cacheFiles.get(target);
  },
  writeAsStringAsync: async (target, data) => { cacheFiles.set(target, data); },
};
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-location') return fakeLocation;
  if (request === 'expo-network') return {
    NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', ETHERNET: 'ETHERNET', NONE: 'NONE' },
    getNetworkStateAsync: async () => ({ ...networkState }),
  };
  if (request === 'expo-file-system') return fakeFileSystem;
  if (request === '../database/appSettings') return { readAppSettings: async () => ({ networkMode }) };
  if (request === '../network/networkPolicy') return {
    isOptionalNetworkAllowed: (mode, state) => mode !== 'OFFLINE' && state?.isConnected === true &&
      state?.isInternetReachable !== false && (mode !== 'WIFI_ONLY' || state.type === 'WIFI'),
  };
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { parseCurrentWeather, parseCachedWeather, resolveCityName, describeWeatherCode } = mod.exports;

assert.deepEqual(
  parseCurrentWeather({
    current: { temperature_2m: 24.4, apparent_temperature: 27.1, weather_code: 2 },
  }),
  { temperatureC: 24.4, apparentTemperatureC: 27.1, weatherCode: 2 },
);
assert.deepEqual(
  parseCurrentWeather({ current: { temperature_2m: 19, weather_code: 0 } }),
  { temperatureC: 19, apparentTemperatureC: null, weatherCode: 0 },
);
assert.equal(parseCurrentWeather(null), null);
assert.equal(parseCurrentWeather({ current: { temperature_2m: 'N/D' } }), null);
assert.equal(parseCurrentWeather({ current: { temperature_2m: 150 } }), null);
const cachedAt = '2026-10-20T08:00:00.000Z';
assert.deepEqual(
  parseCachedWeather({
    status: 'READY',
    city: 'Sorocaba',
    region: 'São Paulo',
    temperatureC: 24.4,
    apparentTemperatureC: 27.1,
    weatherCode: 2,
    updatedAt: cachedAt,
  }),
  {
    status: 'OFFLINE',
    city: 'Sorocaba',
    region: 'São Paulo',
    temperatureC: 24.4,
    apparentTemperatureC: 27.1,
    weatherCode: 2,
    updatedAt: cachedAt,
  },
);
assert.equal(parseCachedWeather({ temperatureC: 150, updatedAt: cachedAt }), null);
assert.equal(parseCachedWeather({ temperatureC: 24, updatedAt: 'data inválida' }), null);
assert.equal(parseCachedWeather(null), null);
assert.equal(resolveCityName({ city: 'Sorocaba', subregion: 'Região Metropolitana', district: 'Centro', region: 'São Paulo' }), 'Sorocaba');
assert.equal(resolveCityName({ city: null, subregion: 'Sorocaba', district: null, region: 'São Paulo' }), 'Sorocaba');
assert.equal(resolveCityName({ city: null, subregion: null, district: null, region: 'São Paulo' }), 'São Paulo');
assert.equal(resolveCityName(null), null);
assert.equal(describeWeatherCode(0), 'CÉU LIMPO');
assert.equal(describeWeatherCode(2), 'NUBLADO');
assert.equal(describeWeatherCode(61), 'GAROA / CHUVA');
assert.equal(describeWeatherCode(95), 'TEMPESTADE');

async function verifyPersistedCacheAndNetworkModes() {
  let requestedUrl = '';
  const online = await mod.exports.loadDashboardWeather(async (url) => {
    requestedUrl = String(url);
    return {
      ok: true,
      json: async () => ({ current: { temperature_2m: 24.4, apparent_temperature: 27.1, weather_code: 2 } }),
    };
  });
  assert.equal(online.status, 'READY');
  assert.equal(online.city, 'Sorocaba');
  assert.equal(online.temperatureC, 24.4);
  assert.match(requestedUrl, /latitude=-23\.5&longitude=-47\.45/, 'API deve receber coordenadas arredondadas');
  assert.equal(cacheFiles.size, 1, 'a leitura válida deve ser salva em cache local');

  networkMode = 'WIFI_ONLY';
  networkState = { type: 'CELLULAR', isConnected: true, isInternetReachable: true };
  const restricted = await mod.exports.loadDashboardWeather(async () => {
    throw new Error('não deve consultar a rede móvel em modo Wi-Fi');
  });
  assert.equal(restricted.status, 'NETWORK_RESTRICTED');
  assert.equal(restricted.temperatureC, 24.4, 'o cache deve continuar disponível quando a preferência bloqueia a rede');
  assert.equal(restricted.updatedAt, online.updatedAt, 'o cache deve preservar a data da leitura real');

  networkMode = 'WIFI_AND_MOBILE';
  networkState = { type: 'WIFI', isConnected: true, isInternetReachable: false };
  const offline = await mod.exports.loadDashboardWeather(async () => {
    throw new Error('não deve consultar API sem internet confirmada');
  });
  assert.equal(offline.status, 'OFFLINE');
  assert.equal(offline.temperatureC, 24.4, 'o cache persistente deve cobrir a perda de internet');
  assert.equal(offline.city, 'Sorocaba');
}

verifyPersistedCacheAndNetworkModes()
  .then(() => console.log('dashboardWeather: OK'))
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  });
