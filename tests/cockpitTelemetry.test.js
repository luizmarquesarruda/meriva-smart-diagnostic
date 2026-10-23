const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');
const policy = JSON.parse(read('src/knowledge/polling_policy.json'));
const catalog = JSON.parse(read('src/knowledge/pids.json'));
const home = read('app/index.tsx');
const trip = read('src/trip/autoTripService.ts');
const helper = read('src/obd/cockpitTelemetry.ts');

const configuredPids = policy.cockpit.pidOrder.map((pid) => String(pid).toUpperCase());
const catalogPids = new Set(catalog.pids.map((item) => String(item.pid).toUpperCase()));
assert.equal(policy.cockpit.maxDisplayedPids, 25);
assert.equal(configuredPids.length, 25, 'o cockpit deve configurar vinte e cinco PIDs candidatos');
assert.equal(new Set(configuredPids).size, 25, 'PIDs do cockpit não podem se repetir');
for (const pid of configuredPids) assert.ok(catalogPids.has(pid), 'PID ausente do catálogo: ' + pid);
assert.ok(policy.cockpit.displayFreshAfterMs > 0);
assert.ok(policy.cockpit.displayStaleAfterMs > policy.cockpit.displayFreshAfterMs);
assert.ok(policy.polling.rotatingTelemetryPids.length >= 20, 'rotação auxiliar deve incluir os novos PIDs sem ficar limitada a quatro');
for (const pid of ['010A', '010E', '012C', '012D', '012E']) {
  assert.ok(configuredPids.includes(pid), 'PID adicional ausente do cockpit: ' + pid);
  assert.ok(policy.polling.rotatingTelemetryPids.includes(pid), 'PID adicional ausente da rotação: ' + pid);
}
for (const pid of ['010C', '010D', '012F', '0152', '015E']) {
  assert.ok(!policy.polling.rotatingTelemetryPids.includes(pid), 'caminho dedicado não deve ser polled de novo: ' + pid);
}
assert.match(helper, /reading\.source !== 'REAL'/, 'simulações e seeds não podem alimentar o cockpit real');
assert.match(helper, /Number\.isFinite\(timestampMs\)/, 'timestamps inválidos devem ser descartados');
assert.match(helper, /timestampMs > nowMs/, 'leituras futuras devem ser descartadas');
assert.match(helper, /displayStaleAfterMs/, 'leituras vencidas devem virar N/D');
assert.match(helper, /classifySeverity/, 'limites monitorados devem gerar severidade');
assert.match(home, /buildCockpitPidMetrics\(connectedSupportedPids, liveReadings\)/);
assert.match(home, /visibleHeroMetrics/, 'o painel deve alternar a lista dinâmica de PIDs/alertas');
assert.match(home, /10_000/, 'a rotação visual deve permanecer em dez segundos');
assert.match(home, /heroCardDanger/);
assert.match(home, /heroCardWarning/);
assert.match(trip, /queriedPidsThisCycle\.add\('010C'\)/);
assert.match(trip, /queriedPidsThisCycle\.add\('010D'\)/);
assert.match(trip, /!queriedPidsThisCycle\.has\(item\)/, 'a fila serial não deve consultar duas vezes o mesmo PID por ciclo');
console.log('Cockpit telemetry: OK');
