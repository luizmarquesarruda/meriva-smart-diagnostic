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
const cockpitTelemetry = read('src/obd/cockpitTelemetry.ts');
const laboratory = read('app/laboratorio.tsx');
const dataScreen = read('app/dados.tsx');
const tripService = read('src/trip/autoTripService.ts');
const liveTelemetry = read('src/obd/liveTelemetry.ts');
const weatherRefresh = read('src/weather/conditionsRefresh.ts');
const gpsTracker = read('src/gps/gpsTracker.ts');
const diagnostics = read('src/diagnostics/diagnosticEngine.ts');
const sensorEngine = read('src/diagnostics/sensorTestEngine.ts');
const projectContract = read('docs/CONTRATO_ANTI_REGRESSAO.md');
const diary = read('docs/DIARIO_DE_BORDO.md');
const theme = read('src/ui/theme.ts');

// Gate itself must be a first-class CI step, not a note in the diary.
assert.equal(packageJson.scripts['gate:baseline'], 'node tests/projectBaseline.test.js');
assert.match(workflow, /name: Run anti-regression baseline gate[\s\S]*?run: npm run gate:baseline/);
assert.equal(packageJson.scripts.validate, 'npm run typecheck && npm test');

// Regression-sensitive suites must remain connected to npm test.
// Removing a test file from the script must fail this gate before merge.
const requiredSuites = [
  'pidParserIntegrity.test.js',
  'weatherRefresh.test.js',
  'bluetoothRadioRecovery.test.js',
  'pidFormulaBoundaries.test.js',
  'dtcScanner.test.js',
  'fuelConsumption.test.js',
  'fuelIdentification.test.js',
  'bluetoothConfig.test.js',
  'bluetoothState.test.js',
  'ecuHealth.test.js',
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
  'onlineConditions.test.js',
  'autonomyPresentation.test.js',
  'autonomyBuffer.test.js',
  'fuelBalance.test.js',
  'connectivity.test.js',
  'permissions.test.js',
  'screenTheme.test.js',
  'maintenanceRules.test.js',
  'sqliteTripHistory.test.js',
];
const scriptedTests = new Set(testCommand.map((command) => {
  const match = command.match(/^node tests\/([A-Za-z0-9._-]+)$/);
  return match ? match[1] : null;
}).filter(Boolean));
for (const suite of requiredSuites) {
  assert.ok(fs.existsSync(path.join(ROOT, 'tests', suite)), 'suite essencial ausente: ' + suite);
  assert.ok(scriptedTests.has(suite), 'suite essencial não ligada a npm test: ' + suite);
}

// Every test file must run via npm test; the baseline gate itself is run separately by CI.
const testFilesOnDisk = fs.readdirSync(path.join(ROOT, 'tests'))
  .filter((file) => file.endsWith('.test.js') && file !== 'projectBaseline.test.js')
  .sort();
assert.deepEqual(
  [...scriptedTests].sort(),
  testFilesOnDisk,
  'todo arquivo tests/*.test.js deve estar ligado ao npm test; projectBaseline roda no gate separado',
);

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
const bluetoothConfig = readJson('src/knowledge/bluetooth_config.json');
assert.equal(bluetoothConfig.retry.maxAttempts, 3, 'tentativas Bluetooth por adaptador precisam permanecer limitadas');
assert.equal(bluetoothConfig.retry.intervalMs, 1500, 'intervalo de retry deve evitar esperas longas entre falhas');
const bluetoothManagerSource = read('src/obd/bluetoothManager.ts');
assert.match(bluetoothManagerSource, /shouldRetryElmSessionAttempt/,
  'falha após varredura completa da ECU não deve disparar a mesma varredura repetidamente');
assert.ok(bluetoothManagerSource.includes("['5', '3', '4', '6', '7', '8', '9', '2', '1']"),
  'fallback precisa incluir SAE J1850 VPW/PWM além de KWP e CAN');
const elmCompatibilitySource = read('src/obd/elm327Compatibility.ts');
assert.match(elmCompatibilitySource, /maxConnectionAttempts: 0/,
  'sem override, o manager deve deferir ao limite finito do catálogo');
assert.match(elmCompatibilitySource, /export function resolveMaxConnectionAttempts/);
assert.match(bluetoothManagerSource, /resolveMaxConnectionAttempts\(/,
  'o limite usado no laço de retry deve resolver a configuração padrão e o override explicitamente');
assert.match(read('tests/elm327Compatibility.test.js'), /resolveMaxConnectionAttempts\(defaults\.maxConnectionAttempts, 3\), 3/,
  'a política padrão efetiva de retry deve ser testada');
assert.match(elmCompatibilitySource, /export function getRecoveryProtocolCommand/);
assert.match(read('src/obd/elm327.ts'), /getRecoveryProtocolCommand\(this\.protocol\)/,
  'recuperação deve usar o protocolo identificado em vez de forçar ATSP5 para todo KWP');
assert.match(read('tests/elm327Compatibility.test.js'), /KWP 5BAUD/,
  'o mapeamento de recuperação precisa ter regressão para KWP lento');
assert.match(bluetoothTransport, /MAX_ELM_RX_BUFFER_CHARS\s*=\s*16\s*\*\s*1024/);
assert.match(bluetoothTransport, /RX_DIAGNOSTIC_PREVIEW_CHARS\s*=\s*256/);
assert.match(bluetoothTransport, /RX_BUFFER_OVERFLOW/);
const bluetoothRadioPolicy = read('src/obd/bluetoothRadioRecovery.ts');
assert.match(bluetoothTransport, /decideBluetoothRadioRecovery/);
assert.match(read('src/obd/bluetoothManager.ts'), /getBluetoothRadioRecoveryStopReason/);
assert.match(read('app/splash.tsx'), /getBluetoothRadioRecoveryStopReason/);
assert.match(bluetoothRadioPolicy, /STOP_RADIO_STATE_UNKNOWN/);
assert.match(projectContract, /\| RG-34 \|/, 'radio recovery must remain a documented acceptance invariant');
assert.match(projectContract, /\| RG-37 \|/, 'concurrent RFCOMM waiters must remain a documented invariant');
assert.match(projectContract, /\| RG-38 \|/, 'GPS must reject invalid/out-of-order timestamps');
assert.match(gpsTracker, /!Number\.isFinite\(location\.timestamp\) \|\| location\.timestamp <= 0/);
assert.ok(gpsTracker.includes('location.timestamp > Date.now()'), 'future GPS fixes must be rejected at ingestion');
assert.match(gpsTracker, /location\.timestamp <= this\.previous\.timestamp/);
assert.doesNotMatch(gpsTracker, /timestamp:\s*Date\.now\(\)/, 'GPS must not fabricate timestamps');
assert.match(gpsTracker, /export const GPS_SAMPLE_STALE_AFTER_MS = 5_000/);
assert.match(gpsTracker, /const MAX_SEGMENT_GAP_MS = GPS_SAMPLE_STALE_AFTER_MS/);
assert.match(gpsTracker, /export function isGpsSampleFresh\(/);
assert.match(read('src/gps/index.ts'), /isGpsSampleFresh/);
assert.match(read('tests/gps.test.js'), /isGpsSampleFresh/);
const regressionRequirementIds = [...projectContract.matchAll(/^\| (RG-\d{2}) \|/gm)].map((match) => match[1]);
assert.ok(regressionRequirementIds.length > 0, 'o contrato anti-regressão não pode ficar vazio');
assert.equal(new Set(regressionRequirementIds).size, regressionRequirementIds.length, 'o contrato contém IDs RG duplicados');
for (let index = 0; index < regressionRequirementIds.length; index++) {
  assert.equal(
    regressionRequirementIds[index],
    'RG-' + String(index + 1).padStart(2, '0'),
    'IDs RG devem estar contínuos e ordenados; erro na posição ' + (index + 1),
  );
}
assert.match(bluetoothTransport, /BUFFER RX ELM EXCEDIDO/);
const pidDiscovery = read('src/obd/intelligentPidDiscovery.ts');
assert.match(pidDiscovery, /responseBuffer:\s*responseBuffer\.snapshot\(\)/);
assert.match(read('src/obd/pidDiscoveryBuffer.ts'), /MAX|capacity/);
assert.match(read('src/obd/pidScanner.ts'), /extractBitmapPayload/);
assert.match(read('src/obd/pidScanner.ts'), /validAdditiveChecksum/);
assert.match(read('src/obd/bluetoothManager.ts'), /PID_DISCOVERY_SUMMARY/);
assert.match(read('src/obd/parser.ts'), /hasValidKLineChecksum/);
assert.match(read('src/obd/dtcParser.ts'), /validAdditiveChecksum/);
assert.match(read('src/storage/driveCycleStorage.ts'), /LEGACY_TRIP_HISTORY_INVALID/);
assert.match(read('src/storage/driveCycleStorage.ts'), /ensureSqliteMigration/);
assert.match(read('src/storage/driveCycleStorage.ts'), /restoreDriveCyclesFromBackup/);
assert.match(read('src/storage/driveCycleStorage.ts'), /withTransactionAsync/);
assert.match(read('src/storage/driveCycleStorage.ts'), /SQLITE_MIGRATION_KEY/);
assert.match(read('src/storage/driveCycleStorage.ts'), /LEGACY_TRIP_HISTORY_DUPLICATE_IDS/);
assert.match(read('tests/sqliteTripHistory.test.js'), /idempotent/);
assert.match(read('src/storage/driveCycleStorage.ts'), /indexWriteQueues/);
assert.match(read('src/database/csvLogger.ts'), /MAX_PENDING_CSV_ROWS/);
assert.match(read('app/armazenamento.tsx'), /csvQueueStatus\.droppedRows/);
assert.match(read('app/armazenamento.tsx'), /csvQueueStatus\.pendingRows/);
assert.match(read('src/database/csvLogger.ts'), /parseCsvRecords/);
assert.match(read('src/storage/quotaManager.ts'), /cleanupToTarget/);
assert.match(read('src/storage/quotaManager.ts'), /TAMANHO_DE_ARQUIVO_INDISPONIVEL/);
assert.match(read('src/storage/backup.ts'), /MAX_BACKUPS_TO_KEEP\s*=\s*5/);
assert.match(read('src/storage/backup.ts'), /manifest\.json/);
assert.match(read('src/meriva/autosaveValidation.ts'), /validateDriveCycles/);
assert.match(read('src/meriva/autosaveValidation.ts'), /validateDtcs/);
assert.match(read('src/gps/gpsTracker.ts'), /c\.latitude < -90/);
assert.ok(gpsTracker.includes('const MAX_ACCEPTED_SEGMENT_KM = 0.25'), 'GPS must reject implausible jumps above 250 m');
assert.ok(gpsTracker.includes('minimumSegmentDistanceM'), 'GPS per-segment minimum must account for the provider interval');
assert.ok(gpsTracker.includes('netDisplacementKm * 1000 >= requiredNetDisplacementM'), 'GPS distance must require accurate net displacement');
assert.ok(gpsTracker.includes('this.movementEstablished'), 'GPS speed must require confirmed movement');
assert.ok(read('tests/gps.test.js').includes('movimento real de 10 km/h não deve ser rejeitado'), 'GPS movement must be confirmed at urban speed');
assert.ok(read('tests/gps.test.js').includes('posição final não confirma deslocamento líquido'), 'GPS drift must fail net-displacement validation');
assert.match(read('docs/TEST_PLAN.md'), /GPS-03/);
assert.ok(read('docs/GPS_IMPLEMENTATION_AUDIT_2026-10-27.md').includes('Fused Location Provider') && read('docs/GPS_IMPLEMENTATION_AUDIT_2026-10-27.md').includes('4G/5G'));
assert.ok(projectContract.includes('| RG-62 |'), 'GPS slow-motion and drift requirements must remain protected');
assert.ok(gpsTracker.includes('GPS_NETWORK_REFRESH_INTERVAL_MS = 30_000'), 'GPS must periodically inspect stale fixes while cellular connectivity is available');
assert.ok(gpsTracker.includes('GPS_NETWORK_REFRESH_COOLDOWN_MS = 30_000'), 'GPS recovery requests must be throttled');
assert.ok(gpsTracker.includes('GPS_NETWORK_REFRESH_TIMEOUT_MS = 8_000'), 'GPS recovery requests must be bounded');
assert.ok(gpsTracker.includes('refreshLocationAfterNetworkChange'), 'a stale GPS fix can be reacquired once after a network/provider transition');
assert.ok(gpsTracker.includes("this.state.signalQuality !== 'SEM_FIX' && isGpsSampleFresh"), 'poor-quality GPS fixes must not suppress reacquisition');
assert.ok(gpsTracker.includes('trackingGeneration !== this.trackingGeneration'), 'late one-shot GPS results must be rejected after stop/restart');
assert.ok(read('tests/gps.test.js').includes('resposta assíncrona da sessão encerrada'), 'GPS lifecycle race must have a behavioral regression test');
assert.ok(projectContract.includes('| RG-63 |'), 'GPS refresh lifecycle and usable-fix quality must remain contractual');
assert.ok(tripService.includes("NetInfo.addEventListener"), 'trip service must observe network transitions without creating location watchers');
assert.ok(tripService.includes("network.details.cellularGeneration"), 'cellular generation changes (4G/5G) must be detectable');
assert.ok(read('tests/gps.test.js').includes('cooldown impede nova requisição'), 'network refresh cooldown must have a behavioral regression test');
assert.match(read('src/obd/fuelConsumption.ts'), /temperatureK <= 0/);
assert.match(read('app/_layout.tsx'), /canStartObdStartup\(audit\)/);
assert.match(read('app/_layout.tsx'), /canUseGps\(audit\)/);
assert.ok(app.expo.plugins.includes('./plugins/withBluetoothLegacyPermissionLimits'));

// The ELM protocol must serialize all commands through the shared session queue.
assert.match(elm, /private commandQueue:\s*Promise<void>\s*=\s*Promise\.resolve\(\)/);
assert.match(elm, /return this\.enqueueCommand\(\(\) => this\.command\(normalized, 1, timeoutOverrideMs\)\)/, 'optional probe timeout must stay inside the serialized ELM command queue');
assert.match(elm, /return previous\.then\(\(\) => \{/,
  'ELM queue must execute accepted operations serially after measuring queue wait');
assert.match(elm, /\.finally\(\(\) => \{\s*release\(\);/,
  'ELM queue gate must release the next operation in its finally block even when the current one rejects');
assert.match(elm, /this\.pendingQueueDepth >= ELM_MAX_PENDING_COMMANDS/,
  'ELM queue must apply backpressure before accepting more ordinary commands');
assert.match(elm, /allowWhenSaturated: true/,
  'reserved teardown/recovery operations must remain serializable under saturation');
assert.match(sharedObd, /let active: SharedObdConnection \| null = null/);
assert.match(sharedObd, /let connecting: Promise<SharedObdConnection> \| null = null/);
assert.ok(!read('app/_layout.tsx').includes('connectPreferredElm'), 'layout não pode criar uma segunda conexão automática');

// Local diagnosis stays separate from optional network enrichment.
assert.match(home, /startCurrentConditionsRefresh/, 'weather/location enrichment must refresh beyond initial mount');
assert.match(weatherRefresh, /CURRENT_CONDITIONS_REFRESH_INTERVAL_MS/);
assert.match(weatherRefresh, /isInternetReachable !== false/);
assert.match(weatherRefresh, /inFlight/, 'weather refresh must not overlap concurrent HTTP requests');
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

// Startup validates the current ECU and opens without redundant warm-up commands.
const startup = read('app/splash.tsx');
const rootLayout = read('app/_layout.tsx');
assert.match(rootLayout, /initialRouteName="splash"/, 'o fluxo de inicialização deve começar na splash operacional');
assert.match(startup, /while \(!cancelled\)/, 'a busca do ELM327 deve continuar até conectar ou desmontar a tela');
assert.match(startup, /connection\.supportedPids/, 'a validação inicial deve usar apenas PIDs descobertos');
assert.doesNotMatch(startup, /round < 5/, 'a splash não pode repetir cinco consultas redundantes por PID');
assert.match(startup, /PIDs COM RESPOSTA VÁLIDA/, 'a splash deve informar a contagem de PIDs confirmados');
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
assert.match(home, /rollingConsumptionKml: tripState\.rollingConsumptionKml/);
assert.match(home, /href="\/autonomia"/, 'o cockpit deve abrir a tela completa da autonomia ao tocar no cartão');
const autonomyScreen = read('app/autonomia.tsx');
assert.match(autonomyScreen, /ESTIMADA · BUFFER/, 'a tela de autonomia precisa identificar o fallback temporário');
assert.match(autonomyScreen, /subscribeSharedObdStatus/, 'o estado da ECU exibido na tela deve ser real e atualizado');
assert.match(autonomyScreen, /getCurrentAutonomyRangeKm/, 'a tela deve reutilizar o contrato único de cálculo de autonomia');
assert.match(autonomyScreen, /linearidade do PID 012F não calibrada/i, 'a UI não pode sugerir uma calibração física não verificada');
assert.doesNotMatch(autonomyScreen, /level:\s*42|consumption:\s*8\.4|age:\s*44/, 'valores demonstrativos do protótipo não podem entrar na produção');
assert.match(read('src/trip/autonomyPresentation.ts'), /BUFFER_FUEL_LEVEL_MAX_AGE_MS\s*=\s*60_000/);
assert.match(read('src/trip/autonomyPresentation.ts'), /MIN_BUFFER_FUEL_LEVEL_SAMPLES\s*=\s*2/);
assert.match(tripService, /fuelLevelBufferPercent/);
assert.match(projectContract, /\| RG-51 \|/, 'fallback de autonomia precisa de contrato anti-regressão próprio');
assert.match(read('docs/TEST_PLAN.md'), /DATA-04/, 'a janela temporária de autonomia precisa constar no plano de aceitação');
assert.match(dataScreen, /rollingConsumptionKml: trip\.rollingConsumptionKml/);
assert.match(tripService, /this\.autonomyBuffer\.addFuelLevelSample/);
assert.match(tripService, /this\.autonomyBuffer\.addFuelFlowSample/);
assert.match(read('src/trip/autonomyPresentation.ts'), /input\.rollingConsumptionKml/);
assert.match(read('src/trip/autonomyPresentation.ts'), /fallbackFuelRemainingL/);
const autonomyBufferSource = read('src/trip/autonomyBuffer.ts');
assert.doesNotMatch(autonomyBufferSource, /MIN_MOVING_SPEED_KMH/,
  'o buffer não pode descartar combustível consumido em baixa velocidade ou marcha lenta');
assert.match(autonomyBufferSource, /Number\.isFinite\(distanceKm\) && distanceKm >= 0/,
  'intervalos estacionários precisam contribuir combustível sem acrescentar distância');
assert.match(read('src/trip/fuelBalance.ts'), /trip\.fuelDataValid !== true/,
  'o balanço do tanque exige evidência explícita de consumo válido');
assert.match(read('tests/fuelBalance.test.js'), /fuelDataValid: undefined/,
  'registro legado sem validade conhecida precisa de regressão');
assert.match(read('src/trip/fuelBalance.ts'), /item\.fullTank === true/);
assert.match(read('app/manutencao.tsx'), /accessibilityLabel="Abastecimento completou o tanque"/);
assert.match(home, /fallbackFuelRemainingL: fuelBalanceFallback\?\.remainingFuelL/);
assert.match(dataScreen, /fallbackFuelRemainingL: fuelBalanceFallback\?\.remainingFuelL/);
assert.match(home, /fuelLevelReadAtMs: tripState\.fuelLevelReadAtMs/);
assert.match(tripService, /fuelLevelReadAtMs/);
assert.match(read('src/trip/autonomyPresentation.ts'), /CURRENT_FUEL_LEVEL_STALE_AFTER_MS\s*=\s*30_000/);
assert.match(read('src/trip/autonomyBuffer.ts'), /AUTONOMY_BUFFER_FUEL_LEVEL_WINDOW_MS\s*=\s*60_000/,
  'fuel-level median must not retain older values without a time bound');
assert.match(read('src/trip/autonomyBuffer.ts'), /elapsedMs > AUTONOMY_BUFFER_MAX_INTERVAL_MS[\s\S]*this\.flowIntervals = \[\]/,
  'rolling consumption intervals must reset after telemetry gaps');
assert.match(read('src/obd/fuelConsumption.ts'), /noteMissingSample|hasGap/,
  'fuel integration must expose missing-data continuity');
assert.match(read('src/trip/tripRecorder.ts'), /!this\.fuelIntegrator\.hasGap\(\)/,
  'a trip with a long fuel-flow gap must not publish km/L');
assert.match(read('src/trip/fuelBalance.ts'), /calculatedConsumptionKml/,
  'full-tank fallback must cross-check trip litres against distance and average');
assert.match(read('src/trip/fuelBalance.ts'), /tripEvents\[index\]\.startedAtMs < tripEvents\[index - 1\]\.atMs/,
  'overlapping recorded trips must invalidate the fuel balance');
assert.match(home, /fuelDataValid: tripState\.consumptionKml != null/,
  'active-trip fuel balance must require reliable current-trip consumption');
assert.match(projectContract, /\\| RG-49 \\|/,
  'fuel-level and rolling-flow continuity must remain in the anti-regression contract');
assert.match(projectContract, /\\| RG-50 \\|/,
  'fuel-balance fallback validation must remain in the anti-regression contract');
assert.match(home, /coolantUnavailable/);
assert.ok(!tripService.includes('averageConsumptionKml * state.autonomy.tankCapacityL'),
  'autonomia não deve assumir tanque cheio sem nível real do PID 012F');
assert.ok(tripService.includes('estimateRangeFromFuelLevel(currentFuelLevelPercent, averageConsumptionKml)'),
  'autonomia persistida deve usar apenas nível de combustível atual');
assert.match(tripService, /isCurrentFuelLevelSample\(this\.state\.fuelLevelReadAtMs\)/);
assert.match(liveTelemetry, /!hasUsableTimestamp\(reading\.timestamp\)/, 'live samples must reject invalid or future timestamps at ingestion');
assert.match(liveTelemetry, /ageMs >= 0 && ageMs <= STALE_AFTER_MS/, 'operational context must reject timestamps from the future');
assert.match(elm, /export const ELM_MAX_PENDING_COMMANDS = 16;/, 'ELM must bound pending ordinary commands');
assert.match(elm, /queueRejections/, 'ELM queue saturation must be observable');
assert.match(projectContract, /\\| RG-47 \\|/, 'ELM queue backpressure must remain in the anti-regression contract');
const csvLogger = read('src/database/csvLogger.ts');
assert.match(csvLogger, /CSV_LOG_SEGMENT_MAX_BYTES = 1_048_576/, 'high-volume CSV must use bounded segments');
assert.match(csvLogger, /selectWritableLogCsv/, 'CSV rotation must remain isolated to LOGS');
assert.match(projectContract, /\\| RG-48 \\|/, 'CSV rotation must remain in the anti-regression contract');
assert.match(read('docs/TEST_PLAN.md'), /ELM-QUEUE-01/, 'ELM queue saturation requires an explicit test case');
assert.match(read('docs/TEST_PLAN.md'), /CSV-ROTATE-01/, 'CSV rotation requires an explicit test case');
assert.ok(liveTelemetry.includes('const MAX_TRACKED_PIDS = 64;'), 'live PID streams must have a bounded global capacity');
assert.ok(liveTelemetry.includes('function isValidMode01Pid(pid: string): boolean'), 'live telemetry must validate PID identifiers');
assert.match(projectContract, /\| RG-46 \|/, 'global live telemetry capacity must remain in the anti-regression contract');
assert.match(read('docs/TEST_PLAN.md'), /TELEM-BUF-01/, 'bounded live telemetry needs an explicit acceptance case');
assert.match(tripService, /listener\(this\.getState\(\)\)/, 'new service subscribers must receive freshness-filtered state');
assert.match(tripService, /const snapshot = this\.getState\(\)/, 'service updates must emit freshness-filtered state');
assert.ok(!tripService.includes('estimatedRangeKm: persisted.autonomy.estimatedRangeKm'), 'current state cannot be seeded with saved range');
assert.ok(!tripService.includes('estimatedRangeKm: persistedAutonomy.estimatedRangeKm'), 'new ECU session cannot start from saved range');
assert.match(dataScreen, /const currentAutonomyKm = getCurrentAutonomyRangeKm\(\{/);
assert.match(dataScreen, /label="AUTONOMIA" value=\{currentAutonomyKm != null \? currentAutonomyKm\.toFixed\(0\) \+ ' km' : 'N\/D'\}/,
  'Dados deve apresentar apenas a autonomia recalculada a partir de nível de combustível atual e válido');
assert.match(read('tests/autonomyPresentation.test.js'), /assert\.strictEqual\(getCurrentAutonomyRangeKm\(\{ \.\.\.valid, fuelLevelPercent: 0 \}\), 0,/,
  'uma amostra válida de tanque vazio deve resultar em autonomia 0 km, não N/D');
assert.match(laboratory, /fuelLevelPercent === 0/,
  'laboratory autonomy must distinguish a valid zero range from unavailable data');
assert.doesNotMatch(dataScreen, /label="AUTONOMIA" value=\{state\.autonomy\.estimatedRangeKm/, 'real-time screen must not show persisted range as current');
assert.ok(!home.includes('actionGrid') && !home.includes('dashboardAction'),
  'cockpit não deve duplicar destinos em uma segunda fileira de ações');
assert.ok(read('app/mais.tsx').includes('CONSULTA MANUAL DE PID'), 'atalho de consulta manual precisa existir');
assert.ok(read('app/laboratorio.tsx').includes('PIDs REGISTRADOS / DESCOBERTOS'), 'lista de PIDs precisa continuar acessível');
assert.match(laboratory, /parsed\?\.interpretation/, 'interpretações secundárias de PIDs devem ser visíveis nos detalhes técnicos do Laboratório');
assert.match(laboratory, /result\.status !== 'OK'/, 'DTC read must not interpret command error as no failures');
assert.match(laboratory, /isValidDtcResponseForService\('03', result\.response\)/, 'DTC read must validate a complete response');
assert.match(read('src/obd/dtcScanner.ts'), /reply\.status === 'OK' && isValidDtcResponseForService/, 'bulk scan requires valid response data');
const dtcManagerSource = read('src/database/dtcManager.ts');
assert.match(dtcManagerSource, /!dtc\.historical/, 'historical=true nunca pode ser classificado como DTC atual');
assert.match(dtcManagerSource, /markMissingStoredDtcsInactive/, 'reconciliação DTC deve ficar centralizada e testável');
assert.doesNotMatch(dtcManagerSource, /lastSeen: now/,
  'ausência do DTC não pode ser registrada como última observação física');
assert.match(read('app/laboratorio.tsx'), /markMissingStoredDtcsInactive/, 'as duas leituras Mode 03 devem usar a mesma reconciliação DTC');
assert.match(read('src/obd/parser.ts'), /fuelTypeCodes\[String\(data\[0\]\)\]/, 'PID 0151 deve usar a tabela enumerada de combustível');

const bluetoothScreen = read('app/bluetooth.tsx');
assert.match(bluetoothScreen, /formatElmQueueHealth\(health\)/, 'Bluetooth deve exibir as métricas de pressão da fila ELM');
assert.match(bluetoothScreen, /queueHealth\.queue/, 'a tela Bluetooth deve expor profundidade, pico e recusas da fila');
assert.match(bluetoothScreen, /queueHealth\.wait/, 'a tela Bluetooth deve expor a espera média e máxima');
assert.match(read('src/obd/elmHealthPresentation.ts'), /queueRejections > 0|rejected > 0/, 'recusas de fila precisam elevar o aviso de saúde');
assert.ok(read('docs/OBD_APP_FEATURE_AUDIT_2026-10-27.md').includes('DB-170') && read('docs/OBD_APP_FEATURE_AUDIT_2026-10-27.md').includes('CI final'), 'a auditoria deve distinguir implementação em branch de validação final e integração na main');
assert.ok(read('src/obd/bluetoothManager.ts').includes("session.executeCommand('010C', config.protocolSelectionTimeoutMs)"), 'the first ECU probe must use the bounded protocol-negotiation timeout');
assert.match(read('tests/elm327Compatibility.test.js'), /testBoundedFirstProbeTimeoutOverride/, 'the first ECU probe timing must have a dynamic regression test');

assert.match(theme, /SCREEN_TITLE_STYLE/);
assert.match(read('tests/screenTheme.test.js'), /Shared screen theme and title contract/);

// Critical acceptance plan must stay versioned with the anti-regression contract.
const testPlan = read('docs/TEST_PLAN.md');
assert.match(testPlan, /OBD-01/);
assert.match(testPlan, /DATA-02/);
assert.match(testPlan, /SPLASH-01/);
assert.match(testPlan, /teste físico/);
assert.match(read('docs/CONTRATO_ANTI_REGRESSAO.md'), /\| RG-20 \|/);
assert.match(projectContract, /\| RG-44 \|/, 'buffer móvel de autonomia deve permanecer no contrato anti-regressão');
assert.match(read('docs/TEST_PLAN.md'), /PID-AUTO-02/);
assert.match(projectContract, /\| RG-33 \|/, 'trip consumption used for autonomy must be reliability-gated');
assert.match(read('docs/TEST_PLAN.md'), /PID-AUTO-01/);

assert.ok(read('app/mais.tsx').includes('/manutencao'), 'manutenção e abastecimento deve continuar acessível pelo menu Mais');
assert.match(read('src/maintenance/maintenanceRules.ts'), /evaluateMaintenance/);
assert.match(read('src/database/maintenanceStorage.ts'), /writeMaintenanceData/);
assert.ok(scriptedTests.has('maintenanceRules.test.js'), 'regras de manutenção precisam ser testadas pelo npm test');

// The diary is part of the release contract: entries and the index must remain identical.
const diaryEntryIds = [...diary.matchAll(/^#{1,4}\s+(DB-\d{3})\b/gm)].map((match) => match[1]);
const diaryIndexIds = [...diary.matchAll(/^- \*\*(DB-\d{3})\*\*/gm)].map((match) => match[1]);
assert.ok(diaryEntryIds.length > 0, 'o Diário de Bordo deve conter entradas DB-NNN');
assert.equal(new Set(diaryEntryIds).size, diaryEntryIds.length, 'o diário contém IDs DB-NNN duplicados');
for (let index = 0; index < diaryEntryIds.length; index++) {
  assert.equal(
    diaryEntryIds[index],
    'DB-' + String(index + 1).padStart(3, '0'),
    'as entradas do diário devem permanecer contínuas e ordenadas; erro na posição ' + (index + 1),
  );
}
assert.deepEqual(diaryIndexIds, diaryEntryIds, 'o índice DB-NNN precisa corresponder exatamente às entradas do diário');

// Strict ECU payload validation must remain present in the actual recovery path.
const recoverySource = read('src/obd/elm327.ts');
assert.ok(recoverySource.includes("const parsedProbe = parsePidResponse('010C', probe.response)"),
  'ECU recovery must use the canonical PID parser');
assert.ok(recoverySource.includes("parsedProbe.status !== 'RESPONDEU'"),
  'a positive service marker without a valid payload cannot confirm recovery');
assert.ok(recoverySource.includes('parsedProbe.value === null'),
  'a null parsed RPM value cannot confirm recovery');
assert.ok(recoverySource.includes('Number.isFinite(parsedProbe.value)'),
  'recovered RPM must be finite');
assert.ok(projectContract.includes('| RG-53 |'), 'strict ECU recovery must be protected by RG-53');
assert.ok(projectContract.includes('| RG-54 |'), 'retry settings must have one effective default policy');
assert.ok(projectContract.includes('| RG-55 |'), 'rolling consumption must count fuel burned at idle');
assert.ok(projectContract.includes('| RG-56 |'), 'tank balance must reject trips with unknown fuel-data validity');
assert.ok(projectContract.includes('| RG-57 |'), 'DTC lastSeen must represent actual observation, not later absence');
assert.ok(projectContract.includes('| RG-58 |'), 'checksummed KWP frames must be protected by RG-58');
assert.ok(projectContract.includes('| RG-60 |'), 'SQLite trip history migration must be protected by RG-60');
assert.ok(projectContract.includes('| RG-61 |'), 'the initial ECU probe timeout must be protected by RG-61');
assert.ok(read('docs/TEST_PLAN.md').includes('BT-CONN-08'), 'the initial ECU probe timeout needs an acceptance plan');
assert.ok(read('src/obd/bluetoothManager.ts').includes('timeoutOverrideMs: config.protocolSelectionTimeoutMs'), 'the effective ECU probe timeout must be logged for field diagnosis');
assert.ok(projectContract.includes('| RG-59 |'), 'generic ELM327 profile and documented retry/protocol policy must stay aligned');
assert.ok(read('docs/TEST_PLAN.md').includes('BT-CONN-07'), 'generic ELM327 documentation must have explicit consistency checks');
assert.ok(read('docs/TEST_PLAN.md').includes('BT-CONN-04'), 'strict ECU recovery must have explicit test criteria');
assert.ok(read('docs/TEST_PLAN.md').includes('BT-CONN-06'), 'real KWP-frame parsing must have explicit test criteria');

console.log('Anti-regression baseline gate: PASS');
console.log('Protected contracts: five-read sensor tests, manual PID flow, single ELM327 queue, offline diagnosis, Expo SDK 51, GPS/Trip, TXT/history and cockpit/graphs.');
