'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { loadTs } = require('./helpers/loadTs');
const ROOT = path.resolve(__dirname, '..');
const DIAGNOSTIC_RULES_PATH = path.join(ROOT, 'src/knowledge/diagnostic_rules.json');

function obs(pid, value, source = 'REAL_OBD') {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp: new Date().toISOString(), confidence: 'HIGH', status: 'RESPONDEU' };
}

function obsAt(pid, value, timestamp, source = 'REAL_OBD', status = 'RESPONDEU') {
  return { pid, name: pid, value, unit: 'N/D', source, timestamp: new Date(timestamp).toISOString(), confidence: 'HIGH', status };
}

function runPersistent(engine, condition, values) {
  engine.resetDiagnosticTemporalState();
  let result;
  const now = Date.now();
  for (let i = 0; i < 10; i++) {
    const timestamp = now - (9 - i) * 4_000;
    result = engine.runLocalDiagnostic({ condition, dtcs: [], observations: values.map(([pid, value, source = 'REAL_OBD']) => obsAt(pid, value, timestamp, source)) });
  }
  return result;
}

function main() {
  assert.ok(fs.existsSync(DIAGNOSTIC_RULES_PATH), 'diagnostic_rules.json deve existir');
  const rules = require(DIAGNOSTIC_RULES_PATH);
  assert.ok(Array.isArray(rules.rules), 'diagnostic_rules.json deve conter rules');

  const engine = loadTs('src/diagnostics/diagnosticEngine.ts');
  const emptyResult = engine.runLocalDiagnostic({ observations: [], dtcs: [], condition: 'UNKNOWN' });
  assert.strictEqual(emptyResult.acceptedLiveSamples, 0, 'sem amostras válidas, a IA deve declarar evidência insuficiente');
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

  engine.resetDiagnosticTemporalState();
  result = engine.runLocalDiagnostic({ ...base, observations: [obs('0106', 12), obs('0107', 5), obs('010C', 800)] });
  assert.strictEqual(result.hypotheses.length, 0, 'pico isolado não deve gerar diagnóstico de mistura');
  assert.ok(result.pendingTemporalRules > 0, 'a regra deve aguardar persistência temporal');

  result = runPersistent(engine, 'IDLE_WARM', [['0106', 12], ['0107', 5], ['010C', 800]]);
  assert.strictEqual(result.hypotheses[0].id, 'MISTURA_POBRE');
  assert.strictEqual(result.pendingTemporalRules, 0, 'regra persistente deve confirmar após 10 amostras em 30 s');

  result = runPersistent(engine, 'IDLE_WARM', [['0106', -20], ['0107', -5], ['010C', 800]]);
  assert.strictEqual(result.hypotheses[0].id, 'MISTURA_RICA');

  result = runPersistent(engine, 'IDLE_WARM', [['010B', 50], ['010C', 800]]);
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

  engine.resetDiagnosticTemporalState();
  result = engine.runLocalDiagnostic({ ...base, observations: [obs('010B', 80, 'simulacao'), obs('0106', 20, 'REAL_OBD'), obs('0107', 0, 'REAL_OBD'), obs('010C', 800, 'REAL_OBD')] });
  assert.strictEqual(result.hypotheses.length, 0, 'mistura sem snapshot temporal completo não deve gerar hipótese');
  assert.strictEqual(result.blockedSimulationSamples, 1);

  // Red-team: leitura antiga, valor impossível e resposta com falha não podem virar hipótese.
  engine.resetDiagnosticTemporalState();
  result = engine.runLocalDiagnostic({
    ...base,
    observations: [
      { ...obs('010B', 80), timestamp: new Date(Date.now() - 180_000).toISOString() },
      obs('0106', 140),
      { ...obs('0107', 0), status: 'TIMEOUT' },
    ],
  });
  assert.strictEqual(result.hypotheses.length, 0, 'leituras antigas, fora de faixa ou sem resposta válida devem ser bloqueadas');
  assert.strictEqual(result.blockedStaleSamples, 1);
  assert.strictEqual(result.blockedInvalidSamples, 2);

  engine.resetDiagnosticTemporalState();
  result = engine.runLocalDiagnostic({ ...base, observations: [obs('0106', 20), obs('0107', 0), obs('010C', 0)] });
  assert.strictEqual(result.hypotheses.length, 0, 'RPM zero deve bloquear regras de mistura');
  assert.ok(result.blockedEngineOffRules > 0);

  engine.resetDiagnosticTemporalState();
  result = engine.runLocalDiagnostic({ ...base, observations: [obsAt('0106', 20, Date.now()), obsAt('0107', 0, Date.now() - 5_000), obs('010C', 800)] });
  assert.strictEqual(result.hypotheses.length, 0, 'PIDs separados por mais de 2 s não formam snapshot coerente');
  assert.ok(result.blockedIncoherentSnapshots > 0);

  result = engine.runLocalDiagnostic({
    ...base,
    observations: [obs('0106', 0), obs('0107', 0)],
    dtcs: [{ code: 'p0301', status: 'CONFIRMED', firstSeen: '', lastSeen: '', occurrences: 1, source: 'REAL_OBD', historical: false, confirmed: true }],
  });
  assert.strictEqual(result.hypotheses.length, 1, 'normalização do DTC não deve depender de caixa');
  assert.strictEqual(result.hypotheses[0].id, 'FALHA_DE_COMBUSTAO_CILINDRO_1');

  console.log('Diagnostic engine: OK');
}

main();
