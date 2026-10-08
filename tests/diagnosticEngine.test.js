'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadTs } = require('./helpers/loadTs');
const ROOT = path.resolve(__dirname, '..');
const DIAGNOSTIC_RULES_PATH = path.join(ROOT, 'src/knowledge/diagnostic_rules.json');

function obs(pid, value, source = 'REAL_OBD') {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp: new Date().toISOString(), confidence: 'HIGH' };
}

function main() {
  assert.ok(fs.existsSync(DIAGNOSTIC_RULES_PATH), 'diagnostic_rules.json deve existir');
  const rules = require(DIAGNOSTIC_RULES_PATH);
  assert.ok(Array.isArray(rules.rules), 'diagnostic_rules.json deve conter rules');

  const engine = loadTs('src/diagnostics/diagnosticEngine.ts');
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

  console.log('Diagnostic engine: OK');
}

main();
