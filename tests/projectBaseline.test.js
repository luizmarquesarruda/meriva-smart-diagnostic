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
const pidCatalog = readJson('src/knowledge/pids.json');
const unitCatalog = readJson('src/knowledge/units.json');
const pidParser = read('src/obd/parser.ts');
const pidMap = read('docs/PID_FORMULA_MAP_2026-10-24.md');
const merivaSourceAudit = read('docs/MERIVA_OBD_SOURCE_AUDIT_2026-10-24.md');
const historicalObdAudit = read('docs/OBD_KNOWLEDGE_AUDIT_2026-10-08.md');
const testCommand = packageJson.scripts.test.split('&&').map((command) => command.trim());
const workflow = read('.github/workflows/ci.yml');
const elm = read('src/obd/elm327.ts');
const sharedObd = read('src/obd/sharedConnection.ts');
const home = read('app/index.tsx');
const cockpitTelemetry = read('src/obd/cockpitTelemetry.ts');
const laboratory = read('app/laboratorio.tsx');
const dataScreen = read('app/dados.tsx');
const tripService = read('src/trip/autoTripService.ts');
const liveTelemetry = read('src/obd/liveTelemetry.ts');
const diagnostics = read('src/diagnostics/diagnosticEngine.ts');
const sensorEngine = read('src/diagnostics/sensorTestEngine.ts');
const projectContract = read('docs/CONTRATO_ANTI_REGRESSAO.md');
const theme = read('src/ui/theme.ts');

// Documentation provenance and PID semantics must fail closed against silent regressions.
assert.match(read('README.md'), /MERIVA_OBD_SOURCE_AUDIT_2026-10-24\.md/);
assert.match(historicalObdAudit, /MERIVA_OBD_SOURCE_AUDIT_2026-10-24\.md/);
assert.match(projectContract, /\| RG-35 \|/);
assert.match(merivaSourceAudit, /manual do propriet.rio Meriva 2011\/2012 \*\*n.o fornece uma tabela de PIDs OBD-II/i);
assert.match(merivaSourceAudit, /C4 em SI . “monitor de filtro de part.culas de gasolina dispon.vel”/);
assert.doesNotMatch(merivaSourceAudit, /C4[^\n]{0,100}refrigerante do ar-condicionado/i);
assert.match(pidParser, /FILTRO_PARTICULAS_GASOLINA/);
assert.doesNotMatch(pidParser, /REFRIGERANTE_AR_CONDICIONADO/);
assert.match(pidMap, /C4.*filtro de part.culas de gasolina/i);
assert.doesNotMatch(pidMap, /C4[^\n]{0,100}refrigerante do ar-condicionado/i);
const pidById = new Map(pidCatalog.pids.map((pid) => [pid.pid, pid]));
assert.equal(pidById.get('0111').name, 'Absolute Throttle Position');
assert.equal(pidById.get('0145').name, 'Relative Throttle Position');
assert.equal(pidById.get('015A').name, 'Relative Accelerator Pedal Position');
assert.equal(pidById.get('0130').unit, 'warmup_cycles');
assert.equal(unitCatalog.units.warmup_cycles.symbol, 'ciclos');
assert.equal(pidById.get('0101').unit, 'dtc_count');
assert.ok(sensorCatalog.supportPolicy.confirmedPids.every((pid) => pid === '010C'),
  'o catálogo não deve promover PIDs à evidência real sem registro explícito');
assert.match(read('tests/regression.test.js'), /FILTRO_PARTICULAS_GASOLINA:NÃO PRONTO/);
assert.match(read('tests/regression.test.js'), /PID 0101 C4/);

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
  'cockpitTelemetry.test.js',
  'orientationLayout.test.js',
  'liveTelemetry.test.js',
  'bluetoothLifecycle.test.js',
  'connectionRecovery.test.js',
  'elm327Compatibility.test.js',
  'regression.test.js',
  'diagnosticEngine.test.js',
  'gps.test.js',
  'backgroundExecution.test.js',
  'tripRecorder.test.js',
  'autosaveTxtFormatter.test.js',
  'merivaAutosave.test.js',
  'autosaveValidation.test.js',
  'onlineConditions.test.js',
  'autonomyPresentation.test.js',
  'connectivity.test.js',
  'permissions.test.js',
  'screenTheme.test.js',
  'maintenanceRules.test.js',
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
assert.match(projectContract, /fila serial única/i);

// Bluetooth recovery must stay bounded and must never race an unconfirmed native socket.
const bluetoothRecovery = read('src/obd/connectionRecovery.ts');
const bluetoothTransport = read('src/obd/bluetoothClassicTransport.ts');
assert.match(bluetoothRecovery, /awaitNativeCleanupRetry/);
assert.match(bluetoothTransport, /awaitNativeCleanupRetry/);
assert.match(read('app/_layout.tsx'), /canStartObdStartup\(audit\)/);
assert.match(read('app/_layout.tsx'), /canUseGps\(audit\)/);
assert.ok(app.expo.plugins.includes('./plugins/withBluetoothLegacyPermissionLimits'));

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
assert.equal(packageJson.dependencies['@expo/vector-icons'], '14.1.0');
assert.equal(lock.packages['node_modules/@expo/vector-icons'].version, packageJson.dependencies['@expo/vector-icons']);
assert.equal(packageJson.dependencies['@react-native-community/netinfo'], '11.3.1');
assert.equal(packageJson.dependencies['expo-navigation-bar'], '~3.0.7');
assert.equal(lock.packages['node_modules/expo-navigation-bar'].version, '3.0.7',
  'plugin de barra nativa deve permanecer compatível com Expo SDK 51');
assert.deepEqual(lock.packages['node_modules/expo-navigation-bar'].peerDependencies, { expo: '*' });
assert.equal(packageJson.dependencies['expo-font'], '~12.0.10');
assert.equal(lock.packages['node_modules/expo-font'].version, '12.0.10');
assert.equal(lock.packages['node_modules/@react-native-community/netinfo'].version, packageJson.dependencies['@react-native-community/netinfo']);
assert.equal(app.expo.orientation, 'default', 'a orientação livre não deve ser bloqueada');
assert.ok(app.expo.plugins.some((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location'));
assert.equal(packageJson.dependencies['expo-splash-screen'], '~0.27.7',
  'a tela nativa de abertura é dependência necessária e não deve ser removida como pacote sem uso');
assert.equal(lock.packages[''].dependencies['expo-splash-screen'], '~0.27.7');
assert.equal(lock.packages['node_modules/expo-splash-screen'].version, '0.27.7');
assert.equal(app.expo.splash?.backgroundColor, '#07111f',
  'a splash nativa deve manter o fundo escuro da identidade visual');
assert.equal(app.expo.splash?.resizeMode, 'contain',
  'a imagem da splash, quando configurada, deve preservar a proporção');
assert.equal(app.expo.splash?.image, './assets/splash.png',
  'a splash nativa deve apontar para o asset visual versionado');
const splashPlugin = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-splash-screen');
assert.ok(splashPlugin, 'o plugin nativo expo-splash-screen precisa estar configurado explicitamente');
assert.equal(splashPlugin[1]?.image, './assets/splash.png');
assert.equal(splashPlugin[1]?.imageWidth, 280);
assert.equal(splashPlugin[1]?.resizeMode, 'contain');
assert.equal(splashPlugin[1]?.backgroundColor, '#07111f');
const splashAsset = fs.readFileSync(path.join(ROOT, 'assets/splash.png'));
assert.equal(splashAsset.subarray(0, 8).toString('hex'), '89504e470d0a1a0a',
  'asset de splash precisa ser um PNG real, não somente um caminho configurado');
assert.ok(splashAsset.length > 4000, 'asset de splash está vazio ou incompleto');

// Startup splash must gate the cockpit on a real ECU response and warm up supported PIDs.
const startup = read('app/splash.tsx');
const rootLayout = read('app/_layout.tsx');
assert.match(rootLayout, /initialRouteName="splash"/, 'o fluxo de inicialização deve começar na splash operacional');
assert.match(startup, /while \(!cancelled\)/, 'a busca do ELM327 deve continuar até conectar ou desmontar a tela');
assert.match(startup, /connection\.supportedPids/, 'a validação inicial deve usar apenas PIDs descobertos');
assert.match(startup, /round < 5/, 'cada PID suportado deve receber pelo menos cinco consultas iniciais');
assert.match(startup, /router\.replace\('\/'\)/, 'o painel só abre depois da etapa de conexão e aquecimento');
assert.match(startup, /settings\.autoConnectObd === false/, 'a preferência de conexão automática deve ser respeitada na splash');
assert.match(startup, /retry >= 2/, 'deve existir uma saída para o cockpit após falhas de conexão repetidas');
assert.match(startup, /accessibilityLabel="Abrir painel sem conexão OBD"/, 'a saída alternativa da splash precisa ser acessível');
assert.match(startup, /ABRIR PAINEL SEM CONEXÃO/, 'o usuário não pode ficar preso na splash quando não há ECU disponível');
assert.equal(app.expo.name, 'Smart OBD Diagnostic', 'a marca do app não deve ficar presa ao nome Meriva');

// Current cockpit expectations that previously regressed.
assert.match(home, /buildCockpitPidMetrics/, 'cockpit deve consumir o modelo dinâmico de PIDs');
for (const label of [
  'TEMPERATURA DO MOTOR',
  'VOLTAGEM DO SISTEMA',
  'POSIÇÃO ABSOLUTA DA BORBOLETA',
  'ROTAÇÃO DO MOTOR',
]) {
  assert.ok(cockpitTelemetry.includes("'" + label + "'"), 'indicador principal ausente no catálogo do cockpit: ' + label);
}
assert.match(home, /10_000/);
assert.match(home, /getCurrentAutonomyRangeKm/);
assert.match(home, /fuelLevelReadAtMs: tripState\.fuelLevelReadAtMs/);
assert.match(tripService, /fuelLevelReadAtMs/);
assert.match(read('src/trip/autonomyPresentation.ts'), /CURRENT_FUEL_LEVEL_STALE_AFTER_MS\s*=\s*30_000/);
assert.match(home, /coolantUnavailable/);
assert.ok(!tripService.includes('averageConsumptionKml * state.autonomy.tankCapacityL'),
  'autonomia não deve assumir tanque cheio sem nível real do PID 012F');
assert.ok(tripService.includes('estimateRangeFromFuelLevel(currentFuelLevelPercent, averageConsumptionKml)'),
  'autonomia persistida deve usar apenas nível de combustível atual');
assert.match(tripService, /isCurrentFuelLevelSample\(this\.state\.fuelLevelReadAtMs\)/);
assert.match(liveTelemetry, /!hasUsableTimestamp\(reading\.timestamp\)/, 'live samples must reject invalid or future timestamps at ingestion');
assert.match(liveTelemetry, /ageMs >= 0 && ageMs <= STALE_AFTER_MS/, 'operational context must reject timestamps from the future');
assert.match(tripService, /listener\(this\.getState\(\)\)/, 'new service subscribers must receive freshness-filtered state');
assert.match(tripService, /const snapshot = this\.getState\(\)/, 'service updates must emit freshness-filtered state');
assert.ok(!tripService.includes('estimatedRangeKm: persisted.autonomy.estimatedRangeKm'), 'current state cannot be seeded with saved range');
assert.ok(!tripService.includes('estimatedRangeKm: persistedAutonomy.estimatedRangeKm'), 'new ECU session cannot start from saved range');
assert.match(dataScreen, /getCurrentAutonomyRangeKm/, 'autonomia ao vivo deve depender do nível de combustível atual e válido');
assert.match(dataScreen, /currentAutonomyKm != null/, 'autonomia zero válida não deve ser confundida com dado ausente');
assert.doesNotMatch(dataScreen, /label="AUTONOMIA" value=\{trip\.estimatedRangeKm > 0/, 'a tela Dados não deve reutilizar a faixa estimada guardada como se fosse atual');
assert.doesNotMatch(dataScreen, /label="AUTONOMIA" value=\{state\.autonomy\.estimatedRangeKm/, 'real-time screen must not show persisted range as current');
assert.ok(!home.includes('actionGrid') && !home.includes('dashboardAction'),
  'cockpit não deve duplicar destinos em uma segunda fileira de ações');
assert.ok(read('app/mais.tsx').includes('CONSULTA MANUAL DE PID'), 'atalho de consulta manual precisa existir');
assert.ok(read('app/laboratorio.tsx').includes('PIDs REGISTRADOS / DESCOBERTOS'), 'lista de PIDs precisa continuar acessível');
assert.match(laboratory, /result\.status !== 'OK'/, 'DTC read must not interpret command error as no failures');
assert.match(laboratory, /isValidDtcResponseForService\('03', result\.response\)/, 'DTC read must validate a complete response');
assert.match(read('src/obd/dtcScanner.ts'), /reply\.status === 'OK' && isValidDtcResponseForService/, 'bulk scan requires valid response data');

assert.match(theme, /SCREEN_TITLE_STYLE/);
assert.match(read('tests/screenTheme.test.js'), /Shared screen theme and title contract/);

// Critical acceptance plan must stay versioned with the anti-regression contract.
const testPlan = read('docs/TEST_PLAN.md');
assert.match(testPlan, /OBD-01/);
assert.match(testPlan, /DATA-02/);
assert.match(testPlan, /SPLASH-01/);
assert.match(testPlan, /teste físico/);
assert.match(read('docs/CONTRATO_ANTI_REGRESSAO.md'), /\| RG-20 \|/);

assert.ok(read('app/mais.tsx').includes('/manutencao'), 'manutenção e abastecimento deve continuar acessível pelo menu Mais');
assert.match(read('src/maintenance/maintenanceRules.ts'), /evaluateMaintenance/);
assert.match(read('src/database/maintenanceStorage.ts'), /writeMaintenanceData/);
assert.ok(scriptedTests.has('maintenanceRules.test.js'), 'regras de manutenção precisam ser testadas pelo npm test');
console.log('Anti-regression baseline gate: PASS');
console.log('Protected contracts: five-read sensor tests, manual PID flow, single ELM327 queue, offline diagnosis, Expo SDK 51, GPS/Trip, TXT/history and cockpit/graphs.');
