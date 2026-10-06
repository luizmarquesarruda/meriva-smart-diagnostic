'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const ts = require('typescript');
const Module = require('module');

function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = new Module(file, null);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(output, file);
  return mod.exports;
}

const m = loadTs(path.join(__dirname, '..', 'src', 'obd', 'fuelIdentification.ts'));

const direct = m.identifyFuelFromObd(3, 100);
assert.strictEqual(direct.status, 'COMPOSICAO_ECU');
assert.strictEqual(direct.fuelTypeLabel, 'Etanol');
assert.strictEqual(direct.alcoholPercent, 100);
assert.strictEqual(direct.confidence, 'DIRETA');

const typeOnly = m.identifyFuelFromObd(3, null);
assert.strictEqual(typeOnly.status, 'TIPO_VEICULO');
assert.strictEqual(typeOnly.alcoholPercent, null);

const invalid = m.identifyFuelFromObd(3, 101);
assert.strictEqual(invalid.status, 'DADO_INCOERENTE');
assert.strictEqual(invalid.alcoholPercent, null);

const unknown = m.identifyFuelFromObd(99, null);
assert.strictEqual(unknown.status, 'TIPO_VEICULO');
assert.strictEqual(unknown.fuelTypeLabel, 'Código não mapeado');

const none = m.identifyFuelFromObd(null, null);
assert.strictEqual(none.status, 'SEM_DADOS');

console.log('fuel identification: ALL PASS');
