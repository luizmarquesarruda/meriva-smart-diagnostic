const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(parsed && typeof parsed === 'object', relativePath + ' deve conter um objeto JSON');
  return parsed;
}

function assertUnique(values, label) {
  const seen = new Set();
  for (const value of values) {
    assert.ok(!seen.has(value), label + ' duplicado: ' + value);
    seen.add(value);
  }
}

function main() {
  const pids = readJson('src/knowledge/pids.json');
  const ranges = readJson('src/knowledge/ranges.json');
  const formulas = readJson('src/knowledge/formulas.json');
  const units = readJson('src/knowledge/units.json');
  const fuelTypes = readJson('src/knowledge/fuel_types.json');
  const protocols = readJson('src/knowledge/meriva_protocols.json');
  const confirmed = readJson('src/knowledge/meriva_confirmed_pids.json');
  const bluetooth = readJson('src/knowledge/bluetooth_config.json');
  const diagnosticRules = readJson('src/knowledge/diagnostic_rules.json');
  const sensorTests = readJson('src/knowledge/sensor_tests.json');
  const dtcCatalog = readJson('src/knowledge/dtc_catalog.json');
  const pollingPolicy = readJson('src/knowledge/polling_policy.json');

  assert.strictEqual(typeof pids.version, 'number');
  assert.strictEqual(typeof formulas.version, 'number');
  assert.strictEqual(typeof ranges.version, 'number');
  assert.strictEqual(typeof units.version, 'number');
  assert.strictEqual(typeof fuelTypes.version, 'number');
  assert.strictEqual(typeof protocols.version, 'number');
  assert.strictEqual(typeof confirmed.version, 'number');
  assert.strictEqual(typeof bluetooth.schemaVersion, 'number');
  assert.strictEqual(typeof diagnosticRules.version, 'number');
  assert.strictEqual(typeof sensorTests.schemaVersion, 'number');
  assert.strictEqual(sensorTests.catalogId, 'MERIVA_SMART_SENSOR_TESTS');
  assert.strictEqual(sensorTests.minimumReadingsPerPid, 5, 'cada PID suportado exige cinco tentativas');
  assert.ok(Array.isArray(sensorTests.tests) && sensorTests.tests.length > 0, 'catálogo de testes vazio');
  assert.ok(Array.isArray(sensorTests.sources) && sensorTests.sources.length >= 5, 'fontes pesquisadas ausentes');
  assert.strictEqual(typeof dtcCatalog.version, 'number');
  assert.strictEqual(typeof pollingPolicy.version, 'number');
  assert.strictEqual(pollingPolicy.version, 2, 'cadência flex-fuel exige versão de contrato atualizada');
  assert.ok(Array.isArray(dtcCatalog.codes) && dtcCatalog.codes.length > 0, 'catálogo DTC vazio');
  assert.strictEqual(dtcCatalog.standard, 'SAE J2012');
  assertUnique(dtcCatalog.codes.map((item) => String(item.code).toUpperCase()), 'DTC catalogado');
  for (const item of dtcCatalog.codes) {
    assert.ok(/^[PCBU][0-3][0-9A-F]{3}$/.test(String(item.code).toUpperCase()), 'DTC inválido no catálogo: ' + item.code);
    assert.ok(typeof item.name === 'string' && item.name.trim(), 'DTC sem nome: ' + item.code);
    assert.ok(typeof item.description === 'string' && item.description.trim(), 'DTC sem descrição: ' + item.code);
    assert.ok(typeof item.system === 'string' && item.system.trim(), 'DTC sem sistema: ' + item.code);
    assert.strictEqual(item.standardized, true, 'DTC deve ser explicitamente padronizado: ' + item.code);
  }

  const pidIds = new Set();
  for (const pid of pids.pids) {
    const id = String(pid.pid).toUpperCase();
    assert.ok(/^01[0-9A-F]{2}$/.test(id), 'PID inválido: ' + id);
    assert.ok(!pidIds.has(id), 'PID duplicado: ' + id);
    pidIds.add(id);

    assert.ok(typeof pid.name === 'string' && pid.name.trim(), 'PID sem nome: ' + id);
    assert.ok([1, 2, 4].includes(pid.bytes), 'bytes inválidos: ' + id);
    assert.ok(typeof pid.unit === 'string' && pid.unit.trim(), 'PID sem unidade/tipo: ' + id);
    assert.ok(units.units[pid.unit], 'PID com unidade inexistente em units.json: ' + id + ' -> ' + pid.unit);
    assert.ok(typeof pid.formulaId === 'string' && pid.formulaId, 'PID sem formulaId: ' + id);
    assert.ok(formulas.formulas[pid.formulaId], 'formulaId sem definição: ' + id + ' -> ' + pid.formulaId);

    const operation = formulas.formulas[pid.formulaId].operation;
    const minimumBytes = ['u8', 'u8_offset', 'u8_scale', 'u8_offset_scale', 'u8_scale_offset', 'u8_div', 'u8_scale_div'].includes(operation) ? 1 : 2;
    assert.ok(pid.bytes >= minimumBytes, 'bytes insuficientes para a fórmula: ' + id + ' -> ' + operation);
  }

  const o2Pid = pids.pids.find((item) => item.pid === '0114');
  assert.strictEqual(o2Pid.bytes, 2, 'PID 0114 deve carregar os dois bytes da resposta padronizada');
  assert.strictEqual(o2Pid.formulaId, 'O2_VOLTS');

  const pidList = [...pidIds];
  const rangeIds = Object.keys(ranges.ranges).map((id) => id.toUpperCase());
  const polling = pollingPolicy.polling;
  assert.ok(Array.isArray(polling.corePids) && polling.corePids.length > 0);
  assert.strictEqual(polling.measuredFuelRate.everyCycles, 1, 'taxa de combustível medida deve continuar na cadência principal');
  assert.ok(Number.isInteger(polling.estimatedFuelRate.everyCycles) && polling.estimatedFuelRate.everyCycles >= 2);
  assert.ok(Number.isInteger(polling.fuelLevel.everyCycles) && polling.fuelLevel.everyCycles >= 2);
  assert.strictEqual(polling.fuelComposition.pid, '0152', 'composição FLEX usa o PID padrão de percentual de etanol');
  assert.ok(Number.isInteger(polling.fuelComposition.everyCycles) && polling.fuelComposition.everyCycles >= 10,
    'composição do combustível deve usar cadência baixa para não atrasar PIDs críticos');
  assert.ok(Number.isInteger(polling.fuelComposition.phase) && polling.fuelComposition.phase >= 0 &&
    polling.fuelComposition.phase < polling.fuelComposition.everyCycles);
  assert.ok(Number.isInteger(polling.estimatedFuelRate.phase) && polling.estimatedFuelRate.phase >= 0 && polling.estimatedFuelRate.phase < polling.estimatedFuelRate.everyCycles);
  assert.ok(Number.isInteger(polling.fuelLevel.phase) && polling.fuelLevel.phase >= 0 && polling.fuelLevel.phase < polling.fuelLevel.everyCycles);
  assert.notStrictEqual(polling.estimatedFuelRate.phase, polling.fuelLevel.phase,
    'PIDs lentos de estimativa e nível não devem cair no mesmo ciclo serial');
  assert.ok(Number.isFinite(polling.estimatedFuelRate.displayStaleAfterMs) && polling.estimatedFuelRate.displayStaleAfterMs > 0);
  assert.ok(Number.isInteger(pollingPolicy.learningSampleMinIntervalMs) && pollingPolicy.learningSampleMinIntervalMs >= 1000,
    'persistência do aprendizado deve ter cadência mínima para evitar inflar amostras por polling rápido');
  const policyPids = [
    ...polling.corePids,
    polling.measuredFuelRate.pid,
    polling.estimatedFuelRate.mafPid,
    polling.estimatedFuelRate.mapPid,
    polling.estimatedFuelRate.intakeAirTempPid,
    polling.fuelLevel.pid,
    polling.fuelComposition.pid,
    ...polling.rotatingTelemetryPids,
  ];
  for (const id of policyPids) {
    assert.ok(pidIds.has(String(id).toUpperCase()), 'polling policy referencia PID ausente no catálogo: ' + id);
  }
  assert.deepStrictEqual(new Set(rangeIds), pidIds, 'ranges.json deve ter exatamente os mesmos PIDs do catálogo');

  for (const id of rangeIds) {
    const range = ranges.ranges[id];
    assert.ok(Number.isFinite(range.min), 'min inválido: ' + id);
    assert.ok(Number.isFinite(range.max), 'max inválido: ' + id);
    assert.ok(range.min <= range.max, 'range invertido: ' + id);
  }

  const supportedFormulaOperations = new Set([
    'u8', 'u16', 'u16_div', 'u8_offset', 'u8_scale',
    'u8_offset_scale', 'u8_scale_offset', 'u8_div', 'u8_scale_div', 'u16_scale', 'u16_scale_div', 'u16_offset_scale', 'u32',
  ]);
  const formulaIds = Object.keys(formulas.formulas);
  assertUnique(formulaIds, 'formulaId');
  for (const [id, spec] of Object.entries(formulas.formulas)) {
    assert.ok(supportedFormulaOperations.has(spec.operation), 'operação de fórmula não implementada: ' + id + ' -> ' + spec.operation);
    for (const key of ['offset', 'scale', 'divisor']) {
      if (spec[key] !== undefined) assert.ok(Number.isFinite(spec[key]), 'parâmetro não numérico em fórmula ' + id + ': ' + key);
    }
    if (['u16_div', 'u8_div', 'u8_scale', 'u8_offset_scale', 'u8_scale_div', 'u16_scale_div'].includes(spec.operation)) {
      assert.ok(Number.isFinite(spec.divisor) && spec.divisor !== 0, 'divisor inválido na fórmula ' + id);
    }
  }
  for (const pid of pids.pids) {
    assert.ok(formulaIds.includes(pid.formulaId), 'formulaId sem definição: ' + pid.formulaId);
  }

  for (const id of Object.keys(units.units)) {
    const unit = units.units[id];
    assert.ok(unit && typeof unit.symbol === 'string' && typeof unit.name === 'string', 'unidade malformada: ' + id);
  }

  for (const pid of [...confirmed.confirmed_pids, ...confirmed.candidates]) {
    const id = String(pid.pid).toUpperCase();
    assert.ok(pidIds.has(id), 'PID confirmado/candidato ausente no catálogo: ' + pid.pid);
    const catalog = pids.pids.find((item) => String(item.pid).toUpperCase() === id);
    assert.strictEqual(pid.name, catalog.name, 'nome divergente para ' + id);
    assert.strictEqual(pid.unit, catalog.unit, 'unidade divergente para ' + id);
    assert.strictEqual(pid.formulaId, catalog.formulaId, 'formulaId divergente para ' + id);
    assert.strictEqual(pid.bytes, catalog.bytes, 'bytes divergentes para ' + id);
    assert.ok(Number.isFinite(pid.confidence) && pid.confidence >= 0 && pid.confidence <= 1, 'confiança inválida para ' + id);
    assert.ok(typeof pid.source_note === 'string' && pid.source_note.trim(), 'PID sem source_note: ' + id);
    if (pid.evidence === 'RAW_ECU') {
      assert.ok(typeof pid.observed_response === 'string' && /^[0-9A-Fa-f ]+$/.test(pid.observed_response) && pid.observed_response.trim(), 'resposta RAW inválida: ' + id);
      assert.ok(Number.isFinite(pid.observed_value), 'observed_value inválido: ' + id);
    }
  }

  assert.ok(Array.isArray(confirmed.next_confirmation_targets) && confirmed.next_confirmation_targets.length > 0);
  for (const id of confirmed.next_confirmation_targets) {
    assert.ok(pidIds.has(String(id).toUpperCase()), 'alvo de confirmação ausente do catálogo: ' + id);
  }

  assert.ok(fuelTypes.codes && typeof fuelTypes.codes === 'object' && Object.keys(fuelTypes.codes).length >= 1);
  for (const [code, label] of Object.entries(fuelTypes.codes)) {
    assert.ok(/^(0|[1-9][0-9]*)$/.test(code), 'código de combustível inválido: ' + code);
    assert.ok(typeof label === 'string' && label.trim(), 'descrição de combustível vazia: ' + code);
  }
  assert.ok(fuelTypes.codes['0'], 'fuel_types.json deve reservar o código 0 como indisponível');

  assert.ok(Array.isArray(protocols.elm327_protocols) && protocols.elm327_protocols.length > 0);
  assertUnique(protocols.elm327_protocols.map((item) => String(item.elm)), 'protocolo ELM');
  assertUnique(protocols.elm327_protocols.map((item) => item.priority), 'prioridade de protocolo');
  for (const item of protocols.elm327_protocols) {
    assert.ok(/^[03456789]$/.test(String(item.elm)), 'ID de protocolo inválido: ' + item.elm);
    assert.ok(typeof item.name === 'string' && item.name.trim(), 'protocolo sem nome: ' + item.elm);
    assert.ok(Number.isFinite(item.priority), 'prioridade inválida: ' + item.elm);
  }
  assert.ok(protocols.elm327_protocols.some((item) => item.elm === '5' && /KWP/i.test(item.name)), 'protocolo Meriva observado deve existir como ATSP5');

  assert.ok(bluetooth.transport.type === 'BLUETOOTH_CLASSIC_RFCOMM_SPP');
  assert.deepStrictEqual(bluetooth.transport.socketModes, ['INSECURE', 'SECURE']);
  assert.strictEqual(bluetooth.transport.connectionType, 'delimited');
  assert.strictEqual(bluetooth.transport.delimiter, '');
  assert.strictEqual(bluetooth.transport.charset, 'ascii');
  assert.ok(Number.isInteger(bluetooth.retry.maxAttempts) && bluetooth.retry.maxAttempts >= 1);
  assert.ok(Number.isInteger(bluetooth.retry.intervalMs) && bluetooth.retry.intervalMs >= 0);
  assert.strictEqual(bluetooth.retry.stopOnSuccess, true);
  assert.strictEqual(bluetooth.validation.command, '010C');
  assert.strictEqual(bluetooth.validation.responsePrefix, '41 0C');
  assert.ok(bluetooth.initialization.required.includes('ATZ'));
  assert.ok(bluetooth.initialization.optional.includes('ATI'));
  assert.ok(Number.isInteger(bluetooth.initialization.optionalCommandTimeoutMs) && bluetooth.initialization.optionalCommandTimeoutMs >= 1000);
  assert.ok(Number.isInteger(bluetooth.initialization.protocolSelectionTimeoutMs) && bluetooth.initialization.protocolSelectionTimeoutMs >= bluetooth.initialization.optionalCommandTimeoutMs);

  assert.ok(Array.isArray(diagnosticRules.rules) && diagnosticRules.rules.length > 0);
  assertUnique(diagnosticRules.rules.map((rule) => rule.id), 'regra diagnóstica');
  const allowedConditions = new Set(['IDLE_COLD', 'IDLE_WARM', 'ACCELERATION', 'CRUISE', 'DECELERATION', 'UNKNOWN']);
  for (const rule of diagnosticRules.rules) {
    assert.ok(typeof rule.id === 'string' && rule.id.trim(), 'regra sem id');
    assert.ok(rule.trigger && typeof rule.trigger === 'object', 'regra sem trigger: ' + rule.id);
    assert.ok(Object.keys(rule.trigger).length > 0, 'trigger vazio: ' + rule.id);
    assert.ok(typeof rule.hypothesis === 'string' && rule.hypothesis.trim(), 'hipótese vazia: ' + rule.id);
    assert.ok(Number.isFinite(rule.baseScore) && rule.baseScore >= 0 && rule.baseScore <= 1, 'baseScore inválido: ' + rule.id);
    assert.ok(Array.isArray(rule.tests) && rule.tests.length > 0 && rule.tests.every((item) => typeof item === 'string' && item.trim()), 'tests inválidos: ' + rule.id);
    if (rule.trigger.dtc !== undefined) assert.ok(/^[PCBU][0-3][0-9A-Fa-f]{3}$/.test(rule.trigger.dtc), 'DTC inválido na regra ' + rule.id);
    if (rule.trigger.condition !== undefined) assert.ok(allowedConditions.has(rule.trigger.condition), 'condition inválida na regra ' + rule.id);
    for (const key of ['combinedTrimMin', 'combinedTrimMax', 'mapMinKpa']) {
      if (rule.trigger[key] !== undefined) assert.ok(Number.isFinite(rule.trigger[key]), 'parâmetro inválido na regra ' + rule.id + ': ' + key);
    }
  }


  const sensorTestItems = sensorTests.tests;
  assertUnique(sensorTestItems.map((item) => item.id), 'ID de teste de sensor');
  assertUnique(sensorTestItems.map((item) => item.pid), 'PID do catálogo de testes');
  const allowedSensorEvaluators = new Set(['RPM_BY_MODE','STATIONARY_SPEED','PLAUSIBILITY_RANGE','TEMPERATURE_PLAUSIBILITY','FUEL_TRIM_CONTEXT','MAP_BY_MODE','O2_NARROWBAND_LIMITATION','PERCENT_PLAUSIBILITY','BARO_PLAUSIBILITY','ECU_VOLTAGE_BY_MODE','FLEX_COMPOSITION','FUEL_RATE_BY_MODE','DISCOVERED_STABILITY','OBSERVATION_ONLY']);
  const validSensorModes = new Set(['ENGINE_OFF','ENGINE_ON']);
  for (const test of sensorTestItems) {
    const id = String(test.pid).toUpperCase();
    assert.ok(pidIds.has(id), 'sensor_tests.json referencia PID ausente: ' + id);
    assert.strictEqual(test.minimumReadings, 5, 'teste exige cinco tentativas: ' + id);
    assert.ok(typeof test.label === 'string' && test.label.trim(), 'teste sem rótulo: ' + id);
    assert.ok(allowedSensorEvaluators.has(test.evaluator), 'avaliador não implementado: ' + test.evaluator);
    assert.ok(Array.isArray(test.modes) && test.modes.length > 0 && test.modes.every((mode) => validSensorModes.has(mode)), 'modo inválido: ' + id);
    assert.ok(Array.isArray(test.requiredPids), 'requiredPids ausente: ' + id);
    for (const dependency of test.requiredPids) assert.ok(pidIds.has(dependency), 'pré-requisito ausente: ' + id + ' -> ' + dependency);
    const pidDef = pids.pids.find((item) => item.pid === id);
    assert.strictEqual(test.catalogName, pidDef.name, 'nome divergente: ' + id);
    assert.strictEqual(test.unit, pidDef.unit, 'unidade divergente: ' + id);
    assert.strictEqual(test.formulaId, pidDef.formulaId, 'fórmula divergente: ' + id);
    assert.ok(['CONFIRMED_REAL_ECU','UNCONFIRMED_FOR_THIS_ECU'].includes(test.vehicleEvidenceStatus), 'estado de evidência inválido: ' + id);
    assert.strictEqual(test.evidenceClass, 'STANDARD_OBD_OPTIONAL_ECU_SUPPORT', 'catálogo genérico não garante suporte: ' + id);
    assert.ok(Array.isArray(test.diagnosticRuleIds), 'links da IA ausentes: ' + id);
    for (const ruleId of test.diagnosticRuleIds) assert.ok(diagnosticRules.rules.some((rule) => rule.id === ruleId), 'regra IA inexistente: ' + ruleId);
    assert.ok(typeof test.aiGuidance === 'string' && test.aiGuidance.trim(), 'guia IA vazio: ' + id);
    for (const [key, value] of Object.entries(test.thresholds)) assert.ok(Number.isFinite(value), 'limiar não numérico: ' + id + '.' + key);
  }
  assert.deepStrictEqual(sensorTestItems.filter((item) => item.vehicleEvidenceStatus === 'CONFIRMED_REAL_ECU').map((item) => item.pid), ['010C'], 'somente RPM tem resposta RAW_ECU documentada');
  for (const source of sensorTests.sources) {
    assert.ok(typeof source.id === 'string' && source.id.trim(), 'fonte sem ID');
    assert.ok(typeof source.title === 'string' && source.title.trim(), 'fonte sem título');
    assert.ok(typeof source.usedFor === 'string' && source.usedFor.trim(), 'uso da fonte ausente');
  }

  assert.ok(diagnosticRules.principles?.length >= 1, 'princípios diagnósticos ausentes');
  for (const principle of diagnosticRules.principles) assert.ok(typeof principle === 'string' && principle.trim(), 'princípio diagnóstico vazio');

  console.log('JSON knowledge audit: OK');
}

main();
