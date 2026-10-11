'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compiled = new Map();

function loadTs(tsPath) {
  tsPath = path.normalize(tsPath);
  if (compiled.has(tsPath)) return compiled.get(tsPath).exports;

  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiled.set(tsPath, mod);
  mod._compile(output, tsPath);
  return mod.exports;
}

const files = new Map();
const dirs = new Set(['/doc']);
let writeDelayMs = 0;
let bluetoothListener = null;
let bluetoothDisconnectListener = null;
let fakeDeviceConnected = true;
let lastBluetoothConnectionOptions = null;
let lastBluetoothDiscoveryCancelled = false;
let bluetoothConnectCalls = 0;
let bluetoothActiveNativeConnections = 0;
let bluetoothMaxNativeConnections = 0;
let bluetoothConnectDelayMs = 0;

function parentDir(p) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.substring(0, i);
}

function ensureDirTree(p) {
  const parts = p.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    dirs.add(current);
  }
}

function resetFS() {
  files.clear();
  dirs.clear();
  dirs.add('/doc');
  writeDelayMs = 0;
}

const fakeFS = {
  documentDirectory: '/doc',
  EncodingType: { UTF8: 'utf8' },

  async getInfoAsync(p) {
    if (files.has(p)) {
      return {
        exists: true,
        isDirectory: false,
        size: Buffer.byteLength(files.get(p), 'utf8'),
        uri: p,
        modificationTime: Date.now() / 1000,
      };
    }
    if (dirs.has(p)) return { exists: true, isDirectory: true, size: 0, uri: p };
    return { exists: false, isDirectory: false, size: 0, uri: p };
  },

  async makeDirectoryAsync(p) {
    ensureDirTree(p);
  },

  async readAsStringAsync(p) {
    if (!files.has(p)) throw new Error('ARQUIVO NAO EXISTE: ' + p);
    return files.get(p);
  },

  async writeAsStringAsync(p, content) {
    if (writeDelayMs > 0) await wait(writeDelayMs);
    ensureDirTree(parentDir(p));
    files.set(p, String(content));
  },

  async copyAsync({ from, to }) {
    if (files.has(from)) {
      ensureDirTree(parentDir(to));
      files.set(to, files.get(from));
      return;
    }
    if (dirs.has(from)) {
      ensureDirTree(to);
      for (const [p, content] of Array.from(files.entries())) {
        if (p.startsWith(from + '/')) {
          files.set(to + p.substring(from.length), content);
        }
      }
      return;
    }
    throw new Error('ORIGEM NAO EXISTE: ' + from);
  },

  async deleteAsync(p) {
    files.delete(p);
    for (const key of Array.from(files.keys())) {
      if (key.startsWith(p + '/')) files.delete(key);
    }
    dirs.delete(p);
  },

  async readDirectoryAsync(p) {
    if (!dirs.has(p)) throw new Error('DIRETORIO NAO EXISTE: ' + p);
    const names = new Set();
    for (const fp of files.keys()) {
      if (fp.startsWith(p + '/')) names.add(fp.substring(p.length + 1).split('/')[0]);
    }
    for (const dp of dirs) {
      if (dp.startsWith(p + '/')) names.add(dp.substring(p.length + 1).split('/')[0]);
    }
    return Array.from(names);
  },

  StorageAccessFramework: {
    async requestDirectoryPermissionsAsync() {
      return { granted: false, directoryUri: '' };
    },
    async createFileAsync() {
      throw new Error('SAF NAO SUPORTADO NOS TESTES');
    },
  },
};

const fakeRN = {
  AppState: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'android', Version: 35 },
  PermissionsAndroid: { PERMISSIONS: { BLUETOOTH_CONNECT: 'BLUETOOTH_CONNECT', BLUETOOTH_SCAN: 'BLUETOOTH_SCAN', ACCESS_FINE_LOCATION: 'ACCESS_FINE_LOCATION', ACCESS_COARSE_LOCATION: 'ACCESS_COARSE_LOCATION' }, RESULTS: { GRANTED: 'granted' }, requestMultiple: async (permissions) => Object.fromEntries(permissions.map((permission) => [permission, 'granted'])) },
};

const fakeBluetooth = {
  isBluetoothAvailable: async () => true,
  isBluetoothEnabled: async () => true,
  requestBluetoothEnabled: async () => true,
  getBondedDevices: async () => [],
  cancelDiscovery: async () => { lastBluetoothDiscoveryCancelled = true; },
  onDeviceDisconnected(listener) {
    bluetoothDisconnectListener = listener;
    return { remove() { bluetoothDisconnectListener = null; } };
  },
  connectToDevice: async (_address, options) => {
    bluetoothConnectCalls++;
    bluetoothActiveNativeConnections++;
    bluetoothMaxNativeConnections = Math.max(bluetoothMaxNativeConnections, bluetoothActiveNativeConnections);
    lastBluetoothConnectionOptions = options;
    try {
      if (bluetoothConnectDelayMs > 0) await wait(bluetoothConnectDelayMs);
      return {
    address: 'AA:BB:CC:DD:EE:FF',
    name: 'ELM327',
    bonded: true,
    isConnected: async () => fakeDeviceConnected,
    onDataReceived(listener) {
      bluetoothListener = listener;
      return { remove() { bluetoothListener = null; } };
    },
    write: async () => {
      bluetoothListener?.({ data: '41 0C ' });
      bluetoothListener?.({ data: '0C 18\r\n>' });
    },
    available: async () => {
      throw new Error('available() não deve ser usado com listener');
    },
    read: async () => {
      throw new Error('read() não deve ser usado com listener');
    },
    disconnect: async () => {
      bluetoothListener = null;
    },
      };
    } finally {
      bluetoothActiveNativeConnections--;
    }
  },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFS;
  if (request === 'react-native') return fakeRN;
  if (request === 'react-native-bluetooth-classic') return fakeBluetooth;
  if (request === 'expo-location') return { PermissionStatus: { GRANTED: 'granted' }, requestForegroundPermissionsAsync: async () => ({ status: 'granted' }), getBackgroundPermissionsAsync: async () => ({ status: 'granted' }), requestBackgroundPermissionsAsync: async () => ({ status: 'granted' }), hasStartedLocationUpdatesAsync: async () => false, startLocationUpdatesAsync: async () => {}, stopLocationUpdatesAsync: async () => {}, Accuracy: { BestForNavigation: 6 } };
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE = '/doc/MERIVA_SMART';

async function testFormulaKnowledgeBank() {
  const engine = loadTs(path.join(ROOT, 'src/obd/formulaEngine.ts'));

  assert.strictEqual(engine.applyFormula('RPM', [0x1A, 0xF8]), 1726);
  assert.strictEqual(engine.applyFormula('TEMP_C', [0x69]), 65);
  assert.strictEqual(engine.applyFormula('MAF_GS', [0x03, 0x7B]), 8.91);
  assert.strictEqual(engine.applyFormula('FUEL_TRIM', [0x76]), -7.8125);
  assert.strictEqual(engine.applyFormula('PERCENT_255', [0xFF]), 100);
  assert.strictEqual(engine.applyFormula('O2_VOLTS', [0x6A, 0x80]), 0.53);

  const good = engine.decodeFormula('RPM', '010C', [0x1A, 0xF8]);
  assert.strictEqual(good.valid, true);
  assert.strictEqual(good.value, 1726);

  const bad = engine.validatePidValue('010C', 20000);
  assert.strictEqual(bad.valid, false, 'valor fora da faixa deve ser rejeitado pelo motor de plausibilidade');
  assert.match(bad.reason, /fora da faixa/);
}

async function testParser() {
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  assert.strictEqual(parser.parsePidResponse('0105', '41 05 69').value, 65);
  assert.strictEqual(parser.parsePidResponse('010C', '41 0C 1A F8').value, 1726);
  const o2 = parser.parsePidResponse('0114', '41 14 6A 80');
  assert.strictEqual(o2.status, 'RESPONDEU');
  assert.strictEqual(o2.value, 0.53);
  assert.strictEqual(o2.rawBytes.length, 4);
  assert.strictEqual(parser.parsePidResponse('01 0C', '41 0C 1A F8').value, 1726);
  assert.strictEqual(parser.validateOBDResponse('410C1AF8'), true);
  assert.strictEqual(parser.parsePidResponse('010C', '410C1AF8').value, 1726);
  assert.strictEqual(parser.validateOBDResponse('41 0C 1A F8'), true);
  assert.strictEqual(parser.parsePidResponse('010C', '41 0C 1A F8').value, 1726);
  assert.strictEqual(parser.parsePidResponse('010C', '48 6B 10 41 0C 1A F8 82').value, 1726);
  assert.strictEqual(parser.parsePidResponse('010C', '7E8 04 41 0C 1A F8').value, 1726);
  assert.strictEqual(parser.parsePidResponse('010C', '41 0C 1A').value, null);
  assert.strictEqual(parser.parsePidResponse('0199', '41 99 FF').status, 'VALOR NÃO INTERPRETADO');
  assert.strictEqual(parser.parsePidResponse('010C', 'NO DATA').status, 'NÃO RESPONDEU');
  assert.deepStrictEqual(parser.parseDtcResponse('43 01 33 00 00 00'), ['P0133']);
  assert.deepStrictEqual(parser.parseDtcResponse('48 6B 10 43 01 33 00 00 82'), ['P0133']);
}

async function testElmAndProtocol() {
  const { Elm327Session } = loadTs(path.join(ROOT, 'src/obd/elm327.ts'));
  const { SimulatedObdTransport } = loadTs(path.join(ROOT, 'src/obd/simulatedTransport.ts'));

  const session = new Elm327Session(new SimulatedObdTransport());
  const initialization = await session.initialize();
  assert.deepStrictEqual(
    initialization.map((item) => item.command),
    ['ATZ', 'ATI', 'ATE0', 'ATL0', 'ATS0', 'ATH1', 'ATSP0', 'ATDP'],
  );
  assert.strictEqual(session.getProtocol(), 'SIMULATED OBD TRANSPORT');

  const results = await Promise.all([
    session.queryPid('010C'),
    session.queryPid('0105'),
  ]);
  const protocol = await session.identifyProtocol();
  assert.strictEqual(protocol.response, 'SIMULATED OBD TRANSPORT');
  assert.strictEqual(session.getProtocol(), 'SIMULATED OBD TRANSPORT');
  assert.strictEqual(results[0].parsed.value, 774);
  assert.strictEqual(results[1].parsed.value, 65);
  assert.strictEqual(results[0].rx, '41 0C 0C 18');
  assert.strictEqual(results[1].rx, '41 05 69');

  const generic = await session.executeCommand('03');
  assert.strictEqual(generic.command, '03');
  assert.strictEqual(generic.status, 'ERROR');
  await session.close();
}

async function testConfiguredBluetoothRetryLimit() {
  const managerPath = path.join(ROOT, 'src/obd/bluetoothManager.ts');
  const source = fs.readFileSync(managerPath, 'utf8');
  assert.ok(source.includes('const effectiveMaxAttempts = config.maxConnectionAttempts > 0'), 'retry deve derivar do maxConnectionAttempts configurado');
  assert.ok(source.includes('attempt <= effectiveMaxAttempts'), 'loop de retry deve respeitar o limite efetivo');
  assert.ok(!source.includes('const maxAttempts = config.maxConnectionAttempts'), 'não pode haver shadowing de maxAttempts');
  console.log('configured Bluetooth retry limit: OK');
}

async function testBluetoothActivationRequest() {
  const manager = loadTs(path.join(ROOT, 'src/obd/bluetoothManager.ts'));
  const originalEnabled = fakeBluetooth.isBluetoothEnabled;
  const originalRequest = fakeBluetooth.requestBluetoothEnabled;

  let enabled = false;
  let requests = 0;
  fakeBluetooth.isBluetoothEnabled = async () => enabled;
  fakeBluetooth.requestBluetoothEnabled = async () => {
    requests += 1;
    enabled = true;
    return true;
  };

  assert.strictEqual(await manager.ensureBluetoothReady(), true);
  assert.strictEqual(requests, 1, 'quando o Bluetooth está desligado, deve pedir ativação oficial uma vez');

  enabled = false;
  fakeBluetooth.requestBluetoothEnabled = async () => {
    requests += 1;
    return false;
  };
  await assert.rejects(
    manager.ensureBluetoothReady(),
    /BLUETOOTH CONTINUA DESLIGADO|BLUETOOTH NÃO FOI ATIVADO/,
  );

  fakeBluetooth.isBluetoothEnabled = originalEnabled;
  fakeBluetooth.requestBluetoothEnabled = originalRequest;
}

async function testConnectionSelectionAndStrictEcuGate() {
  const shared = loadTs(path.join(ROOT, 'src/obd/sharedConnection.ts'));
  const manager = loadTs(path.join(ROOT, 'src/obd/bluetoothManager.ts'));

  const devices = [
    { address: 'AA:BB:CC:DD:EE:01', name: 'ELM327', bonded: true },
    { address: 'AA:BB:CC:DD:EE:02', name: 'ELM327 OUTRO', bonded: true },
  ];

  assert.deepStrictEqual(
    shared.buildCandidateList(devices, devices[1].address, 'EXPLICIT'),
    [devices[1]],
    'seleção explícita deve testar somente o adaptador escolhido',
  );
  assert.deepStrictEqual(
    shared.buildCandidateList(devices, 'AA:BB:CC:DD:EE:FF', 'EXPLICIT'),
    [],
    'seleção explícita não deve cair silenciosamente em outro adaptador',
  );

  assert.strictEqual(
    manager.isValidEcuProbe({ status: 'OK', response: '41 0C 1A F8', command: '010C', elapsedMs: 10, attempt: 1 }),
    true,
  );
  assert.strictEqual(
    manager.isValidEcuProbe({ status: 'OK', response: '41 0C 1A', command: '010C', elapsedMs: 10, attempt: 1 }),
    false,
    'payload incompleto não valida a ECU',
  );

  console.log('selection/ECU strict gate: OK');
}

async function testActiveAdapterCannotBeSilentlySwitched() {
  const shared = loadTs(path.join(ROOT, 'src/obd/sharedConnection.ts'));
  const fakeConnection = {
    session: { close: async () => undefined },
    device: { address: 'AA:BB:CC:DD:EE:01', name: 'ELM327', bonded: true },
    protocol: 'TEST',
    supportedPids: ['010C'],
    ecuValidated: true,
    getDiagnosticsText: () => '',
  };

  await shared.setSharedObdConnection(fakeConnection);
  await assert.rejects(
    shared.connectPreferredElm('AA:BB:CC:DD:EE:02', undefined, 'EXPLICIT'),
    /OUTRO ADAPTADOR JÁ ESTÁ CONECTADO/
  );
  await shared.disconnectSharedObd();
  console.log('active adapter switch guard: OK');
}

async function testEcuValidationGate() {
  const manager = loadTs(path.join(ROOT, 'src/obd/bluetoothManager.ts'));
  assert.strictEqual(manager.getElmProtocolName('5'), 'ISO 14230-4 KWP FAST');
  assert.strictEqual(manager.getElmProtocolName('3'), 'ISO 9141-2');
  assert.strictEqual(manager.getElmProtocolName('6'), 'ISO 15765-4 CAN 11/500');
  assert.strictEqual(manager.getElmProtocolName('9'), 'ISO 15765-4 CAN 29/250');
  assert.strictEqual(manager.getElmProtocolName('X'), 'ELM327 PROTOCOLO X');
  assert.strictEqual(manager.isValidEcuProbe({ status: 'OK', response: '41 0C 1A F8', command: '010C', elapsedMs: 10, attempt: 1 }), true);
  assert.strictEqual(manager.isValidEcuProbe({ status: 'OK', response: 'NO DATA', command: '010C', elapsedMs: 10, attempt: 1 }), false);
  assert.strictEqual(manager.isValidEcuProbe({ status: 'TIMEOUT', response: '', command: '010C', elapsedMs: 1000, attempt: 1 }), false);
  assert.strictEqual(manager.isValidEcuProbe({ status: 'OK', response: '41 0B 25', command: '010C', elapsedMs: 10, attempt: 1 }), false);
  assert.strictEqual(manager.MAX_BLUETOOTH_ATTEMPTS, 20);
  assert.strictEqual(manager.BLUETOOTH_RETRY_INTERVAL_MS, 8000);
}

async function testPidScanner() {
  const scanner = loadTs(path.join(ROOT, 'src/obd/pidScanner.ts'));
  const supported = scanner.decodeSupportedPids('0100', '41 00 BE 3E B8 13');
  assert.ok(supported.includes('0105'));
  assert.ok(supported.includes('010C'));
  assert.ok(supported.includes('010F'));
  assert.ok(supported.includes('0111'));

  const supported20 = scanner.decodeSupportedPids('0120', '41 20 00 02 00 00');

  const supported40 = scanner.decodeSupportedPids('0140', '41 40 00 00 00 02');
  assert.ok(supported40.includes('015F'));
  // No bloco 0160, o bit mais significativo do 4º byte representa o PID 0179.
  // 01 seria o PID 0180. Mantemos a relação OBD-II MSB-first explícita no teste.
  const supported60 = scanner.decodeSupportedPids('0160', '41 60 00 00 00 80');
  assert.ok(supported60.includes('0179'));
  assert.ok(!supported60.includes('0180'));

  const fakeSession = {
    async executeCommand(pid) {
      const responses = {
        '0100': { response: '41 00 80 00 00 01', status: 'OK', elapsedMs: 10 },
        '0120': { response: '41 20 80 00 00 01', status: 'OK', elapsedMs: 10 },
        '0140': { response: '41 40 80 00 00 01', status: 'OK', elapsedMs: 10 },
        '0160': { response: '41 60 00 00 00 80', status: 'OK', elapsedMs: 10 },
      };
      return responses[pid];
    },
  };
  const discovered = await scanner.discoverSupportedPids(fakeSession);
  assert.deepStrictEqual(discovered.map((item) => item.pid), ['0100', '0120', '0140', '0160']);
}


async function testIntelligentPidDiscovery() {
  const ai = loadTs(path.join(ROOT, 'src/obd/intelligentPidDiscovery.ts'));
  const fakeSession = {
    async executeCommand(pid) {
      const responses = {
        '0100': { response: '41 00 BE 3E B8 13', status: 'OK', elapsedMs: 8 },
        '0120': { response: '41 20 00 02 00 00', status: 'OK', elapsedMs: 8 },
        '0140': { response: '41 40 00 00 00 02', status: 'OK', elapsedMs: 8 },
        '0160': { response: '41 60 00 00 00 80', status: 'OK', elapsedMs: 8 },
        '010C': { response: '41 0C 1A F8', status: 'OK', elapsedMs: 10 },
        '0105': { response: '41 05 69', status: 'OK', elapsedMs: 10 },
        '010F': { response: '41 0F 80', status: 'OK', elapsedMs: 10 },
      };
      return responses[pid] || { response: 'NO DATA', status: 'ERROR', elapsedMs: 10 };
    },
  };
  const result = await ai.discoverIntelligentPids(fakeSession, {
    knownPids: ['010C'],
  });
  assert.ok(result.supportedPids.includes('010C'));
  assert.strictEqual(result.confidence['010C'], 1);
  assert.strictEqual(result.observations.find((item) => item.pid === '010C').status, 'CONFIRMADO');
  assert.strictEqual(result.observations.find((item) => item.pid === '010C').value, 1726);
}

async function testCarScannerBaselineAndFuel012F() {
  resetFS();
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  const fuel = loadTs(path.join(ROOT, 'src/trip/fuelLevel.ts'));
  const learning = loadTs(path.join(ROOT, 'src/database/learningProfile.ts'));

  const parsed = parser.parsePidResponse('012F', '41 2F 80');
  assert.strictEqual(parsed.status, 'RESPONDEU');
  assert.strictEqual(parsed.value, 12800 / 255);
  assert.strictEqual(parsed.unit, 'percent');
  assert.strictEqual(parser.parsePidResponse('012F', 'NO DATA').value, null);
  assert.strictEqual(parser.parsePidResponse('012F', 'NO DATA').status, 'NÃO RESPONDEU');
  assert.strictEqual(fuel.fuelLevelPercentToLiters(0), 0);
  assert.strictEqual(fuel.fuelLevelPercentToLiters(100), 56);
  assert.strictEqual(fuel.fuelLevelPercentToLiters(parsed.value), 28.11);
  assert.strictEqual(fuel.isFuelReserve(parsed.value), false);
  assert.strictEqual(fuel.isFuelReserve(8), true);
  assert.strictEqual(fuel.estimateRangeFromFuelLevel(50, 10), 280);

  await learning.createLearningProfile(BASE, '2026-09-24T14:48:00.000Z');
  const seeded = await learning.initializeCarScannerSeed(BASE);
  assert.strictEqual(seeded.globalSampleCounts.seedSamples, 10);
  assert.strictEqual(seeded.globalSampleCounts.realSamples, 0);
  assert.strictEqual(seeded.globalSampleCounts.totalSamples, 10);
  assert.strictEqual(seeded.source, 'HYBRID');
  assert.strictEqual(seeded.learningStatus, 'SEED_INITIALIZED');
  const rpm = seeded.contextualData.find((item) => item.condition === 'IDLE_WARM').statistics['Engine RPM'];
  assert.strictEqual(rpm.mean, 778);
  assert.strictEqual(rpm.realSamples, 0);
  assert.strictEqual(rpm.seedSamples, 1);
  assert.deepStrictEqual(rpm.source, ['CARSCANNER_BASELINE']);
  await learning.updateLearningProfileRealSample(BASE, 'Engine RPM', 800, 'IDLE_WARM');
  const learned = await learning.readLearningProfile(BASE);
  const learnedRpm = learned.contextualData.find((item) => item.condition === 'IDLE_WARM').statistics['Engine RPM'];
  assert.strictEqual(learned.globalSampleCounts.realSamples, 1);
  assert.ok(learnedRpm.mean > 778 && learnedRpm.mean < 800);
  assert.deepStrictEqual(learnedRpm.source, ['CARSCANNER_BASELINE', 'REAL_OBD']);
  assert.ok(Array.isArray(learnedRpm.medianWindow), 'mediana deve manter janela limitada de amostras');
  assert.strictEqual(learnedRpm.median, 789, 'mediana do seed + primeira amostra real deve ser calculada de forma determinística');

  const overallRpm = learned.overallStatistics['Engine RPM'];
  assert.ok(overallRpm, 'estatística global do PID deve ser atualizada');
  assert.strictEqual(overallRpm.realSamples, 1);
  assert.strictEqual(overallRpm.seedSamples, 1);
  assert.strictEqual(overallRpm.confidence, 'LOW', 'seed não pode aumentar confiança baseada em amostras reais');

  const lateSeedBase = BASE + '/late-seed';
  await learning.createLearningProfile(lateSeedBase, '');
  await learning.updateLearningProfileRealSample(lateSeedBase, 'Engine RPM', 1000, 'IDLE_COLD');
  await learning.initializeCarScannerSeed(lateSeedBase);
  const lateSeed = await learning.readLearningProfile(lateSeedBase);
  assert.strictEqual(lateSeed.learningStatus, 'COLD_START', 'seed tardio não pode rebaixar um aprendizado real em andamento');
  assert.strictEqual(lateSeed.overallStatistics['Engine RPM'].realSamples, 1, 'seed tardio não pode apagar estatística real global');
  assert.strictEqual(lateSeed.overallStatistics['Engine RPM'].mean, 1000, 'estatística real global deve sobreviver ao seed tardio');
}

async function testBluetoothConnectionCallbacks() {
  bluetoothListener = null;
  bluetoothDisconnectListener = null;
  fakeDeviceConnected = true;
  const { BluetoothClassicTransport } = loadTs(path.join(ROOT, 'src', 'obd', 'bluetoothClassicTransport.ts'));
  const events = [];
  const transport = new BluetoothClassicTransport('AA:BB:CC:DD:EE:FF', undefined, {
    onConnected: () => events.push('connected'),
    onDisconnected: (reason) => events.push(reason),
  });

  await transport.open();
  assert.deepStrictEqual(events, ['connected'], 'conexão real deve emitir somente onConnected');
  bluetoothDisconnectListener?.({ address: 'AA:BB:CC:DD:EE:FF' });
  assert.deepStrictEqual(events, ['connected', 'BLUETOOTH DESCONECTADO']);
  await transport.close();
}

async function testBluetoothEventTransport() {
  bluetoothListener = null;
  bluetoothDisconnectListener = null;
  fakeDeviceConnected = true;
  lastBluetoothDiscoveryCancelled = false;
  bluetoothConnectCalls = 0;
  bluetoothActiveNativeConnections = 0;
  bluetoothMaxNativeConnections = 0;
  bluetoothConnectDelayMs = 0;
  const { BluetoothClassicTransport } = loadTs(path.join(ROOT, 'src/obd/bluetoothClassicTransport.ts'));
  const transport = new BluetoothClassicTransport('AA:BB:CC:DD:EE:FF');
  await transport.open();
  assert.strictEqual(lastBluetoothDiscoveryCancelled, true);
  assert.strictEqual(bluetoothConnectCalls, 1);
  assert.strictEqual(lastBluetoothConnectionOptions?.connectionType, 'delimited');
  assert.strictEqual(lastBluetoothConnectionOptions?.delimiter, '');
  assert.strictEqual(lastBluetoothConnectionOptions?.charset, 'ascii');
  assert.strictEqual(lastBluetoothConnectionOptions?.secureSocket, false);
  await transport.write('010C\r');
  const response = await transport.readUntilPrompt(500);
  assert.strictEqual(response, '41 0C 0C 18');
  await transport.close();

  // O bloqueio deve funcionar entre instâncias diferentes. Sem ele, duas
  // instâncias chamam connectToDevice simultaneamente e o Android pode retornar
  // "Already attempting connection to device ...".
  bluetoothConnectCalls = 0;
  bluetoothActiveNativeConnections = 0;
  bluetoothMaxNativeConnections = 0;
  bluetoothConnectDelayMs = 30;
  const transportA = new BluetoothClassicTransport('AA:BB:CC:DD:EE:FF');
  const transportB = new BluetoothClassicTransport('AA:BB:CC:DD:EE:FF');
  await Promise.all([transportA.open(), transportB.open()]);
  assert.strictEqual(bluetoothConnectCalls, 2, 'instâncias diferentes devem serializar as tentativas nativas');
  assert.strictEqual(bluetoothMaxNativeConnections, 1, 'não pode haver duas tentativas RFCOMM simultâneas');
  await transportA.close();
  await transportB.close();
  bluetoothConnectDelayMs = 0;

  bluetoothConnectCalls = 0;
  await Promise.all([transport.open(), transport.open()]);
  assert.strictEqual(bluetoothConnectCalls, 1, 'duas chamadas open() concorrentes devem compartilhar a mesma tentativa');
  await transport.close();

  await transport.open();
  const pendingRead = transport.readUntilPrompt(500);
  fakeDeviceConnected = false;
  bluetoothDisconnectListener?.({ address: 'AA:BB:CC:DD:EE:FF' });
  await assert.rejects(pendingRead, /BLUETOOTH DESCONECTADO|BLUETOOTH NÃO CONECTADO/);
  await transport.close();
}

async function testQuota() {
  resetFS();
  const m = loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  await fakeFS.writeAsStringAsync(`${BASE}/LOGS/a.csv`, 'x'.repeat(1024 * 1024));

  const quota = loadTs(path.join(ROOT, 'src/storage/quotaManager.ts'));
  const usage = await quota.getStorageUsage(BASE, 0.5);
  assert.strictEqual(usage.limitMb, 0.5);

  const status = await quota.checkStorageQuota(BASE, {
    limitMb: 0.5,
    warningThreshold: 0.8,
    cleanupTargetMb: 0.4,
    autoCleanupEnabled: true,
  });
  assert.strictEqual(status.critical, true);
  m.disposeAutoSave();
}

async function testRawLogger() {
  resetFS();
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  const logger = loadTs(path.join(ROOT, 'src/database/obdLogger.ts'));
  const parsed = parser.parsePidResponse('010C', '41 0C 1A F8');

  const query = {
    tx: '010C',
    rx: '41 0C 1A F8',
    elapsedMs: 17,
    commandStatus: 'OK',
    protocol: 'ISO 14230-4 (KWP FAST)',
    parsed,
  };

  await logger.logRawObdData(BASE, query, '010C', 'REAL');
  await logger.logInterpretedData(BASE, query, '010C', 'REAL');

  const rawFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_raw_'));
  const interpretedFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_interpreted_'));
  assert.ok(rawFile);
  assert.ok(interpretedFile);

  const raw = files.get(rawFile);
  const interpreted = files.get(interpretedFile);
  assert.ok(raw.startsWith('timestamp,tx,rx,pid,responseTimeMs,commandStatus,protocol,source'));
  assert.ok(raw.includes('010C,41 0C 1A F8'));
  assert.ok(interpreted.includes('010C,41 0C 1A F8'));
  assert.ok(interpreted.includes('ISO 14230-4 (KWP FAST)'));
}

async function testVehicleProfile() {
  resetFS();
  const vehicle = loadTs(path.join(ROOT, 'src/database/vehicleConfig.ts'));
  const profile = {
    vehicleName: 'Meriva Maxx',
    year: 2012,
    make: 'Chevrolet',
    model: 'Meriva Maxx',
    engine: '1.4 8V',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    protocolBaseline: 'N/D',
  };

  await vehicle.createVehicleProfile(BASE, profile);
  assert.strictEqual((await vehicle.readVehicleProfile(BASE)).vehicleName, 'Meriva Maxx');
  files.set(`${BASE}/CONFIG/veiculo.json`, '{invalido');
  assert.strictEqual(await vehicle.readVehicleProfile(BASE), null);
}

async function testDriveCycleValidation() {
  resetFS();
  const storage = loadTs(path.join(ROOT, 'src/storage/driveCycleStorage.ts'));
  const cycle = {
    id: 'test-1',
    startedAt: '2026-10-02 10:00:00',
    finishedAt: '2026-10-02 10:10:00',
    distanceTotalKm: 5,
    distanceIceKm: 5,
    fuelUsedL: 0.5,
    totalTimeHms: '00:10:00',
    drivingTimeHms: '00:09:00',
    standingTimeHms: '00:01:00',
    avgDrivingSpeedKmh: 33.3,
    avgFuelConsumptionKml: 10,
    source: 'REAL_OBD',
    importedAt: '2026-10-02T13:00:00.000Z',
  };

  await storage.addDriveCycle(BASE, cycle);
  const read = await storage.readDriveCycles(BASE);
  assert.strictEqual(read.length, 1);
  assert.strictEqual(read[0].id, 'test-1');

  const indexFile = `${BASE}/VIAGENS/index.json`;
  files.set(indexFile, JSON.stringify({
    version: '1.0',
    cycles: [
      { ...cycle, id: 'legacy-seed', source: 'CARSCANNER_SEED' },
      cycle,
    ],
    totalCount: 2,
  }));
  const filtered = await storage.readDriveCycles(BASE);
  assert.deepStrictEqual(filtered.map((item) => item.id), ['test-1'], 'legacy seed trips must not appear in operational trip history');

  await storage.addDriveCycle(BASE, { ...cycle, id: 'test-2' });
  const migratedIndex = JSON.parse(files.get(indexFile));
  assert.ok(migratedIndex.cycles.every((item) => item.source !== 'CARSCANNER_SEED'), 'adding a real trip must remove legacy seeds from active index');

  files.set(indexFile, JSON.stringify({ cycles: 'corrompido' }));
  assert.deepStrictEqual(await storage.readDriveCycles(BASE), []);

  resetFS();
  await storage.initializeDriveCycles(BASE);
  const emptyIndex = JSON.parse(files.get(indexFile));
  assert.deepStrictEqual(emptyIndex.cycles, [], 'new installations must start with an empty operational trip history');
  assert.strictEqual(
    Array.from(files.keys()).some((name) => name.includes('/VIAGENS/viagens_')),
    false,
    'seed rows must not be written to the operational trip CSV',
  );
}

async function testDriveCycleSummaryUsesWeightedRealSpeed() {
  const driveCycles = loadTs(path.join(ROOT, 'src/data/driveCycles.ts'));
  const slowLongTrip = {
    id: 'real-long',
    startedAt: '2026-10-01T10:00:00.000Z',
    finishedAt: '2026-10-01T10:20:00.000Z',
    distanceTotalKm: 2,
    distanceIceKm: 2,
    fuelUsedL: 0.2,
    totalTimeHms: '00:20:00',
    drivingTimeHms: '00:20:00',
    standingTimeHms: '00:00:00',
    avgDrivingSpeedKmh: 6,
    avgFuelConsumptionKml: 10,
    source: 'REAL_OBD',
    importedAt: '2026-10-01T10:20:00.000Z',
  };
  const shortFastTrip = {
    ...slowLongTrip,
    id: 'real-short',
    startedAt: '2026-10-02T10:00:00.000Z',
    finishedAt: '2026-10-02T10:05:00.000Z',
    distanceTotalKm: 3,
    distanceIceKm: 3,
    fuelUsedL: 0.2,
    totalTimeHms: '00:05:00',
    drivingTimeHms: '00:05:00',
    avgDrivingSpeedKmh: 36,
  };
  const latestSeed = {
    ...slowLongTrip,
    id: 'seed-latest',
    startedAt: '2026-10-03T10:00:00.000Z',
    source: 'CARSCANNER_SEED',
    distanceTotalKm: 100,
    avgDrivingSpeedKmh: 100,
  };
  const noFuelTrip = {
    ...slowLongTrip,
    id: 'real-no-fuel',
    startedAt: '2026-10-04T10:00:00.000Z',
    distanceTotalKm: 10,
    fuelUsedL: 0.01,
    avgFuelConsumptionKml: 0,
    fuelDataValid: false,
  };
  const summary = driveCycles.getDriveCycleSummary([slowLongTrip, shortFastTrip, latestSeed, noFuelTrip]);
  assert.strictEqual(summary.avgSpeedKmh, 20, 'aggregate speed must use all real distance / real moving time, even when fuel data is unavailable');
  assert.strictEqual(summary.totalDistanceKm, 15, 'seed distance must not enter real totals, while fuel-incomplete real trips still count for distance');
  assert.strictEqual(summary.avgConsumptionKml, 12.5, 'trips without valid fuel data must not distort the consumption average');
  assert.strictEqual(summary.realCycleCount, 3, 'fuel-incomplete real trips still count as real trips');
  assert.strictEqual(summary.referenceCycleCount, 1);
  assert.strictEqual(summary.lastCycle.id, 'real-no-fuel', 'the latest operational cycle cannot be a seed');
  assert.strictEqual(summary.lastRealCycle.id, 'real-no-fuel');
}

async function testDtcStorage() {
  resetFS();
  const dtcManager = loadTs(path.join(ROOT, 'src/database/dtcManager.ts'));
  await dtcManager.recordDtc(BASE, {
    code: 'P0133',
    status: 'CURRENT',
    firstSeen: '2026-10-02T20:00:00.000Z',
    lastSeen: '2026-10-02T20:00:00.000Z',
    occurrences: 1,
    source: 'REAL_OBD',
    historical: false,
    confirmed: true,
  });
  const dtcs = await dtcManager.readDtcs(BASE);
  assert.strictEqual(dtcs[0].code, 'P0133');

  writeDelayMs = 25;
  await Promise.all([
    dtcManager.recordDtc(BASE, {
      code: 'P0301',
      status: 'CURRENT',
      firstSeen: '2026-10-02T20:01:00.000Z',
      lastSeen: '2026-10-02T20:01:00.000Z',
      occurrences: 1,
      source: 'REAL_OBD',
      historical: false,
      confirmed: true,
    }),
    dtcManager.recordDtc(BASE, {
      code: 'P0420',
      status: 'CURRENT',
      firstSeen: '2026-10-02T20:02:00.000Z',
      lastSeen: '2026-10-02T20:02:00.000Z',
      occurrences: 1,
      source: 'REAL_OBD',
      historical: false,
      confirmed: true,
    }),
  ]);
  writeDelayMs = 0;
  const concurrentDtcs = await dtcManager.readDtcs(BASE);
  assert.strictEqual(concurrentDtcs.length, 3, 'gravações concorrentes de DTC não podem perder registros');
}

async function testBackupCompleteness() {
  resetFS();
  const m = loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  const backup = loadTs(path.join(ROOT, 'src/storage/backup.ts'));

  const expectedDirs = ['BANCO', 'APRENDIZADO', 'DTC', 'CONFIG', 'LEITURAS', 'LOGS', 'VIAGENS'];
  for (const dir of expectedDirs) {
    await fakeFS.writeAsStringAsync(`${BASE}/${dir}/arquivo.txt`, dir);
  }

  const info = await backup.createBackup(BASE);
  assert.deepStrictEqual(info.includes, expectedDirs);

  const backupRoot = `${BASE}/BACKUP/meriva_smart_${info.timestamp}`;
  for (const dir of expectedDirs) {
    assert.strictEqual(
      files.get(`${backupRoot}/${dir}/arquivo.txt`),
      dir,
      `backup deve conter ${dir}`,
    );
  }
  m.disposeAutoSave();
}

async function testCsvWriteSerialization() {
  resetFS();
  const logger = loadTs(path.join(ROOT, 'src/database/csvLogger.ts'));
  const target = `${BASE}/LOGS/concurrent.csv`;

  writeDelayMs = 30;
  await Promise.all([
    logger.appendCsvRow(target, { id: 'A', timestamp: 't1' }),
    logger.appendCsvRow(target, { id: 'B', timestamp: 't2' }),
  ]);
  writeDelayMs = 0;

  const content = files.get(target);
  assert.ok(content.includes('A,t1'));
  assert.ok(content.includes('B,t2'));
  assert.strictEqual(content.split('\n').filter(Boolean).length, 3);
}

async function testPidAndLearningWriteSerialization() {
  resetFS();
  const pidBank = loadTs(path.join(ROOT, 'src/database/pidBank.ts'));
  writeDelayMs = 25;
  const baseEntry = {
    name: 'RPM',
    classification: 'PADRAO_OBD',
    status: 'CONFIRMADO',
    firstSeen: '2026-10-02T20:00:00.000Z',
    lastSeen: '2026-10-02T20:00:00.000Z',
    occurrences: 1,
    protocol: 'ISO 14230-4',
    responseTime: 10,
    source: 'REAL_OBD',
    confidence: 1,
  };
  await Promise.all([
    pidBank.recordPidConfirmation(BASE, { pid: '010C', ...baseEntry }),
    pidBank.recordPidConfirmation(BASE, { pid: '0105', ...baseEntry, name: 'COOLANT' }),
  ]);
  const confirmations = await pidBank.readPidConfirmations(BASE);
  assert.strictEqual(confirmations.length, 2);
  const rawPidFile = files.get(path.join(BASE, 'BANCO', 'pids_meriva_confirmados.txt'));
  assert.ok(rawPidFile.split('\n').filter(Boolean).every((line) => line.split('|').length === 11), 'TXT de PIDs deve permanecer compacto');
  await pidBank.recordDiscoveredPids(BASE, ['010C', '010D', '015E'], 'ISO 14230-4');
  const discovered = await pidBank.readPidConfirmations(BASE);
  assert.strictEqual(discovered.length, 4);
  assert.strictEqual(discovered.find((item) => item.pid === '010D').status, 'DESCOBERTO');
  assert.strictEqual(discovered.find((item) => item.pid === '010C').status, 'CONFIRMADO');

  const learning = loadTs(path.join(ROOT, 'src/database/learningProfile.ts'));
  await learning.createLearningProfile(BASE, '');  
  await Promise.all([
    learning.updateLearningProfileRealSample(BASE, 'RPM', 1000, 'IDLE_WARM'),
    learning.updateLearningProfileRealSample(BASE, 'RPM', 1100, 'IDLE_WARM'),
  ]);
  const profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.realSamples, 2);
  assert.strictEqual(profile.globalSampleCounts.totalSamples, 2);
  assert.strictEqual(profile.learningStatus, 'COLD_START');
  const autoTripServiceSource = fs.readFileSync(path.join(ROOT, 'src', 'trip', 'autoTripService.ts'), 'utf8');
  const cockpitSource = fs.readFileSync(path.join(ROOT, 'app', 'index.tsx'), 'utf8');
  assert.ok(cockpitSource.includes("item.pid !== '0105'"), 'cockpit deve identificar temperatura do líquido pelo PID 0105');
  assert.ok(cockpitSource.includes("item.source !== 'REAL'"), 'cockpit não deve exibir temperatura simulada como dado real');
  assert.ok(cockpitSource.includes("Date.now() - timestampMs <= 30_000"), 'cockpit deve descartar temperatura OBD obsoleta após 30 segundos');
  assert.ok(cockpitSource.includes('LÍQUIDO DE ARREFECIMENTO'), 'página inicial deve apresentar métrica de temperatura do arrefecimento');
  assert.ok(cockpitSource.includes("'TEMPERATURA ALTA'"), 'cockpit deve destacar temperatura alta sem esconder o valor numérico');
  assert.ok(autoTripServiceSource.includes('registerObdQuery(this.basePath, fuelLevelResult, \'REAL\')'), 'PID 012F automático deve alimentar o pipeline de persistência');
  assert.ok(autoTripServiceSource.includes('registerObdQuery(this.basePath, fuelResult, \'REAL\')'), 'PID 015E automático deve alimentar o pipeline de persistência');
  assert.ok(autoTripServiceSource.includes('registerObdQuery(this.basePath, speedResult, \'REAL\')'), 'PID 010D automático deve alimentar o pipeline de persistência');
  assert.ok(autoTripServiceSource.includes('registerObdQuery(this.basePath, telemetryResult, \'REAL\')'), 'telemetria automática deve alimentar o pipeline de persistência');
  assert.ok(autoTripServiceSource.includes('instantaneousConsumptionSource'), 'origem do consumo instantâneo deve ser preservada para a interface');
  assert.ok(autoTripServiceSource.includes('A leitura instantânea deve ser publicada a cada ciclo OBD válido'), 'consumo instantâneo deve atualizar mesmo sem viagem ativa');
  const speedQueryIndex = autoTripServiceSource.indexOf("queryPid('010D')");
  const rpmQueryIndex = autoTripServiceSource.indexOf("queryPid('010C')");
  const measuredFuelQueryIndex = autoTripServiceSource.indexOf("queryPid('015E')");
  const fuelLevelQueryIndex = autoTripServiceSource.indexOf("queryPid('012F')");
  assert.ok(speedQueryIndex >= 0 && rpmQueryIndex > speedQueryIndex && measuredFuelQueryIndex > rpmQueryIndex && fuelLevelQueryIndex > measuredFuelQueryIndex, 'velocidade, RPM e taxa de combustível devem preceder o nível lento do tanque');
  assert.ok(autoTripServiceSource.includes("this.pollCycleNumber % 4 === 1"), 'nível do tanque deve ser consultado em cadência reduzida');
  assert.ok(autoTripServiceSource.includes("fuelRateLph == null && connection.supportedPids.includes('0110')"), 'MAF só deve ser consultado como fallback quando suportado pela ECU');
  assert.ok(autoTripServiceSource.includes("connection.supportedPids.includes('010B') &&\n          connection.supportedPids.includes('010F')"), 'fallback MAP exige suporte confirmado aos PIDs MAP e IAT');
  assert.ok(!autoTripServiceSource.includes('recordLivePidQuery('), 'telemetria automática deve registrar cada resposta uma única vez via registerObdQuery');
  writeDelayMs = 0;
}

function testPidResponseIsNotVehicleValidation() {
  const integration = fs.readFileSync(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'), 'utf8');
  assert.ok(integration.includes("status: prior?.status === 'CONFIRMADO' ? 'CONFIRMADO' : 'RESPONDEU'"), 'resposta válida não deve promover automaticamente PID para confirmado');
  assert.ok(integration.includes('não valida a exatidão física do sensor'), 'o código deve documentar que resposta OBD não comprova exatidão elétrica do sensor');
}

function testStorageScreenDoesNotPromoteSeedOrInvalidFuel() {
  const storageScreen = fs.readFileSync(path.join(ROOT, 'app/armazenamento.tsx'), 'utf8');
  assert.ok(storageScreen.includes("filter((cycle) => cycle.source === 'REAL_OBD')"), 'tela de histórico não deve apresentar viagens seed do Car Scanner como viagens do app');
  assert.ok(storageScreen.includes("cycle.fuelDataValid !== false"), 'consumo precisa respeitar o indicador de confiabilidade');
  assert.ok(storageScreen.includes("cycle.fuelUsedL >= 0.05"), 'consumo deve exigir volume de combustível válido');
  assert.ok(storageScreen.includes("'Consumo: N/D'"), 'consumo inválido deve ser apresentado como N/D, nunca 0,00 km/L');
}


async function testAutosaveRace() {
  resetFS();
  const m = loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
  m.disposeAutoSave();
  await m.initAutoSave(BASE);

  m.updateAutoSaveState((state) => {
    state.settings.fase = 'primeira';
  });

  writeDelayMs = 40;
  const savePromise = m.saveNow('critical');
  await wait(5);

  m.updateAutoSaveState((state) => {
    state.settings.fase = 'segunda';
  });

  const saved = await savePromise;
  assert.strictEqual(saved, true);
  writeDelayMs = 0;

  await wait(1700);
  const envelope = JSON.parse(files.get(`${BASE}/CONFIG/autosave.json`));
  assert.strictEqual(envelope.payload.settings.fase, 'segunda');
  m.disposeAutoSave();
}

(function testDtcOccurrenceSemantics() {
  const dtcManager = loadTs(path.join(ROOT, 'src/database/dtcManager.ts'));
  assert.strictEqual(dtcManager.nextDtcOccurrences(undefined), 1, 'novo DTC deve iniciar em 1');
  assert.strictEqual(dtcManager.nextDtcOccurrences({ status: 'CURRENT', occurrences: 4 }), 4, 'leitura repetida não deve inflar ocorrências');
  assert.strictEqual(dtcManager.nextDtcOccurrences({ status: 'INACTIVE', occurrences: 4 }), 5, 'novo ciclo após inatividade deve incrementar ocorrência');
})();

async function main() {
  const tests = [
    ['banco de fórmulas OBD', testFormulaKnowledgeBank],
    ['parser + DTC', testParser],
    ['elm/protocolo/serialização', testElmAndProtocol],
    ['limite configurável de retry Bluetooth', testConfiguredBluetoothRetryLimit],
    ['ativação oficial do Bluetooth', testBluetoothActivationRequest],
    ['bloqueio de troca silenciosa de adaptador', testActiveAdapterCannotBeSilentlySwitched],
    ['seleção estrita + gate ECU', testConnectionSelectionAndStrictEcuGate],
    ['gate de validação ECU/010C', testEcuValidationGate],
    ['descoberta de PIDs', testPidScanner],
    ['IA burrinha de PIDs', testIntelligentPidDiscovery],
    ['CarScanner baseline + PID 012F', testCarScannerBaselineAndFuel012F],
    ['Bluetooth callbacks', testBluetoothConnectionCallbacks],
    ['Bluetooth por eventos', testBluetoothEventTransport],
    ['quota configurável', testQuota],
    ['logger TX/RX', testRawLogger],
    ['perfil do veículo', testVehicleProfile],
    ['drive cycles', testDriveCycleValidation],
    ['resumo de velocidade real ponderado', testDriveCycleSummaryUsesWeightedRealSpeed],
    ['DTC persistência', testDtcStorage],
    ['backup completo', testBackupCompleteness],
    ['CSV serializado', testCsvWriteSerialization],
    ['PID + DNA serializados', testPidAndLearningWriteSerialization],
    ['PID respondeu não significa sensor validado', testPidResponseIsNotVehicleValidation],
    ['histórico sem seed e consumo N/D', testStorageScreenDoesNotPromoteSeedOrInvalidFuel],

    ['autosave race', testAutosaveRace],
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`PASS regression: ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL regression: ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  console.log(failed === 0 ? `\\n${tests.length} regressões: TODAS PASSARAM` : `\\n${tests.length} regressões: ${failed} FALHARAM`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();

// CI trigger: execute regression suite on GitHub Actions.
