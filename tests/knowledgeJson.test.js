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
  const dtcCatalog = readJson('src/knowledge/dtc_catalog.json');

  assert.strictEqual(typeof pids.version, 'number');
  assert.strictEqual(typeof formulas.version, 'number');
  assert.strictEqual(typeof ranges.version, 'number');
  assert.strictEqual(typeof units.version, 'number');
  assert.strictEqual(typeof fuelTypes.version, 'number');
  assert.strictEqual(typeof protocols.version, 'number');
  assert.strictEqual(typeof confirmed.version, 'number');
  assert.strictEqual(typeof bluetooth.schemaVersion, 'number');
  assert.strictEqual(typeof diagnosticRules.version, 'number');
  assert.strictEqual(typeof dtcCatalog.version, 'number');
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
  assert.deepStrictEqual(new Set(rangeIds), pidIds, 'ranges.json deve ter exatamente os mesmos PIDs do catálogo');

  for (const id of rangeIds) {
    const range = ranges.ranges[id];
    assert.ok(Number.isFinite(range.min), 'min inválido: ' + id);
    assert.ok(Number.isFinite(range.max), 'max inválido: ' + id);
    assert.ok(range.min <= range.max, 'range invertido: ' + id);
  }

  const supportedFormulaOperations = new Set([
    'u8', 'u16', 'u16_div', 'u8_offset', 'u8_scale',
    'u8_offset_scale', 'u8_scale_offset', 'u8_div', 'u8_scale_div', 'u16_scale', 'u16_scale_div', 'u32', 'u16_offset_scale',
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

  assert.ok(diagnosticRules.principles?.length >= 1, 'princípios diagnósticos ausentes');
  for (const principle of diagnosticRules.principles) assert.ok(typeof principle === 'string' && principle.trim(), 'princípio diagnóstico vazio');

  console.log('JSON knowledge audit: OK');
}

main();
