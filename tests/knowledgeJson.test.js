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

function main() {
  const pids = readJson('src/knowledge/pids.json');
  const ranges = readJson('src/knowledge/ranges.json');
  const formulas = readJson('src/knowledge/formulas.json');
  const units = readJson('src/knowledge/units.json');
  const fuelTypes = readJson('src/knowledge/fuel_types.json');
  const protocols = readJson('src/knowledge/meriva_protocols.json');
  const confirmed = readJson('src/knowledge/meriva_confirmed_pids.json');

  const pidIds = new Set();
  for (const pid of pids.pids) {
    const id = String(pid.pid).toUpperCase();
    assert.ok(/^01[0-9A-F]{2}$/.test(id), 'PID inválido: ' + id);
    assert.ok(!pidIds.has(id), 'PID duplicado: ' + id);
    pidIds.add(id);
    assert.ok(ranges.ranges[id], 'PID sem faixa de plausibilidade: ' + id);
    assert.ok(pid.formulaId, 'PID sem formulaId: ' + id);
  }

  for (const id of Object.keys(ranges.ranges)) {
    assert.ok(pidIds.has(id), 'range sem PID correspondente: ' + id);
    assert.ok(Number.isFinite(ranges.ranges[id].min), 'min inválido: ' + id);
    assert.ok(Number.isFinite(ranges.ranges[id].max), 'max inválido: ' + id);
    assert.ok(ranges.ranges[id].min <= ranges.ranges[id].max, 'range invertido: ' + id);
  }

  const formulaIds = new Set(Object.keys(formulas.formulas || formulas));
  for (const pid of pids.pids) {
    assert.ok(formulaIds.has(pid.formulaId), 'formulaId sem definição: ' + pid.formulaId);
  }

  for (const pid of [...confirmed.confirmed_pids, ...confirmed.candidates]) {
    assert.ok(pidIds.has(String(pid.pid).toUpperCase()), 'PID confirmado/candidato ausente no catálogo: ' + pid.pid);
  }

  assert.ok(units && Object.keys(units).length > 0, 'units.json vazio');
  assert.ok(fuelTypes && Object.keys(fuelTypes).length > 0, 'fuel_types.json vazio');
  assert.ok(protocols && Object.keys(protocols).length > 0, 'meriva_protocols.json vazio');

  console.log('JSON knowledge audit: OK');
}

main();
