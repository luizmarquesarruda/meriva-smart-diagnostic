'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const sourcePath = path.resolve(__dirname, '../src/network/networkStatus.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, sourcePath);
const { normalizeNetworkSnapshot, getNetworkPresentation } = loaded.exports;

const view5g = getNetworkPresentation(normalizeNetworkSnapshot({
  type: 'cellular', isConnected: true, isInternetReachable: true,
  details: { cellularGeneration: '5g', isConnectionExpensive: true },
}));
assert.equal(view5g.shortLabel, '5G');
assert.equal(view5g.internetLabel, 'INTERNET DISPONÍVEL');
assert.equal(view5g.generationLabel, '5G');
assert.match(view5g.meteredLabel, /tarifada/i);
assert.equal(view5g.icon, 'connectivity');

const view4g = getNetworkPresentation(normalizeNetworkSnapshot({
  type: 'cellular', isConnected: true, isInternetReachable: false,
  details: { cellularGeneration: '4g', isConnectionExpensive: false },
}));
assert.equal(view4g.shortLabel, '4G');
assert.equal(view4g.internetLabel, 'SEM INTERNET');
assert.equal(view4g.tone, 'warning');

const wifi = getNetworkPresentation(normalizeNetworkSnapshot({
  type: 'wifi', isConnected: true, isInternetReachable: true,
  details: { strength: 78, isConnectionExpensive: false },
}));
assert.equal(wifi.shortLabel, 'WI-FI');
assert.equal(wifi.signalLabel, '78% (sinal Wi-Fi informado pelo sistema)');

const invalidSignal = normalizeNetworkSnapshot({
  type: 'wifi', isConnected: true, isInternetReachable: true,
  details: { strength: 150 },
});
assert.equal(invalidSignal.strength, null, 'sinal fora de 0–100 não pode ser apresentado como real');
const negativeSignal = normalizeNetworkSnapshot({
  type: 'wifi', isConnected: true, isInternetReachable: true,
  details: { strength: -1 },
});
assert.equal(negativeSignal.strength, null, 'sinal negativo deve ser tratado como desconhecido');
assert.equal(wifi.generationLabel, 'Fora da rede móvel');

const offline = getNetworkPresentation(normalizeNetworkSnapshot({
  type: 'none', isConnected: false, isInternetReachable: false, details: null,
}));
assert.equal(offline.shortLabel, 'OFF');
assert.equal(offline.internetLabel, 'SEM CONEXÃO');
assert.equal(offline.icon, 'offline');
assert.match(offline.detail, /funções locais.*disponíveis/i);

const unknown = getNetworkPresentation(normalizeNetworkSnapshot({ type: 'unknown' }));
assert.equal(unknown.internetLabel, 'INTERNET NÃO CONFIRMADA');
assert.notEqual(unknown.tone, 'success');
console.log('connectivity.test.js: PASS');
