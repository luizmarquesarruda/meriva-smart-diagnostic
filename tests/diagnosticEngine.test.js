'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const DIAGNOSTIC_RULES_PATH = path.join(ROOT, 'src/knowledge/diagnostic_rules.json');

function loadTs(tsPath) {
  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;

  const mod = {
    exports: {},
    filename: tsPath,
    paths: require('module')._nodeModulePaths(path.dirname(tsPath)),
  };

  const localRequire = (request) => {
    if (request.endsWith('diagnostic_rules.json')) {
      return require(DIAGNOSTIC_RULES_PATH);
    }
    return require(require.resolve(request, { paths: [path.dirname(tsPath)] }));
  };

  const compiledModule = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  compiledModule(mod.exports, localRequire, mod, tsPath, path.dirname(tsPath));
  return mod.exports;
}

function obs(pid, value, source = 'REAL_OBD', timestamp = new Date().toISOString()) {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp, confidence: 'HIGH' };
}

function main() {
  assert.ok(fs.existsSync(DIAGNOSTIC_RULES_PATH), 'diagnostic_rules.json deve existir');
  const rules = require(DIAGNOSTIC_RULES_PATH);
  assert.ok(Array.isArray(rules.rules), 'diagnostic_rules.json deve conter rules');

  const engine = loadTs(path.join(ROOT, 'src/diagnostics/diagnosticEngine.ts'));
  const base = { observations: [], dtcs: [], condition: 'IDLE_WARM' };

  let result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0301', status: 'CONFIRMED', firstSeen: '', lastSeen: new Date().toISOString(), occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses[0].id, 'FALHA_DE_COMBUSTAO_CILINDRO_1');
  assert.strictEqual(result.hypotheses[0].confidence, 'MEDIUM');

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('0106', 10), obs('0107', 4)],
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

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('010B', 80, 'CARSCANNER_BASELINE')],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'baseline CarScanner não pode virar diagnóstico de ECU atual');



  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0420', status: 'HISTORICAL', firstSeen: '', lastSeen: new Date().toISOString(), occurrences: 1, source: 'REAL_OBD', historical: true, confirmed: false }],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'DTC histórico não pode gerar falha atual');
  assert.strictEqual(result.blockedNonLiveDtcs, 1);

  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0135', status: 'CONFIRMED', firstSeen: '', lastSeen: new Date().toISOString(), occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses[0].id, 'FALHA_CIRCUITO_AQUECEDOR_O2_B1S1');
  assert.ok(result.hypotheses[0].nextTests.some((item) => item.includes('0114')), 'IA usa sensor_tests.json para recomendar avaliação O2 no P0135');

  result = engine.runLocalDiagnostic({
    ...base,
    condition: 'ACCELERATION',
    observations: [obs('0106', 20), obs('0107', 0)],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'fuel trim isolado em aceleração não deve ser classificado pela regra de marcha lenta/cruzeiro');

  result = engine.runLocalDiagnostic({ ...base, observations: [obs('010B', 80, 'simulacao'), obs('0106', 20, 'REAL_OBD'), obs('0107', 0, 'REAL_OBD')] });
  assert.strictEqual(result.hypotheses.length, 1);
  assert.strictEqual(result.hypotheses[0].id, 'MISTURA_POBRE');
  assert.strictEqual(result.blockedSimulationSamples, 1);

  assert.strictEqual(engine.normalizeDiagnosticSource('REAL', 'RESPONDEU'), 'REAL_OBD');
  assert.strictEqual(engine.normalizeDiagnosticSource('REAL', 'NÃO RESPONDEU'), 'IMPORTADO');
  assert.strictEqual(engine.normalizeDiagnosticSource('SIMULACAO', 'RESPONDEU'), 'SIMULACAO');
  assert.strictEqual(engine.normalizeDiagnosticSource('CARSCANNER_BASELINE', 'RESPONDEU'), 'CARSCANNER_BASELINE');
  assert.strictEqual(engine.normalizeDiagnosticSource('origem-desconhecida', 'RESPONDEU'), 'IMPORTADO');

  const staleAt = new Date(Date.now() - engine.MAX_DIAGNOSTIC_EVIDENCE_AGE_MS - 1000).toISOString();
  result = engine.runLocalDiagnostic({ ...base, observations: [obs('010B', 50, 'REAL_OBD', staleAt)] });
  assert.strictEqual(result.hypotheses.length, 0, 'leitura antiga não pode gerar hipótese atual');
  assert.strictEqual(result.blockedStaleObservations, 1);

  result = engine.runLocalDiagnostic({ ...base, observations: [obs('010B', 50, 'IMPORTADO')] });
  assert.strictEqual(result.hypotheses.length, 0, 'dados importados nunca podem ser tratados como leitura live');
  assert.strictEqual(result.blockedNonLiveSamples, 1);

  result = engine.runLocalDiagnostic({
    ...base,
    ecuConnected: false,
    observations: [obs('010B', 50)],
    dtcs: [{ code: 'P0135', status: 'CURRENT', firstSeen: new Date().toISOString(), lastSeen: new Date().toISOString(), occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'ECU desconectada não pode produzir diagnóstico atual com evidência salva');
  assert.strictEqual(result.disconnectedEvidenceIgnored, true);

  const staleDtcAt = new Date(Date.now() - engine.MAX_DIAGNOSTIC_EVIDENCE_AGE_MS - 1000).toISOString();
  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0135', status: 'CURRENT', firstSeen: staleDtcAt, lastSeen: staleDtcAt, occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'DTC sem atualização recente não pode ser apresentado como atual');
  assert.strictEqual(result.blockedStaleDtcs, 1);

  console.log('Diagnostic engine: OK');
}

main();
