'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const file = path.resolve(__dirname, '../src/diagnostics/diagnosticResponse.ts');
const source = fs.readFileSync(file, 'utf8');
const js = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const mod = { exports: {} };
const localRequire = (request) => {
  if (request.endsWith('diagnostic_responses.json')) return require('../src/knowledge/diagnostic_responses.json');
  return require(request);
};
new Function('exports', 'require', 'module', js)(mod.exports, localRequire, mod);
const compose = mod.exports.composeDiagnosticResponse;

const response = compose({
  id: 'FALHA_CIRCUITO_AQUECEDOR_O2_B1S1',
  label: 'FALHA_CIRCUITO_AQUECEDOR_O2_B1S1',
  score: 0.5,
  confidence: 'MEDIUM',
  evidence: [{ ruleId: 'DTC_P0135_O2_HEATER', text: 'DTC P0135 presente com status CURRENT; fonte REAL_OBD.', source: 'DTC', dtc: 'P0135' }],
  nextTests: ['verificar alimentação do aquecedor'],
});
assert.match(response.title, /aquecedor do sensor O2/i);
assert.match(response.summary, /não prova/i);
assert.match(response.confidenceLabel, /moderada/i);
assert.match(response.nextAction, /alimentação/i);
assert.match(response.caution, /REAL_OBD/);
assert.match(response.caution, /não confirma uma peça/i);

const unknown = compose({ id: 'OUTRA_HIPOTESE', label: 'OUTRA HIPOTESE', score: 0.2, confidence: 'LOW', evidence: [], nextTests: [] });
assert.strictEqual(unknown.title, 'OUTRA HIPOTESE');
assert.match(unknown.summary, /evidências locais/i);
assert.match(unknown.nextAction, /leituras válidas/i);
assert.match(unknown.caution, /não contém evidência rastreável/i);
console.log('Diagnostic response composer: OK');
