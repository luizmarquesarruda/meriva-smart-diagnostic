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

const fakeLocation = {};
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-location') return fakeLocation;
  if (request === 'expo-network') return { NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', ETHERNET: 'ETHERNET', NONE: 'NONE' }, getNetworkStateAsync: async () => ({ type: 'WIFI', isConnected: true, isInternetReachable: true }) };
  if (request === 'expo-file-system') return { documentDirectory: '/doc/' };
  if (request === '../database/appSettings') return { readAppSettings: async () => ({ networkMode: 'WIFI_AND_MOBILE' }) };
  if (request === '../network/networkPolicy') return { isOptionalNetworkAllowed: () => true };
  return originalLoad.apply(this, arguments);
};

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { parseCurrentWeather, resolveCityName, describeWeatherCode } = mod.exports;

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
assert.equal(resolveCityName({ city: 'Sorocaba', subregion: 'Região Metropolitana', district: 'Centro', region: 'São Paulo' }), 'Sorocaba');
assert.equal(resolveCityName({ city: null, subregion: 'Sorocaba', district: null, region: 'São Paulo' }), 'Sorocaba');
assert.equal(resolveCityName({ city: null, subregion: null, district: null, region: 'São Paulo' }), 'São Paulo');
assert.equal(resolveCityName(null), null);
assert.equal(describeWeatherCode(0), 'CÉU LIMPO');
assert.equal(describeWeatherCode(2), 'NUBLADO');
assert.equal(describeWeatherCode(61), 'GAROA / CHUVA');
assert.equal(describeWeatherCode(95), 'TEMPESTADE');

console.log('dashboardWeather: OK');
