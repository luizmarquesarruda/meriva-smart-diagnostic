'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/network/networkPolicy.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;

const network = { NetworkStateType: { WIFI: 'WIFI', CELLULAR: 'CELLULAR', ETHERNET: 'ETHERNET', NONE: 'NONE' } };
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-network') return network;
  return originalLoad.apply(this, arguments);
};
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

const { isOptionalNetworkAllowed, describeNetworkState } = mod.exports;
const wifi = { type: 'WIFI', isConnected: true, isInternetReachable: true };
const mobile = { type: 'CELLULAR', isConnected: true, isInternetReachable: true };
const noInternet = { type: 'WIFI', isConnected: true, isInternetReachable: false };
const disconnected = { type: 'NONE', isConnected: false, isInternetReachable: false };

assert.equal(isOptionalNetworkAllowed('WIFI_ONLY', wifi), true);
assert.equal(isOptionalNetworkAllowed('WIFI_ONLY', mobile), false);
assert.equal(isOptionalNetworkAllowed('WIFI_AND_MOBILE', wifi), true);
assert.equal(isOptionalNetworkAllowed('WIFI_AND_MOBILE', mobile), true);
assert.equal(isOptionalNetworkAllowed('WIFI_AND_MOBILE', noInternet), false);
assert.equal(isOptionalNetworkAllowed('WIFI_AND_MOBILE', disconnected), false);
assert.equal(isOptionalNetworkAllowed('OFFLINE', wifi), false);
assert.equal(isOptionalNetworkAllowed('OFFLINE', mobile), false);
assert.equal(isOptionalNetworkAllowed('WIFI_AND_MOBILE', null), false);
assert.equal(describeNetworkState(wifi), 'WI-FI');
assert.equal(describeNetworkState(mobile), 'DADOS MÓVEIS');
assert.equal(describeNetworkState(noInternet), 'REDE SEM INTERNET');
assert.equal(describeNetworkState(disconnected), 'SEM REDE');

const settingsUi = fs.readFileSync(path.resolve(__dirname, '../app/configuracoes.tsx'), 'utf8');
assert(settingsUi.includes("settings.networkMode === 'WIFI_ONLY'"));
assert(settingsUi.includes("settings.networkMode === 'WIFI_AND_MOBILE'"));
assert(settingsUi.includes("settings.networkMode === 'OFFLINE'"));
assert(settingsUi.includes('setInterval(() => { void refreshNetworkStatus(); }, 10_000)'), 'configurações devem acompanhar mudanças de rede automaticamente');
assert(settingsUi.includes("AppState.addEventListener('change'"), 'configurações devem atualizar ao retornar ao primeiro plano');

const homeSource = fs.readFileSync(path.resolve(__dirname, '../app/index.tsx'), 'utf8');
assert(homeSource.includes('Network.getNetworkStateAsync'), 'home deve mostrar o tipo de rede detectado');
assert(homeSource.includes('setInterval(() => { void refreshNetworkStatus(); }, 10_000)'), 'home deve atualizar o estado da rede periodicamente');
assert(homeSource.includes("settings?.networkMode === 'OFFLINE'"), 'home deve mostrar preferência offline');
assert(homeSource.includes("dashboardWeather.status === 'NETWORK_RESTRICTED'"), 'home deve distinguir bloqueio por preferência de falha de internet');

const settingsSource = fs.readFileSync(path.resolve(__dirname, '../src/database/appSettings.ts'), 'utf8');
const weatherSource = fs.readFileSync(path.resolve(__dirname, '../src/weather/dashboardWeather.ts'), 'utf8');
const bluetoothSource = fs.readFileSync(path.resolve(__dirname, '../src/obd/sharedConnection.ts'), 'utf8');
assert(settingsSource.includes("networkMode: 'WIFI_AND_MOBILE'"), 'modo padrão precisa permitir Wi-Fi e dados móveis');
assert(settingsSource.includes("parsed.networkMode === 'OFFLINE'"), 'migração deve aceitar o modo offline salvo');
assert(weatherSource.includes('isOptionalNetworkAllowed(settings.networkMode, networkState)'), 'clima deve respeitar o modo de rede');
assert(!bluetoothSource.includes('expo-network'), 'a conexão OBD não deve depender do módulo de rede');

console.log('networkPolicy.test.js: OK');
