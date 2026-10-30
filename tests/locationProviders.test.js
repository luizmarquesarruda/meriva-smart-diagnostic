'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/network/locationProviders.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, sourcePath);

const { normalizeLocationProviderSnapshot, getLocationProviderPresentation } = loaded.exports;

const ready = normalizeLocationProviderSnapshot({
  locationServicesEnabled: true,
  gpsAvailable: true,
  networkAvailable: true,
});
assert.deepEqual(ready, {
  locationServicesEnabled: true,
  gpsAvailable: true,
  networkAvailable: true,
});
const readyPresentation = getLocationProviderPresentation(ready);
assert.equal(readyPresentation.servicesLabel, 'ATIVADOS');
assert.equal(readyPresentation.gpsLabel, 'DISPONÍVEL');
assert.equal(readyPresentation.networkLabel, 'DISPONÍVEL');
assert.match(readyPresentation.explanation, /não prova qual provedor/i);

const gpsOnly = getLocationProviderPresentation(normalizeLocationProviderSnapshot({
  locationServicesEnabled: true,
  gpsAvailable: true,
  networkAvailable: false,
}));
assert.equal(gpsOnly.gpsLabel, 'DISPONÍVEL');
assert.equal(gpsOnly.networkLabel, 'INDISPONÍVEL');
assert.match(gpsOnly.explanation, /apenas posições que passam pelos filtros/i);

const disabled = getLocationProviderPresentation(normalizeLocationProviderSnapshot({
  locationServicesEnabled: false,
  gpsAvailable: false,
  networkAvailable: false,
}));
assert.equal(disabled.servicesLabel, 'DESATIVADOS');
assert.match(disabled.explanation, /rede móvel sozinha não substitui/i);

const unknown = normalizeLocationProviderSnapshot({
  locationServicesEnabled: 'yes',
  gpsAvailable: undefined,
  networkAvailable: 1,
});
assert.deepEqual(unknown, {
  locationServicesEnabled: null,
  gpsAvailable: null,
  networkAvailable: null,
});
const unknownPresentation = getLocationProviderPresentation(unknown);
assert.equal(unknownPresentation.servicesLabel, 'NÃO INFORMADO');
assert.equal(unknownPresentation.gpsLabel, 'NÃO INFORMADO');
assert.equal(unknownPresentation.networkLabel, 'NÃO INFORMADO');
assert.match(unknownPresentation.explanation, /não use a conexão 4G\/5G como coordenada/i);

console.log('locationProviders.test.js: PASS');
