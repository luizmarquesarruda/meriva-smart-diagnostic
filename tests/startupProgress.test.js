'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src', 'ui', 'startupProgress.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;
const compiled = new Module(sourcePath, module);
compiled.filename = sourcePath;
compiled.paths = Module._nodeModulePaths(path.dirname(sourcePath));
compiled._compile(output, sourcePath);
const { getStartupProgress, getStartupHideDelayMs, STARTUP_MIN_DURATION_MS, STARTUP_TIMEOUT_MS } = compiled.exports;

const base = {
  hydrated: true,
  settingsLoaded: true,
  autoConnect: true,
  searching: true,
  ecuConnected: false,
  lifecycle: 'BLUETOOTH_CONNECTING',
  error: null,
  timedOut: false,
};

assert.equal(STARTUP_MIN_DURATION_MS, 6000);
assert.equal(STARTUP_TIMEOUT_MS, 30000);

const loading = getStartupProgress({ ...base, hydrated: false });
assert.equal(loading.percent, 8);
assert.equal(loading.terminal, 'progress');

const bluetooth = getStartupProgress({ ...base, lifecycle: 'BLUETOOTH_ON' });
assert.equal(bluetooth.percent, 20);
assert.match(bluetooth.title, /LOCALIZANDO ADAPTADOR/);

const connecting = getStartupProgress(base);
assert.equal(connecting.percent, 40);
assert.match(connecting.title, /CONECTANDO ADAPTADOR/);

const elmReady = getStartupProgress({ ...base, lifecycle: 'ELM_INITIALIZED' });
assert.equal(elmReady.percent, 78);
assert.equal(elmReady.terminal, 'progress');

const ecuReady = getStartupProgress({ ...base, searching: false, lifecycle: 'READY', ecuConnected: true });
assert.equal(ecuReady.percent, 100);
assert.equal(ecuReady.terminal, 'ready');
assert.match(ecuReady.detail, /resposta OBD real/);

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
assert.match(timedOut.detail, /tentativa OBD existente/i);

// The splash cannot close early, and a slow connection cannot hold the user indefinitely.
assert.equal(getStartupHideDelayMs({ elapsedMs: 1000, terminal: 'ready', timedOut: false }), 5000);
assert.equal(getStartupHideDelayMs({ elapsedMs: 5900, terminal: 'ready', timedOut: false }), 700);
assert.equal(getStartupHideDelayMs({ elapsedMs: 1000, terminal: 'progress', timedOut: false }), null);
assert.equal(getStartupHideDelayMs({ elapsedMs: 31000, terminal: 'offline', timedOut: true }), 1200);

// UI contract: existing home remains the sole owner of the connection.
const dashboard = fs.readFileSync(path.join(ROOT, 'app', 'index.tsx'), 'utf8');
const screen = fs.readFileSync(path.join(ROOT, 'src', 'ui', 'StartupScreen.tsx'), 'utf8');
assert.match(dashboard, /getStartupProgress\(/);
assert.match(dashboard, /<StartupScreen progress=\{startupProgress\} \/>/);
assert.match(dashboard, /STARTUP_TIMEOUT_MS/);
assert.match(dashboard, /useState\(\(\) => !startupScreenConsumed\)/);
assert.match(screen, /accessibilityRole="progressbar"/);
assert.match(screen, /SMART OBD/);
assert.match(screen, /OBD-II/);
assert.doesNotMatch(screen, /connectPreferredElm/, 'tela de abertura não pode iniciar outra sessão OBD');
console.log('startupProgress.test.js: PASS');
