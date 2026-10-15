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
let failReadPath = null;
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
  failReadPath = null;
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
    if (failReadPath === p) {
      failReadPath = null;
      throw new Error('READ IO FAILURE: ' + p);
    }
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

  const absoluteLoad = engine.decodeFormula('U16_SCALE_255', '0143', [0xFF, 0xFF]);
  assert.strictEqual(absoluteLoad.value, 25700);
  assert.strictEqual(absoluteLoad.valid, true, 'PID 0143 admite a faixa padronizada de até 25700%, não apenas 100%');

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

  const sparkReadiness = parser.parsePidResponse('0101', '41 01 00 70 01 01');
  assert.ok(sparkReadiness.interpretation.includes('CICLO OTTO/SI'));
  assert.ok(sparkReadiness.interpretation.includes('CATALISADOR=NÃO PRONTO'));
  assert.ok(sparkReadiness.interpretation.includes('CATALISADOR'));

  // On compression-ignition engines C/D encode NMHC, NOx/SCR, boost,
  // exhaust-sensor and particulate-filter monitors—not gasoline EVAP/O2 bits.
  const dieselReadiness = parser.parsePidResponse('0101', '41 01 00 78 A9 A9');
  assert.ok(dieselReadiness.interpretation.includes('DIESEL/CI'));
  assert.ok(dieselReadiness.interpretation.includes('CATALISADOR_NMHC=NÃO PRONTO'));
  assert.ok(dieselReadiness.interpretation.includes('NOX_SCR'));
  assert.ok(dieselReadiness.interpretation.includes('PRESSAO_TURBO'));
  assert.ok(!dieselReadiness.interpretation.includes('EVAP'));
  assert.ok(!dieselReadiness.interpretation.includes('AQUECEDOR_O2'));
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

  // Optional AT commands that explicitly return '?' are unsupported, not
  // transient failures; retrying them only adds fixed delays to every connect.
  const initCommands = [];
  const readTimeouts = [];
  let currentResponse = '';
  let currentCommand = '';
  const unsupportedAtTransport = {
    async open() {},
    async close() {},
    async write(data) {
      const command = data.trim();
      currentCommand = command;
      initCommands.push(command);
      const payload = command === 'ATZ'
        ? 'ELM327 v1.5'
        : command === 'ATI'
          ? '?'
          : command === 'ATE0'
            ? 'NO DATA'
            : command === 'ATDP'
            ? 'ISO 14230-4 (KWP FAST)'
            : 'OK';
      currentResponse = payload + String.fromCharCode(13, 10) + '>';
    },
    async readUntilPrompt(timeoutMs) {
      readTimeouts.push({ command: currentCommand, timeoutMs });
      return currentResponse;
    },
  };
  const unsupportedAtSession = new Elm327Session(unsupportedAtTransport, { commandDelayMs: 0 });
  const initResults = await unsupportedAtSession.initialize();
  assert.strictEqual(initCommands.filter((command) => command === 'ATI').length, 1,
    'ATI explicitamente não suportado não deve esperar retries inúteis');
  assert.strictEqual(initCommands.filter((command) => command === 'ATE0').length, 1,
    'comandos AT opcionais não devem repetir erros transitórios durante a inicialização');
  assert.strictEqual(initResults.find((result) => result.command === 'ATI').status, 'UNSUPPORTED');
  assert.strictEqual(readTimeouts.find((item) => item.command === 'ATI').timeoutMs, 2500,
    'comandos AT locais opcionais devem ter timeout curto');
  assert.strictEqual(readTimeouts.find((item) => item.command === 'ATSP0').timeoutMs, 15000,
    'ATSP0 deve manter o timeout completo para negociação K-Line');
  await unsupportedAtSession.close();
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
  const commands = [];
  const fakeSession = {
    async executeCommand(pid) {
      commands.push(pid);
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
    knownPids: ['015E', '0110'],
    prevalidatedResults: [{
      command: '010C',
      response: '41 0C 1A F8',
      status: 'OK',
      elapsedMs: 10,
      attempt: 1,
    }],
  });
  assert.ok(result.supportedPids.includes('010C'));
  assert.strictEqual(result.confidence['010C'], 1);
  assert.strictEqual(result.observations.find((item) => item.pid === '010C').status, 'CONFIRMADO');
  assert.strictEqual(result.observations.find((item) => item.pid === '010C').value, 1726);
  assert.strictEqual(commands.filter((pid) => pid === '010C').length, 0, 'descoberta deve reaproveitar a sonda 010C validada');
  assert.strictEqual(commands.filter((pid) => pid === '010D').length, 1, 'PID de velocidade deve ser testado uma vez após a bitmap');
  assert.ok(commands.indexOf('010D') > commands.indexOf('0100'), 'PID fora do gate ECU deve aguardar o anúncio de suporte');
  assert.strictEqual(commands.filter((pid) => pid === '012F').length, 1, 'PID de nível de tanque anunciado pela bitmap deve ser consultado uma vez e validado pela resposta real');
  assert.ok(!commands.includes('015E'), 'não consultar taxa de combustível sem bitmap indicando suporte');
  assert.ok(!commands.includes('0110'), 'não consultar PID fora da lista anunciada pela bitmap');
  assert.ok(!commands.includes('0140') && !commands.includes('0160'), 'não consultar páginas bitmap que a ECU não anunciou');
  assert.ok(!result.supportedPids.includes('010D'), 'bitmap não deve transformar PID sem payload válido em PID operacional');
  assert.ok(!result.supportedPids.includes('012F'), 'PID anunciado mas sem resposta individual não deve entrar no polling runtime');
  assert.ok(result.supportedPids.includes('0105'), 'PID com resposta real válida deve continuar disponível');
}

async function testRealOnlyLearningAndFuel012F() {
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

  await learning.createLearningProfile(BASE, new Date().toISOString());
  let profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.seedSamples, 0);
  assert.strictEqual(profile.globalSampleCounts.totalSamples, 0);
  assert.strictEqual(profile.source, 'REAL_ONLY');
  await learning.updateLearningProfileRealSample(BASE, 'Engine RPM', 800, 'IDLE_WARM');
  profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.realSamples, 1);
  assert.strictEqual(profile.globalSampleCounts.seedSamples, 0);
  assert.strictEqual(profile.overallStatistics['Engine RPM'].mean, 800);
  assert.deepStrictEqual(profile.overallStatistics['Engine RPM'].source, ['REAL_OBD']);

  // Simula um perfil legado contaminado e verifica a purga sem perder estatística real limpa.
  const profilePath = `${BASE}/APRENDIZADO/dna_meriva.json`;
  const legacy = JSON.parse(files.get(profilePath));
  legacy.source = 'HYBRID';
  legacy.seedVersion = 'CARSCANNER_2026-09-24';
  legacy.seedImportDate = '2026-09-24T14:48:00.000Z';
  legacy.seedWeight = 0.25;
  legacy.globalSampleCounts.seedSamples = 10;
  legacy.globalSampleCounts.totalSamples = legacy.globalSampleCounts.realSamples + 10;
  legacy.overallStatistics['Legacy contaminated PID'] = {
    mean: 778, median: 778, min: 778, max: 800, stddev: 10,
    samples: 2, realSamples: 1, seedSamples: 1, confidence: 'LOW',
    lastUpdate: new Date().toISOString(), source: ['CARSCANNER_BASELINE', 'REAL_OBD'],
    medianWindow: [778, 800],
  };
  files.set(profilePath, JSON.stringify(legacy));
  const purged = await learning.purgeCarScannerHistory(BASE);
  assert.strictEqual(purged.globalSampleCounts.seedSamples, 0);
  assert.strictEqual(purged.globalSampleCounts.totalSamples, purged.globalSampleCounts.realSamples);
  assert.strictEqual(purged.source, 'REAL_ONLY');
  assert.ok(!purged.overallStatistics['Legacy contaminated PID'], 'estatística misturada deve ser descartada');
  assert.strictEqual(purged.overallStatistics['Engine RPM'].mean, 800, 'estatística real limpa deve ser preservada');

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
  const csvLogger = loadTs(path.join(ROOT, 'src/database/csvLogger.ts'));
  assert.strictEqual(logger.getObdLogLocalDateKey(new Date(2026, 9, 12, 23, 59)), '2026-10-12',
    'a partição diária deve usar a data local do aparelho, sem virar de dia pelo timestamp UTC');
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
  const secondQuery = {
    ...query,
    rx: '41 0C 0F A0',
    parsed: parser.parsePidResponse('010C', '41 0C 0F A0'),
  };
  await logger.logRawObdData(BASE, secondQuery, '010C', 'REAL');
  await logger.logInterpretedData(BASE, secondQuery, '010C', 'REAL');
  assert.strictEqual(files.size, 0, 'logs de alta frequência devem ser enfileirados sem bloquear o caminho de leitura');
  await csvLogger.flushCsvLogs();

  const rawFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_raw_'));
  const interpretedFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_interpreted_'));
  assert.ok(rawFile);
  assert.ok(interpretedFile);

  const raw = files.get(rawFile);
  const interpreted = files.get(interpretedFile);
  assert.ok(raw.startsWith('timestamp,tx,rx,pid,responseTimeMs,commandStatus,protocol,source'));
  assert.ok(raw.includes('010C,41 0C 1A F8'));
  assert.ok(raw.includes('010C,41 0C 0F A0'));
  assert.strictEqual(raw.trim().split('\n').length, 3, 'o flush deve gravar cabeçalho e duas amostras raw em um lote');
  assert.ok(interpreted.includes('010C,41 0C 1A F8'));
  assert.ok(interpreted.includes('010C,41 0C 0F A0'));
  assert.strictEqual(interpreted.trim().split('\n').length, 3, 'o flush deve preservar todas as amostras interpretadas');
  const thirdQuery = {
    ...secondQuery,
    rx: '41 0C 20 00',
    parsed: parser.parsePidResponse('010C', '41 0C 20 00'),
  };
  await logger.logRawObdData(BASE, thirdQuery, '010C', 'REAL');
  await logger.logInterpretedData(BASE, thirdQuery, '010C', 'REAL');
  failReadPath = rawFile;
  await assert.rejects(() => csvLogger.flushCsvLogs(), /READ IO FAILURE/,
    'falha de leitura deve permanecer explícita e não descartar o lote');
  await csvLogger.flushCsvLogs();
  const rawAfterRetry = files.get(rawFile);
  const interpretedAfterRetry = files.get(interpretedFile);
  assert.ok(rawAfterRetry.includes('010C,41 0C 20 00'), 'lote raw deve permanecer pendente e ser gravado na tentativa seguinte');
  assert.ok(interpretedAfterRetry.includes('010C,41 0C 20 00'), 'lote interpretado deve permanecer pendente e ser gravado na tentativa seguinte');
  assert.ok(interpreted.includes('ISO 14230-4 (KWP FAST)'));

  // Boundary regression: a local-day partition near midnight must match even
  // though ISO timestamps are already on the following UTC date.
  resetFS();
  const NativeDate = global.Date;
  class BoundaryDate extends NativeDate {
    constructor(...args) {
      super(...(args.length ? args : ['2026-10-13T02:00:00.000Z']));
    }
    getFullYear() { return 2026; }
    getMonth() { return 9; }
    getDate() { return 12; }
    toISOString() { return '2026-10-13T02:00:00.000Z'; }
    static now() { return NativeDate.parse('2026-10-13T02:00:00.000Z'); }
  }
  global.Date = BoundaryDate;
  try {
    await logger.logRawObdData(BASE, query, '010C', 'REAL');
    await logger.logInterpretedData(BASE, query, '010C', 'REAL');
    await csvLogger.flushCsvLogs();
  } finally {
    global.Date = NativeDate;
  }
  assert.ok(files.has(BASE + '/LOGS/obd_raw_2026-10-12.csv'),
    'raw log must use the local calendar date');
  assert.ok(files.has(BASE + '/LOGS/obd_interpreted_2026-10-12.csv'),
    'interpreted log must use the same local date, not the UTC day');
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

  // If the live index becomes malformed, restore the last-known-good backup
  // instead of silently presenting an empty history.
  files.set(indexFile, JSON.stringify({ cycles: 'corrompido' }));
  const recovered = await storage.readDriveCycles(BASE);
  assert.deepStrictEqual(recovered.map((item) => item.id).sort(), ['test-1', 'test-2']);
  assert.deepStrictEqual(JSON.parse(files.get(indexFile)).cycles.map((item) => item.id).sort(), ['test-1', 'test-2']);

  // Concurrent trip completions must serialize their read-modify-write cycle.
  resetFS();
  await Promise.all([
    storage.addDriveCycle(BASE, { ...cycle, id: 'parallel-a' }),
    storage.addDriveCycle(BASE, { ...cycle, id: 'parallel-b' }),
  ]);
  const concurrent = await storage.readDriveCycles(BASE);
  assert.deepStrictEqual(concurrent.map((item) => item.id).sort(), ['parallel-a', 'parallel-b']);
  await storage.addDriveCycle(BASE, { ...cycle, id: 'parallel-a' });
  assert.strictEqual((await storage.readDriveCycles(BASE)).filter((item) => item.id === 'parallel-a').length, 1,
    'retries with the same trip ID must be idempotent');
  await assert.rejects(
    storage.addDriveCycle(BASE, { ...cycle, id: 'forbidden-seed', source: 'CARSCANNER_SEED' }),
    /CARSCANNER_SEED_NOT_ALLOWED/,
  );
  assert.ok(!(await storage.readDriveCycles(BASE)).some((item) => item.id === 'forbidden-seed'),
    'CarScanner reference trips must be rejected at the persistence boundary');

  // A corrupt primary with no backup must never be replaced by an empty index.
  resetFS();
  const corruptContent = JSON.stringify({ cycles: 'corrompido' });
  files.set(indexFile, corruptContent);
  await assert.rejects(storage.addDriveCycle(BASE, cycle), /DRIVE_CYCLE_INDEX_UNREADABLE/);
  assert.strictEqual(files.get(indexFile), corruptContent, 'unreadable history must remain preserved for manual recovery');

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
  const noMovingTimeTrip = {
    ...slowLongTrip,
    id: 'real-no-moving-time',
    startedAt: '2026-10-05T10:00:00.000Z',
    distanceTotalKm: 8,
    drivingTimeHms: '00:00:00',
  };
  const summary = driveCycles.getDriveCycleSummary([slowLongTrip, shortFastTrip, latestSeed, noFuelTrip, noMovingTimeTrip]);
  assert.strictEqual(summary.avgSpeedKmh, 20, 'trips without moving time must not inflate aggregate speed');
  assert.strictEqual(summary.totalDistanceKm, 23, 'seed distance is excluded, but all real trip distance remains included');
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
  assert.ok(cockpitSource.includes("item.pid === '0105'"), 'cockpit deve identificar temperatura do líquido pelo PID 0105');
  assert.ok(cockpitSource.includes("item.source !== 'REAL'"), 'cockpit não deve exibir temperatura simulada como dado real');
  assert.ok(cockpitSource.includes('ageMs >= 0 && ageMs <= 30_000'), 'cockpit deve descartar temperatura OBD futura ou obsoleta após 30 segundos');
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
  assert.ok(autoTripServiceSource.includes("this.pollCycleNumber % FUEL_LEVEL_EVERY_N_CYCLES === pollingPolicy.polling.fuelLevel.phase"), 'nível do tanque deve seguir a cadência centralizada no JSON');
  assert.ok(autoTripServiceSource.includes("fuelLevelResult.parsed.unit === 'percent'"), 'o nível do tanque deve aceitar a unidade real do parser (percent)');
  assert.ok(!autoTripServiceSource.includes("fuelLevelResult.parsed.unit === '%'"), 'a unidade incompatível não deve invalidar o PID 012F');
  assert.ok(autoTripServiceSource.includes("fuelRateLph == null && fuelEstimateDue && connection.supportedPids.includes('0110')"), 'MAF só deve ser consultado como fallback quando suportado e na cadência reduzida');
  assert.ok(autoTripServiceSource.includes("connection.supportedPids.includes('010B') &&\n          connection.supportedPids.includes('010F')"), 'fallback MAP exige suporte confirmado aos PIDs MAP e IAT');
  assert.ok(autoTripServiceSource.includes('!(mapFallbackQueriedThisCycle && item === pollingPolicy.polling.estimatedFuelRate.mapPid)'), 'MAP usado no fallback não deve ser consultado novamente na telemetria rotativa');
  assert.ok(autoTripServiceSource.includes('FUEL_RATE_DISPLAY_STALE_AFTER_MS'), 'valor em cache deve ter prazo explícito de expiração para exibição');
  assert.ok(!autoTripServiceSource.includes('recordLivePidQuery('), 'telemetria automática deve registrar cada resposta uma única vez via registerObdQuery');
  writeDelayMs = 0;
}

function testAcquisitionPolicyConsistency() {
  const root = path.join(ROOT, 'src');
  const autoTrip = fs.readFileSync(path.join(root, 'trip/autoTripService.ts'), 'utf8');
  const settings = fs.readFileSync(path.join(root, 'database/appSettings.ts'), 'utf8');
  const learning = fs.readFileSync(path.join(root, 'meriva/autosaveIntegration.ts'), 'utf8');
  const history = fs.readFileSync(path.join(root, 'meriva/autosaveHistoryTxt.ts'), 'utf8');
  const logger = fs.readFileSync(path.join(root, 'database/obdLogger.ts'), 'utf8');
  const policy = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/polling_policy.json'), 'utf8'));
  const bluetooth = JSON.parse(fs.readFileSync(path.join(root, 'knowledge/bluetooth_config.json'), 'utf8'));
  const settingsUi = fs.readFileSync(path.join(ROOT, 'app/configuracoes.tsx'), 'utf8');

  assert.strictEqual(policy.version, 2);
  assert.strictEqual(policy.polling.fuelComposition.pid, '0152');
  assert.strictEqual(policy.polling.fuelComposition.everyCycles, 30);
  assert.strictEqual(bluetooth.schemaVersion, 2);
  assert.strictEqual(bluetooth.initialization.optionalCommandTimeoutMs, 2500);
  assert.strictEqual(bluetooth.initialization.protocolSelectionTimeoutMs, 15000);
  assert.ok(autoTrip.includes('readAppSettings(basePath)'), 'serviço deve carregar combustível selecionado');
  assert.ok(autoTrip.includes('subscribeAppSettings'), 'mudança de combustível deve chegar ao serviço ativo sem polling de arquivo');
  assert.ok(autoTrip.includes('fuelType: this.fuelType, ethanolPercent: this.lastFuelEthanolPercent'),
    'cálculos MAF/MAP devem usar tipo e composição de combustível');
  assert.ok(autoTrip.includes('(!this.state.fuelSupported || fuelRateLph == null)'),
    'PID 0152 deve poder alimentar o fallback quando PID 015E falha');
  assert.ok(autoTrip.includes('queryPid(fuelCompositionPolicy.pid)'), 'composição do combustível deve ser consultada apenas pela política centralizada');
  assert.ok(settings.includes('subscribeAppSettings') && settings.includes('publishSettings(settings)'),
    'configurações devem notificar serviços ativos após leitura/escrita');
  assert.ok(learning.includes('enqueueLearningPersistence(async () => {'),
    'I/O de aprendizado deve ficar fora do caminho crítico de polling serial');
  assert.ok(history.includes('deduplicateEntries') && history.includes('historyQueues'),
    'histórico deve deduplicar registros legados e serializar read-modify-write');
  assert.ok((logger.match(/const today = getObdLogLocalDateKey\(\);/g) || []).length >= 2,
    'logs RAW e interpretados devem usar a mesma chave de data local do dispositivo');
  assert.ok(settingsUi.includes('PID 0152') && settingsUi.includes('PID 015E'),
    'UI deve explicar requisito de composição no modo FLEX e precedência de combustível medido');
}

function testPidResponseIsNotVehicleValidation() {
  const integration = fs.readFileSync(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'), 'utf8');
  assert.ok(integration.includes("status: prior?.status === 'CONFIRMADO' && prior.source === 'USER_REAL_OBSERVATION' ? 'CONFIRMADO' : 'RESPONDEU'"), 'resposta válida não deve promover automaticamente PID para confirmado');
  assert.ok(integration.includes('não valida a exatidão física do sensor'), 'o código deve documentar que resposta OBD não comprova exatidão elétrica do sensor');

  const runtime = loadTs(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'));
  const basePath = '/doc/learning-throttle-regression';
  assert.strictEqual(runtime.shouldPersistRealPidSample(basePath, '010C', 1000), true);
  assert.strictEqual(runtime.shouldPersistRealPidSample(basePath, '010C', 2000), false,
    'mesmo PID não deve regravar aprendizado antes da janela mínima');
  assert.strictEqual(runtime.shouldPersistRealPidSample(basePath, '010C', 5999), false);
  assert.strictEqual(runtime.shouldPersistRealPidSample(basePath, '010C', 6000), true,
    'o PID volta a alimentar o aprendizado quando termina a janela mínima');
  assert.strictEqual(runtime.shouldPersistRealPidSample(basePath, '0105', 2000), true,
    'a cadência deve ser independente por PID');
}

function testStorageScreenDoesNotPromoteSeedOrInvalidFuel() {
  // A lista de viagens vive em app/viagens.tsx; app/armazenamento.tsx é a central de relatórios.
  const tripsScreen = fs.readFileSync(path.join(ROOT, 'app/viagens.tsx'), 'utf8');
  assert.ok(tripsScreen.includes("items.filter(cycle => cycle.source === 'REAL_OBD')"), 'tela de viagens não deve apresentar viagens seed do CarScanner como viagens do app');
  assert.ok(tripsScreen.includes("cycle.fuelDataValid === false || cycle.fuelUsedL < 0.05 || cycle.avgFuelConsumptionKml <= 0 ? 'CONSUMO N/D'"), 'tela de viagens deve exibir N/D quando os dados de consumo não forem confiáveis');

  // A exportação TXT também deve excluir viagens não reais e não inventar consumo.
  const exports = fs.readFileSync(path.join(ROOT, 'src/storage/exportDiagnostics.ts'), 'utf8');
  assert.ok(exports.includes(".filter((cycle) => cycle.source === 'REAL_OBD')"), 'relatórios TXT não devem promover viagens importadas como reais');
  assert.ok(exports.includes("cycle.fuelDataValid === false || !Number.isFinite(cycle.fuelUsedL) || cycle.fuelUsedL < 0.05"), 'consumo no TXT deve respeitar a validação mínima de combustível');
  assert.ok(exports.includes("return 'N/D'"), 'consumo inválido deve ser apresentado como N/D, nunca como zero presumido');
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
    ['CarScanner baseline + PID 012F', testRealOnlyLearningAndFuel012F],
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
    ['contratos de aquisição e persistência', testAcquisitionPolicyConsistency],
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
