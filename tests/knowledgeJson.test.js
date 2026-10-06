const fs = require('fs');
const path = require('path');

const knowledgeDir = path.join(__dirname, '..', 'src', 'knowledge');
const required = [
  'bluetooth.json',
  'ecu.json',
  'obd_services.json',
  'pids.json',
  'formulas.json',
  'units.json',
  'ranges.json',
  'fuel_types.json',
  'meriva_protocols.json',
  'meriva_confirmed_pids.json',
  'meriva_health.json',
  'meriva_maintenance.json',
  'dtc.json',
  'diagnostics.json',
  'components.json',
  'learning.json',
  'contexts.json',
  'alerts.json'
];

for (const file of required) {
  const full = path.join(knowledgeDir, file);
  if (!fs.existsSync(full)) throw new Error('Knowledge JSON ausente: ' + file);
  const raw = fs.readFileSync(full, 'utf8');
  const parsed = JSON.parse(raw);
  if (!parsed || typeof parsed !== 'object') throw new Error('JSON inválido: ' + file);
  if (typeof parsed.version !== 'number') throw new Error('JSON sem version: ' + file);
  // 012F é permitido como PID experimental/observado; sua promoção depende de evidência RAW_ECU.
}

const pids = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'pids.json'), 'utf8'));
const fuelLevel = pids.pids.find(p => p.pid === '012F');
if (!fuelLevel || fuelLevel.classification !== 'EXPERIMENTAL_OBSERVED' || fuelLevel.formulaId !== 'PERCENT_255') {
  throw new Error('PID 012F deve existir somente como experimental/observado.');
}
const confirmed = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'meriva_confirmed_pids.json'), 'utf8'));
const confirmed012F = confirmed.confirmed_pids.some(p => p.pid === '012F');
if (confirmed012F) throw new Error('PID 012F não pode estar confirmado sem evidência RAW_ECU.');
const candidate012F = confirmed.candidates.find(p => p.pid === '012F');
if (!candidate012F || candidate012F.status !== 'CANDIDATO') throw new Error('PID 012F deve permanecer candidato.');

const ecu = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'ecu.json'), 'utf8'));
if (!ecu.elm327.initialization.includes('ATZ') || !ecu.elm327.initialization.includes('ATSP0')) {
  throw new Error('ecu.json deve conter a sequência ELM de inicialização.');
}

const obd = JSON.parse(fs.readFileSync(path.join(knowledgeDir, 'obd_services.json'), 'utf8'));
const clear = obd.services.find(s => s.mode === '04');
if (!clear || clear.allowed !== false || clear.requiresExplicitUserAction !== true) {
  throw new Error('Serviço 04 deve permanecer bloqueado para limpeza automática de DTC.');
}

console.log('knowledge JSON integrity: PASS');

const runtime = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'knowledgeRuntime.ts'), 'utf8');
for (const requiredSymbol of [
  'assertObdServiceAllowed',
  'getDtcKnowledge',
  'detectContexts',
  'canLearnPid',
  'getDiagnosticCorrelations',
  'getAlertPolicy',
]) {
  if (!runtime.includes(requiredSymbol)) {
    throw new Error('Runtime knowledge sem consumidor: ' + requiredSymbol);
  }
}
if (!runtime.includes("from '../knowledge/learning.json'")) {
  throw new Error('learning.json não está ligado ao runtime.');
}
if (!runtime.includes("from '../knowledge/obd_services.json'")) {
  throw new Error('obd_services.json não está ligado ao runtime.');
}

console.log('knowledge runtime wiring: PASS');
