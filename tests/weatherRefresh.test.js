'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/weather/conditionsRefresh.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, sourcePath);

const {
  CURRENT_CONDITIONS_REFRESH_INTERVAL_MS,
  CURRENT_CONDITIONS_RETRY_COOLDOWN_MS,
  CURRENT_CONDITIONS_MAX_RETRY_COOLDOWN_MS,
  isConditionsNetworkAvailable,
  mergeCurrentConditions,
  startCurrentConditionsRefresh,
} = loaded.exports;

function conditions(overrides = {}) {
  return {
    city: 'Sorocaba',
    locationLabels: ['CIDADE: Sorocaba'],
    temperatureC: 27,
    description: 'CÉU LIMPO',
    available: true,
    ...overrides,
  };
}

function flushMicrotasks() {
  return Promise.resolve()
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve())
    .then(() => Promise.resolve());
}

(async () => {
  assert.equal(CURRENT_CONDITIONS_REFRESH_INTERVAL_MS, 15 * 60 * 1000);
  assert.equal(CURRENT_CONDITIONS_RETRY_COOLDOWN_MS, 60 * 1000);
  assert.equal(CURRENT_CONDITIONS_MAX_RETRY_COOLDOWN_MS, 15 * 60 * 1000);

  // Cellular data (4G/5G) and Wi-Fi use the same reachability contract.
  assert.equal(isConditionsNetworkAvailable({ isConnected: true, isInternetReachable: true }), true);
  assert.equal(isConditionsNetworkAvailable({ isConnected: true, isInternetReachable: null }), true);
  assert.equal(isConditionsNetworkAvailable({ isConnected: true, isInternetReachable: false }), false);
  assert.equal(isConditionsNetworkAvailable({ isConnected: false, isInternetReachable: true }), false);

  const previous = conditions();
  const stale = mergeCurrentConditions(previous, conditions({
    city: null,
    locationLabels: [],
    temperatureC: null,
    description: 'CLIMA INDISPONÍVEL • DIAGNÓSTICO OFFLINE',
    available: false,
  }));
  assert.equal(stale.city, 'Sorocaba', 'falha temporária deve preservar a última localidade conhecida');
  assert.deepEqual(stale.locationLabels, ['CIDADE: Sorocaba']);
  assert.equal(stale.temperatureC, null, 'temperatura antiga não pode continuar parecendo atual');
  assert.equal(stale.available, false);
  assert.match(stale.description, /DESATUALIZADO/);
  const denied = mergeCurrentConditions(previous, conditions({
    city: null,
    locationLabels: [],
    temperatureC: null,
    description: 'CLIMA OPCIONAL • LOCALIZAÇÃO NÃO AUTORIZADA',
    available: false,
  }));
  assert.equal(denied.city, null, 'permissão revogada não pode manter dados de localização anteriores');

  let clock = 1000;
  let network = { isConnected: true, isInternetReachable: true };
  const listeners = new Set();
  let timerCallback = null;
  let clearedTimer = false;
  let calls = 0;
  const updates = [];
  const monitor = {
    fetch: async () => ({ ...network }),
    addEventListener(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
  const stop = startCurrentConditionsRefresh(
    monitor,
    async () => {
      calls += 1;
      return conditions({ temperatureC: 26 + calls });
    },
    (result) => updates.push(result),
    {
      now: () => clock,
      refreshIntervalMs: CURRENT_CONDITIONS_REFRESH_INTERVAL_MS,
      retryCooldownMs: CURRENT_CONDITIONS_RETRY_COOLDOWN_MS,
      setIntervalFn: (handler, delayMs) => {
        assert.equal(delayMs, CURRENT_CONDITIONS_REFRESH_INTERVAL_MS);
        timerCallback = handler;
        return 1;
      },
      clearIntervalFn: (handle) => {
        assert.equal(handle, 1);
        clearedTimer = true;
      },
    },
  );
  await flushMicrotasks();
  assert.equal(calls, 1, 'a primeira consulta deve acontecer quando a rede estiver disponível');
  assert.equal(updates.length, 1);

  // Repeated network notifications must not start parallel/frequent HTTP calls.
  for (const listener of listeners) listener({ isConnected: true, isInternetReachable: true });
  await flushMicrotasks();
  assert.equal(calls, 1, 'rede estável não deve disparar consultas repetidas');

  // Going offline and returning on cellular data must trigger an immediate refresh.
  network = { isConnected: false, isInternetReachable: false };
  for (const listener of listeners) listener({ ...network });
  network = { isConnected: true, isInternetReachable: true };
  clock += 5000;
  for (const listener of listeners) listener({ ...network });
  await flushMicrotasks();
  assert.equal(calls, 2, 'recuperação da internet móvel deve atualizar a localização/clima');

  // Foreground periodic refresh is throttled to the configured interval.
  clock += CURRENT_CONDITIONS_REFRESH_INTERVAL_MS;
  timerCallback();
  await flushMicrotasks();
  assert.equal(calls, 3, 'a consulta deve renovar-se periodicamente sem depender de reconexão');

  stop();
  assert.equal(listeners.size, 0, 'a inscrição de rede deve ser removida ao desmontar');
  assert.equal(clearedTimer, true, 'o temporizador deve ser cancelado ao desmontar');
  timerCallback();
  await flushMicrotasks();
  assert.equal(calls, 3, 'não pode haver consultas após a desmontagem');

  // No network means no HTTP/location refresh; re-connection starts it later.
  network = { isConnected: false, isInternetReachable: false };
  const offlineListeners = new Set();
  let offlineCalls = 0;
  const stopOffline = startCurrentConditionsRefresh(
    {
      fetch: async () => ({ ...network }),
      addEventListener(listener) {
        offlineListeners.add(listener);
        return () => offlineListeners.delete(listener);
      },
    },
    async () => { offlineCalls += 1; return conditions(); },
    () => {},
    { now: () => clock, setIntervalFn: () => 2, clearIntervalFn: () => {} },
  );
  await flushMicrotasks();
  assert.equal(offlineCalls, 0, 'não deve consultar clima quando o sistema confirma ausência de internet');
  network = { isConnected: true, isInternetReachable: true };
  for (const listener of offlineListeners) listener({ ...network });
  await flushMicrotasks();
  assert.equal(offlineCalls, 1, 'a rede restabelecida deve iniciar a atualização');
  stopOffline();

  // Consecutive optional weather failures use bounded exponential backoff.
  let retryClock = 100;
  let retryCalls = 0;
  const retryListeners = new Set();
  const stopRetry = startCurrentConditionsRefresh(
    {
      fetch: async () => ({ isConnected: true, isInternetReachable: true }),
      addEventListener(listener) {
        retryListeners.add(listener);
        return () => retryListeners.delete(listener);
      },
    },
    async () => {
      retryCalls += 1;
      return conditions({ temperatureC: null, available: false, description: 'CLIMA INDISPONÍVEL' });
    },
    () => {},
    {
      now: () => retryClock,
      refreshIntervalMs: CURRENT_CONDITIONS_REFRESH_INTERVAL_MS,
      retryCooldownMs: 1000,
      setIntervalFn: () => 99,
      clearIntervalFn: () => {},
    },
  );
  await flushMicrotasks();
  assert.equal(retryCalls, 1);
  retryClock += 999;
  for (const listener of retryListeners) listener({ isConnected: true, isInternetReachable: true });
  await flushMicrotasks();
  assert.equal(retryCalls, 1, 'first retry must respect the base cooldown');
  retryClock += 1;
  for (const listener of retryListeners) listener({ isConnected: true, isInternetReachable: true });
  await flushMicrotasks();
  assert.equal(retryCalls, 2, 'first retry must be allowed at the base cooldown');
  retryClock += 1999;
  for (const listener of retryListeners) listener({ isConnected: true, isInternetReachable: true });
  await flushMicrotasks();
  assert.equal(retryCalls, 2, 'second retry must observe doubled cooldown');
  retryClock += 1;
  for (const listener of retryListeners) listener({ isConnected: true, isInternetReachable: true });
  await flushMicrotasks();
  assert.equal(retryCalls, 3, 'second retry must be allowed after doubled cooldown');
  stopRetry();

  console.log('weatherRefresh.test.js: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
