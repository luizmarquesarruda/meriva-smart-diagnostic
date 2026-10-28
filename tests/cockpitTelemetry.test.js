const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

function loadTs(file) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(file, null);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  mod._compile(output, file);
  return mod.exports;
}

const policy = JSON.parse(read('src/knowledge/polling_policy.json'));
const catalog = JSON.parse(read('src/knowledge/pids.json'));
const home = read('app/index.tsx');
const trip = read('src/trip/autoTripService.ts');
const helper = read('src/obd/cockpitTelemetry.ts');
const telemetryModule = loadTs(path.join(root, 'src/obd/cockpitTelemetry.ts'));

const configuredPids = policy.cockpit.pidOrder.map((pid) => String(pid).toUpperCase());
const catalogPids = new Set(catalog.pids.map((item) => String(item.pid).toUpperCase()));
assert.equal(policy.cockpit.maxDisplayedPids, 20);
assert.equal(configuredPids.length, 20, 'o cockpit deve configurar vinte PIDs candidatos');
assert.equal(new Set(configuredPids).size, 20, 'PIDs do cockpit não podem se repetir');
for (const pid of configuredPids) assert.ok(catalogPids.has(pid), 'PID ausente do catálogo: ' + pid);
assert.ok(policy.cockpit.displayFreshAfterMs > 0);
assert.ok(policy.cockpit.displayStaleAfterMs > policy.cockpit.displayFreshAfterMs);
assert.ok(policy.polling.rotatingTelemetryPids.length >= 12, 'rotação auxiliar não pode ficar limitada a quatro PIDs');
for (const pid of ['010C', '010D', '012F', '0152', '015E']) {
  assert.ok(!policy.polling.rotatingTelemetryPids.includes(pid), 'caminho dedicado não deve ser polled de novo: ' + pid);
}
assert.match(helper, /reading\.source !== 'REAL'/, 'simulações e seeds não podem alimentar o cockpit real');
assert.match(helper, /Number\.isFinite\(timestampMs\)/, 'timestamps inválidos devem ser descartados');
assert.match(helper, /timestampMs > nowMs/, 'leituras futuras devem ser descartadas');
assert.match(helper, /displayStaleAfterMs/, 'leituras vencidas devem virar N/D');
assert.match(helper, /classifySeverity/, 'limites monitorados devem gerar severidade');
assert.match(home, /buildCockpitPidMetrics\(connectedSupportedPids, liveReadings\)/);
assert.match(home, /const quadrantDefinitions = \[/, 'o cockpit deve preservar os quatro indicadores principais em quadrantes');
assert.match(home, /getCockpitMetricPage\(visibleHeroMetrics, currentQuadrantPage\)/, 'os PIDs adicionais devem continuar acessíveis por páginas de quadrantes');
assert.match(home, /quadrantGrid/, 'os indicadores devem renderizar em grade simultânea 2x2');
assert.match(home, /displayedQuadrantMetrics\.map/, 'a tela deve renderizar quatro quadrantes por página');
assert.match(home, /COCKPIT_QUADRANT_PAGE_SIZE/, 'o tamanho da página deve vir do contrato central');
assert.match(home, /setActiveQuadrantPage/, 'o usuário deve poder alternar de página por toque');
assert.match(home, /10_000/, 'as páginas dos quadrantes devem alternar a cada dez segundos');
assert.match(home, /quadrantCardDanger/);
assert.match(home, /quadrantCardWarning/);
assert.doesNotMatch(home, /selectedHeroMetric/, 'um único mostrador rotativo não pode substituir os quadrantes simultâneos');

const sampleMetrics = Array.from({ length: 9 }, (_, index) => ({
  pid: 'PID-' + index,
  label: 'Métrica ' + index,
  value: index,
  unit: 'u',
  severity: 'normal',
  freshness: 'fresh',
  hint: 'leitura real',
}));
assert.equal(telemetryModule.COCKPIT_QUADRANT_PAGE_SIZE, 4);
assert.deepEqual(telemetryModule.getCockpitMetricPage(sampleMetrics, 0).map((metric) => metric.pid),
  ['PID-0', 'PID-1', 'PID-2', 'PID-3']);
assert.deepEqual(telemetryModule.getCockpitMetricPage(sampleMetrics, 1).map((metric) => metric.pid),
  ['PID-4', 'PID-5', 'PID-6', 'PID-7']);
assert.deepEqual(telemetryModule.getCockpitMetricPage(sampleMetrics, 2).map((metric) => metric.pid), ['PID-8']);
assert.deepEqual(telemetryModule.getCockpitMetricPage(sampleMetrics, 3).map((metric) => metric.pid),
  ['PID-0', 'PID-1', 'PID-2', 'PID-3'], 'a navegação deve voltar à primeira página após a última');
assert.deepEqual(telemetryModule.getCockpitMetricPage(sampleMetrics, -1).map((metric) => metric.pid), ['PID-8']);
assert.match(trip, /queriedPidsThisCycle\.add\('010C'\)/);
assert.match(trip, /queriedPidsThisCycle\.add\('010D'\)/);
assert.match(trip, /!queriedPidsThisCycle\.has\(item\)/, 'a fila serial não deve consultar duas vezes o mesmo PID por ciclo');
console.log('Cockpit telemetry: OK');
