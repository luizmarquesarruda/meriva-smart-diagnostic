'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadTypeScriptModule(sourcePath, resolveDependency) {
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const compiled = new Module(sourcePath, module);
  compiled.filename = sourcePath;
  compiled.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  compiled.require = (request) => resolveDependency(request);
  compiled._compile(output, sourcePath);
  return compiled.exports;
}

const startupSource = path.join(ROOT, 'src', 'ui', 'startupProgress.ts');
const startup = loadTypeScriptModule(startupSource, (request) => {
  return require(require.resolve(request, { paths: [path.dirname(startupSource)] }));
});
const preflightSource = path.join(ROOT, 'src', 'diagnostics', 'startupPidPreflight.ts');
const sensorEngineSource = path.join(ROOT, 'src', 'diagnostics', 'sensorTestEngine.ts');
const sensorEngine = loadTypeScriptModule(sensorEngineSource, (request) => {
  if (request.endsWith('sensor_tests.json')) return require(path.join(ROOT, 'src', 'knowledge', 'sensor_tests.json'));
  return require(require.resolve(request, { paths: [path.dirname(sensorEngineSource)] }));
});
const corePidSet = new Set(['010C', '0105', '0142', '0111']);
const preflight = loadTypeScriptModule(preflightSource, (request) => {
  if (request === './sensorTestEngine') return sensorEngine;
  if (request === '../obd/pidDefinition') {
    return { getPidDefinition: (pid) => corePidSet.has(String(pid).replace(/\s/g, '').toUpperCase()) ? { unit: 'N/D' } : null };
  }
  return require(require.resolve(request, { paths: [path.dirname(preflightSource)] }));
});

const {
  getStartupProgress,
  getStartupHideDelayMs,
  STARTUP_MIN_DURATION_MS,
  STARTUP_TIMEOUT_MS,
} = startup;
const { runStartupPidPreflight, STARTUP_PID_PREFLIGHT_PIDS, INITIAL_STARTUP_PID_PREFLIGHT } = preflight;

const base = {
  hydrated: true,
  settingsLoaded: true,
  autoConnect: true,
  searching: true,
  ecuConnected: false,
  lifecycle: 'BLUETOOTH_CONNECTING',
  error: null,
  timedOut: false,
  pidPreflight: INITIAL_STARTUP_PID_PREFLIGHT,
};

assert.equal(STARTUP_MIN_DURATION_MS, 6000);
assert.equal(STARTUP_TIMEOUT_MS, 60000);
assert.deepEqual(STARTUP_PID_PREFLIGHT_PIDS, ['010C', '0105', '0142', '0111']);

const loading = getStartupProgress({ ...base, hydrated: false });
assert.equal(loading.percent, 8);
assert.equal(loading.terminal, 'progress');

const bluetooth = getStartupProgress({ ...base, lifecycle: 'BLUETOOTH_ON' });
assert.equal(bluetooth.percent, 20);
assert.match(bluetooth.title, /LOCALIZANDO ADAPTADOR/);

const connecting = getStartupProgress(base);
assert.equal(connecting.percent, 40);
assert.match(connecting.title, /CONECTANDO ADAPTADOR/);

const ecuVerified = getStartupProgress({
  ...base,
  ecuConnected: true,
  lifecycle: 'READY',
});
assert.equal(ecuVerified.percent, 84);
assert.equal(ecuVerified.terminal, 'progress');
assert.match(ecuVerified.title, /ECU VALIDADA/);

const pidRunning = {
  status: 'running',
  totalPids: 4,
  completedPids: 1,
  currentPid: '0105',
  currentLabel: 'Temperatura do líquido de arrefecimento',
  currentAttempt: 3,
  validReadings: 2,
  verifiedPids: ['010C'],
  unsupportedPids: [],
  failedPids: [],
  cancelled: false,
  message: null,
};
const validatingPid = getStartupProgress({ ...base, ecuConnected: true, pidPreflight: pidRunning });
assert.equal(validatingPid.terminal, 'progress');
assert.match(validatingPid.title, /VALIDANDO PIDs ESSENCIAIS/);
assert.match(validatingPid.pidDetail, /0105.*leitura 3\/5/);

const pidReady = getStartupProgress({
  ...base,
  ecuConnected: true,
  lifecycle: 'READY',
  searching: false,
  pidPreflight: {
    ...pidRunning,
    status: 'complete',
    completedPids: 4,
    currentPid: null,
    currentLabel: null,
    verifiedPids: ['010C', '0105', '0142', '0111'],
    message: 'all valid',
  },
});
assert.equal(pidReady.percent, 100);
assert.equal(pidReady.terminal, 'ready');
assert.match(pidReady.title, /APLICATIVO PRONTO/);
assert.match(pidReady.detail, /cinco respostas válidas/);

const pidPartial = getStartupProgress({
  ...base,
  ecuConnected: true,
  pidPreflight: {
    ...pidRunning,
    status: 'partial',
    completedPids: 4,
    currentPid: null,
    currentLabel: null,
    verifiedPids: ['010C', '0105'],
    failedPids: ['0142', '0111'],
  },
});
assert.equal(pidPartial.terminal, 'partial');
assert.match(pidPartial.title, /VERIFICAÇÃO PARCIAL/);
assert.match(pidPartial.detail, /N\/D/);

const manualMode = getStartupProgress({ ...base, autoConnect: false, searching: false });
assert.equal(manualMode.terminal, 'ready');
assert.match(manualMode.detail, /desativada/);
assert.doesNotMatch(manualMode.detail, /ECU validada/);

const connectionError = getStartupProgress({ ...base, searching: false, error: 'ECU sem resposta' });
assert.equal(connectionError.terminal, 'offline');
assert.match(connectionError.title, /NÃO VALIDADA/);

const timedOut = getStartupProgress({ ...base, timedOut: true });
assert.equal(timedOut.percent, 100);
assert.equal(timedOut.terminal, 'offline');
assert.match(timedOut.detail, /modo offline/);

assert.equal(getStartupHideDelayMs({ elapsedMs: 1000, terminal: 'ready', timedOut: false }), 5000);
assert.equal(getStartupHideDelayMs({ elapsedMs: 5900, terminal: 'ready', timedOut: false }), 700);
assert.equal(getStartupHideDelayMs({ elapsedMs: 1000, terminal: 'progress', timedOut: false }), null);
assert.equal(getStartupHideDelayMs({ elapsedMs: 7000, terminal: 'partial', timedOut: false }), 700);
assert.equal(getStartupHideDelayMs({ elapsedMs: 31000, terminal: 'offline', timedOut: true }), 1200);

async function testPreflight() {
  const queries = [];
  const goodConnection = {
    ecuValidated: true,
    supportedPids: ['010C', '0105', '0142', '0111', '010B'],
    session: {
      async queryPid(pid) {
        queries.push(pid);
        return { commandStatus: 'OK', parsed: { status: 'RESPONDEU', value: pid === '0105' ? 90 : 42 } };
      },
    },
  };
  const progressEvents = [];
  const complete = await runStartupPidPreflight(goodConnection, {
    onProgress: (snapshot) => progressEvents.push(snapshot),
  });
  assert.equal(queries.length, 20, 'quatro PIDs essenciais devem receber cinco consultas sequenciais cada');
  assert.deepEqual(queries, [
    ...Array(5).fill('010C'),
    ...Array(5).fill('0105'),
    ...Array(5).fill('0111'),
    ...Array(5).fill('0142'),
  ]);
  assert.equal(complete.status, 'complete');
  assert.deepEqual(complete.verifiedPids, ['010C', '0105', '0111', '0142']);
  assert.deepEqual(complete.unsupportedPids, []);
  assert.ok(progressEvents.some((snapshot) => snapshot.currentPid === '0105' && snapshot.currentAttempt === 3));

  const partialCounts = new Map();
  const partialQueries = [];
  const partialConnection = {
    ecuValidated: true,
    supportedPids: ['010C', '0105'],
    session: {
      async queryPid(pid) {
        partialQueries.push(pid);
        const count = (partialCounts.get(pid) ?? 0) + 1;
        partialCounts.set(pid, count);
        const valid = pid !== '0105' || count < 5;
        return {
          commandStatus: valid ? 'OK' : 'NO_RESPONSE',
          parsed: { status: valid ? 'RESPONDEU' : 'SEM_RESPOSTA', value: valid ? 90 : null },
        };
      },
    },
  };
  const partial = await runStartupPidPreflight(partialConnection);
  assert.equal(partialQueries.length, 10, 'mesmo com falhas, o PID anunciado recebe cinco tentativas');
  assert.equal(partial.status, 'partial');
  assert.deepEqual(partial.verifiedPids, ['010C']);
  assert.deepEqual(partial.failedPids, ['0105']);
  assert.deepEqual(partial.unsupportedPids.sort(), ['0111', '0142']);

  let cancelledQueries = 0;
  const cancelled = await runStartupPidPreflight({
    ecuValidated: true,
    supportedPids: ['010C', '0105'],
    session: {
      async queryPid(pid) {
        cancelledQueries += 1;
        return { commandStatus: 'OK', parsed: { status: 'RESPONDEU', value: 900 } };
      },
    },
  }, { shouldCancel: () => cancelledQueries >= 2 });
  assert.equal(cancelled.status, 'partial');
  assert.equal(cancelled.cancelled, true);
  assert.equal(cancelledQueries, 2, 'timeout deve interromper novas consultas sem criar dados falsos');

  const notValidated = await runStartupPidPreflight({
    ecuValidated: false,
    supportedPids: ['010C'],
    session: { async queryPid() { throw new Error('must not query unvalidated ECU'); } },
  });
  assert.equal(notValidated.status, 'partial');
  assert.match(notValidated.message, /não foi validada/);
}

async function main() {
  await testPreflight();

  const dashboard = fs.readFileSync(path.join(ROOT, 'app', 'index.tsx'), 'utf8');
  const screen = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'StartupScreen.tsx'), 'utf8');
  const model = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'startupProgress.ts'), 'utf8');
  assert.match(dashboard, /getStartupProgress\(/);
  assert.match(dashboard, /<StartupScreen progress=\{startupProgress\} \/>/);
  assert.match(dashboard, /runStartupPidPreflight\(connection/);
  assert.match(dashboard, /STARTUP_TIMEOUT_MS/);
  assert.match(dashboard, /useState\(\(\) => !startupScreenConsumed\)/);
  assert.match(model, /STARTUP_MIN_DURATION_MS = 6_000/);
  assert.match(screen, /accessibilityRole="progressbar"/);
  assert.match(screen, /progress.pidDetail/);
  assert.match(screen, /SMART OBD/);
  assert.match(screen, /OBD-II/);
  assert.match(screen, /protocolDotColor/);
  assert.match(screen, /backgroundColor: protocolDotColor/);
  assert.doesNotMatch(screen, /connectPreferredElm/, 'tela de abertura não pode iniciar uma segunda sessão OBD');
  console.log('startupProgress.test.js: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
