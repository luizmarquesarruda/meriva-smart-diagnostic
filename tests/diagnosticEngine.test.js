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
    if (request === '../obd/formulaEngine') {
      return loadTs(path.join(ROOT, 'src/obd/formulaEngine.ts'));
    }
    return require(require.resolve(request, { paths: [path.dirname(tsPath)] }));
  };

  const compiledModule = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
  compiledModule(mod.exports, localRequire, mod, tsPath, path.dirname(tsPath));
  return mod.exports;
}

function obs(pid, value, source = 'REAL_OBD') {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp: new Date().toISOString(), confidence: 'HIGH' };
}

function main() {
  assert.ok(fs.existsSync(DIAGNOSTIC_RULES_PATH), 'diagnostic_rules.json deve existir');
  const rules = require(DIAGNOSTIC_RULES_PATH);
  assert.ok(Array.isArray(rules.rules), 'diagnostic_rules.json deve conter rules');

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
  assert.strictEqual(result.blockedNonLiveSamples, 1, 'baseline deve ser contado como evidência não ao vivo bloqueada');



  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0420', status: 'HISTORICAL', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: true, confirmed: false }],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'DTC histórico não pode gerar falha atual');
  assert.strictEqual(result.blockedNonLiveDtcs, 1);

  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [{ code: 'P0135', status: 'CONFIRMED', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
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

  // A ausência de evidência corrente nunca equivale a um veículo saudável.
  const nowMs = Date.now();
  const staleMap = { ...obs('010B', 80), timestamp: new Date(nowMs - 120_000).toISOString() };
  result = engine.runLocalDiagnostic({ ...base, observations: [staleMap], nowMs });
  assert.equal(result.hypotheses.length, 0, 'MAP antigo não pode disparar hipótese atual');
  assert.equal(result.acceptedLiveSamples, 0);
  assert.equal(result.blockedStaleSamples, 1);

  const futureMap = { ...obs('010B', 80), timestamp: new Date(nowMs + 60_000).toISOString() };
  result = engine.runLocalDiagnostic({ ...base, observations: [futureMap], nowMs });
  assert.equal(result.hypotheses.length, 0, 'timestamp futuro deve ser bloqueado');
  assert.equal(result.blockedStaleSamples, 1);

  const invalidMap = { ...obs('010B', 300), timestamp: new Date(nowMs).toISOString() };
  result = engine.runLocalDiagnostic({ ...base, observations: [invalidMap], nowMs });
  assert.equal(result.hypotheses.length, 0, 'MAP fora da faixa configurada não pode alimentar IA');
  assert.equal(result.blockedInvalidSamples, 1);

  const nullMap = { ...obs('010B', null), timestamp: new Date(nowMs).toISOString() };
  result = engine.runLocalDiagnostic({ ...base, observations: [nullMap], nowMs });
  assert.equal(result.acceptedLiveSamples, 0);
  assert.equal(result.blockedInvalidSamples, 1);

  assert.equal(engine.normalizeDiagnosticSource('REAL'), 'REAL_OBD');
  assert.equal(engine.normalizeDiagnosticSource('REAL_OBD'), 'REAL_OBD');
  assert.equal(engine.normalizeDiagnosticSource('CARSCANNER_BASELINE'), 'CARSCANNER_BASELINE');
  assert.equal(engine.normalizeDiagnosticSource('CARSCANNER_SEED'), 'CARSCANNER_BASELINE');
  assert.equal(engine.normalizeDiagnosticSource('IMPORTADO'), 'IMPORTADO');
  assert.equal(engine.normalizeDiagnosticSource('unknown-source'), 'IMPORTADO',
    'origem desconhecida nunca pode ser promovida a REAL_OBD');

  result = engine.runLocalDiagnostic({
    ...base,
    dtcs: [
      { code: 'P0301', status: 'CONFIRMED', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true },
      { code: 'P0301', status: 'CONFIRMED', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true },
    ],
  });
  assert.equal(result.hypotheses[0].evidence.length, 1, 'DTC duplicado não deve inflar evidência nem pontuação');
  assert.equal(result.hypotheses[0].score, 0.55);
  assert.match(result.disclaimer, /não probabilidades estatísticas/i);

  console.log('Diagnostic engine: OK');
}

main();
