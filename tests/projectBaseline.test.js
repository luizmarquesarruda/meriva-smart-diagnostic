'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const readJson = (relativePath) => JSON.parse(read(relativePath));

const packageJson = readJson('package.json');
const lock = readJson('package-lock.json');
const app = readJson('app.json');
const sensorCatalog = readJson('src/knowledge/sensor_tests.json');
const testCommand = packageJson.scripts.test.split('&&').map((command) => command.trim());
const workflow = read('.github/workflows/ci.yml');
const elm = read('src/obd/elm327.ts');
const sharedObd = read('src/obd/sharedConnection.ts');
const home = read('app/index.tsx');
const diagnostics = read('src/diagnostics/diagnosticEngine.ts');
const sensorEngine = read('src/diagnostics/sensorTestEngine.ts');
const projectContract = read('docs/CONTRATO_ANTI_REGRESSAO.md');

// Gate itself must be a first-class CI step, not a note in the diary.
assert.equal(packageJson.scripts['gate:baseline'], 'node tests/projectBaseline.test.js');
assert.match(workflow, /name: Run anti-regression baseline gate[\s\S]*?run: npm run gate:baseline/);
assert.equal(packageJson.scripts.validate, 'npm run typecheck && npm test');

// Regression-sensitive suites must remain connected to npm test.
// Removing a test file from the script must fail this gate before merge.
const requiredSuites = [
  'sensorTestEngine.test.js',
  'knowledgeJson.test.js',
  'cockpitNavigation.test.js',
  'orientationLayout.test.js',
  'liveTelemetry.test.js',
  'bluetoothLifecycle.test.js',
  'elm327Compatibility.test.js',
  'regression.test.js',
  'diagnosticEngine.test.js',
  'gps.test.js',
  'backgroundExecution.test.js',
  'tripRecorder.test.js',
  'autosaveTxtFormatter.test.js',
  'merivaAutosave.test.js',
  'onlineConditions.test.js',
];
const scriptedTests = new Set(testCommand.map((command) => {
  const match = command.match(/^node tests\/([A-Za-z0-9._-]+)$/);
  return match ? match[1] : null;
}).filter(Boolean));
for (const suite of requiredSuites) {
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', suite)), 'suite essencial ausente: ' + suite);
  assert.ok(scriptedTests.has(suite), 'suite essencial não ligada a npm test: ' + suite);
}

// Prevent the known 3 -> 5 readings regression at both data and execution layers.
assert.equal(sensorCatalog.minimumReadingsPerPid, 5, 'o contrato global exige cinco leituras por PID');
assert.ok(sensorCatalog.tests.length > 0, 'catálogo de testes não pode ficar vazio');
for (const test of sensorCatalog.tests) {
  assert.equal(test.minimumReadings, 5, 'PID com mínimo diferente de cinco leituras: ' + test.pid);
}
assert.match(sensorEngine, /MIN_SENSOR_TEST_READINGS\s*=\s*catalog\.minimumReadingsPerPid/);
assert.match(sensorEngine, /validRows/);
assert.match(sensorEngine, /average\(/);
assert.match(projectContract, /cinco tentativas sequenciais/i);
assert.match(projectContract, /uma única fila serial/i);

// The ELM protocol must serialize all commands through the shared session queue.
assert.match(elm, /private commandQueue:\s*Promise<void>\s*=\s*Promise\.resolve\(\)/);
assert.match(elm, /return this\.enqueueCommand\(\(\) => this\.command\(normalized\)\)/);
assert.match(elm, /return previous\.then\(operation\)\.finally\(\(\) => release\(\)\)/);
assert.match(sharedObd, /let active: SharedObdConnection \| null = null/);
assert.match(sharedObd, /let connecting: Promise<SharedObdConnection> \| null = null/);
assert.ok(!read('app/_layout.tsx').includes('connectPreferredElm'), 'layout não pode criar uma segunda conexão automática');

// Local diagnosis stays separate from optional network enrichment.
assert.match(diagnostics, /diagnostic_rules\.json/);
assert.doesNotMatch(diagnostics, /currentConditions|open-meteo|https?:\/\//i);
assert.match(home, /loadCurrentConditions/);
assert.match(read('tests/onlineConditions.test.js'), /offline/);
assert.match(read('tests/onlineConditions.test.js'), /without existing permission/);

// Preserve core runtime configuration and reproducible package graph.
assert.equal(packageJson.dependencies.expo, '~51.0.39', 'Expo SDK 51 range altered without approved migration');
assert.equal(lock.packages[''].dependencies.expo, packageJson.dependencies.expo);
assert.equal(lock.packages[''].dependencies['react-native'], packageJson.dependencies['react-native']);
assert.deepEqual(lock.packages[''].dependencies, packageJson.dependencies, 'package.json e lockfile divergiram');
assert.deepEqual(lock.packages[''].devDependencies, packageJson.devDependencies, 'devDependencies e lockfile divergiram');
assert.equal(app.expo.orientation, 'default', 'a orientação livre não deve ser bloqueada');
assert.ok(app.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location'));

// Current cockpit expectations that previously regressed.
for (const label of [
  'TEMPERATURA DO MOTOR',
  'VOLTAGEM DO SISTEMA',
  'POSIÇÃO DA BORBOLETA',
  'ROTAÇÃO DO MOTOR',
]) {
  assert.ok(home.includes("label: '" + label + "'"), 'indicador principal ausente: ' + label);
}
assert.match(home, /10_000/);
assert.ok(read('app/mais.tsx').includes('CONSULTA MANUAL DE PID'), 'atalho de consulta manual precisa existir');
assert.ok(read('app/laboratorio.tsx').includes('PIDs REGISTRADOS / DESCOBERTOS'), 'lista de PIDs precisa continuar acessível');

console.log('Anti-regression baseline gate: PASS');
console.log('Protected contracts: five-read sensor tests, manual PID flow, single ELM327 queue, offline diagnosis, Expo SDK 51, GPS/Trip, TXT/history and cockpit/graphs.');
