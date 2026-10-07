'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadTs(tsPath) {
  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true, resolveJsonModule: true },
  }).outputText;
  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  const original = Module._load;
  Module._load = function (request, parent, isMain) {
    if (request.endsWith('diagnostic_rules.json')) {
      return require(path.join(ROOT, 'src/knowledge/diagnostic_rules.json'));
    }
    return original.apply(this, arguments);
  };
  try {
    mod._compile(output, tsPath);
  } finally {
    Module._load = original;
  }
  return mod.exports;
}

function obs(pid, value, source = 'REAL_OBD') {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp: new Date().toISOString(), confidence: 'HIGH' };
}

function main() {
  const engine = loadTs(path.join(ROOT, 'src/diagnostics/diagnosticEngine.ts'));
  const base = { observations: [], dtcs: [], condition: 'IDLE_WARM' };

  let result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0301', status: 'CONFIRMED', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses[0].id, 'FALHA_DE_COMBUSTAO_CILINDRO_1');
  assert.strictEqual(result.hypotheses[0].confidence, 'MEDIUM');

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('0106', 10), obs('0107', 8)],
  });
  assert.strictEqual(result.hypotheses.length, 0);

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('0106', 12), obs('0107', 5)],
  });
  assert.strictEqual(result.hypotheses[0].id, 'MISTURA_POBRE');

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('0106', -20), obs('0107', -5)],
  });
  assert.strictEqual(result.hypotheses[0].id, 'MISTURA_RICA');

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('010B', 50)],
  });
  assert.strictEqual(result.hypotheses[0].id, 'VACUO_DO_MOTOR_POSSIVELMENTE_ANORMAL');

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('010B', 80, 'SIMULACAO')],
  });
  assert.strictEqual(result.hypotheses.length, 0);
  assert.strictEqual(result.blockedSimulationSamples, 1);

  console.log('Diagnostic engine: OK');
}

main();
