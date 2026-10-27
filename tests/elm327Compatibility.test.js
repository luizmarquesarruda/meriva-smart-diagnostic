const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(tsPath, overrides = {}) {
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
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === tsPath && Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    return originalLoad.apply(this, arguments);
  };
  try { mod._compile(output, tsPath); } finally { Module._load = originalLoad; }
  return mod.exports;
}

function normalize(response) { return response.replace(/\0/g, '').replace(/\r\n/g, '\n').replace(/\r/g, '\n').replace(/[ \t]+$/gm, '').trim(); }
function unsupported(response) { const value = normalize(response).toUpperCase(); return value === '?' || value.includes('UNKNOWN COMMAND') || value.includes('UNSUPPORTED'); }
function classify(response) { const value = normalize(response).toUpperCase(); if (!value) return 'NO_RESPONSE'; if (unsupported(value)) return 'UNSUPPORTED'; if (/\b(NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED|ERROR)\b/.test(value)) return 'ERROR'; return 'OK'; }

assert.equal(normalize('ATI\r\nELM327 v1.5\r\n'), 'ATI\nELM327 v1.5');
assert.equal(classify('OK\r\n'), 'OK');
assert.equal(classify('?\r\n'), 'UNSUPPORTED');
assert.equal(classify('NO DATA\r\n'), 'ERROR');
assert.equal(classify('BUS ERROR\r\n'), 'ERROR');
assert.equal(classify('ELM327 v1.5\r\n>'), 'OK');
assert.equal(classify(''), 'NO_RESPONSE');

const compatibility = loadTs(path.join(__dirname, '..', 'src', 'obd', 'elm327Compatibility.ts'));
const {
  classifyElmError,
  getRecoveryProtocolCommand,
  mergeCompatibilityConfig,
  DEFAULT_ELM327_COMPATIBILITY,
} = compatibility;

assert.equal(getRecoveryProtocolCommand('ISO 14230-4 (KWP FAST)'), 'ATSP5');
assert.equal(getRecoveryProtocolCommand('ISO 14230-4 (KWP 5BAUD)'), 'ATSP4',
  'KWP 5-baud must not be forced into fast initialization during recovery');
assert.equal(getRecoveryProtocolCommand('ISO 9141-2'), 'ATSP3');
assert.equal(getRecoveryProtocolCommand('SAE J1850 PWM'), 'ATSP1');
assert.equal(getRecoveryProtocolCommand('SAE J1850 VPW'), 'ATSP2');
assert.equal(getRecoveryProtocolCommand('ISO 15765-4 CAN 11/500'), 'ATSP6');
assert.equal(getRecoveryProtocolCommand('ISO 15765-4 CAN 29/500'), 'ATSP7');
assert.equal(getRecoveryProtocolCommand('ISO 15765-4 CAN 11/250'), 'ATSP8');
assert.equal(getRecoveryProtocolCommand('ISO 15765-4 CAN 29/250'), 'ATSP9');
assert.equal(getRecoveryProtocolCommand('SIMULATED OBD TRANSPORT'), 'ATSP0',
  'unknown protocol must fall back to automatic detection, not a guessed forced protocol');
assert.equal(classifyElmError('NO DATA'), 'NO_DATA');
assert.equal(classifyElmError('BUFFER FULL'), 'BUFFER_FULL');
assert.equal(classifyElmError('BUS ERROR'), 'BUS_ERROR');
assert.equal(classifyElmError('CAN ERROR'), 'BUS_ERROR');
assert.equal(classifyElmError('', 'TIMEOUT'), 'TIMEOUT');
assert.equal(classifyElmError('?'), 'UNSUPPORTED');
const cfg = mergeCompatibilityConfig({ adaptiveTiming: true, adaptiveTimeoutMinMs: 2500, adaptiveTimeoutMaxMs: 12000 });
assert.equal(cfg.adaptiveTiming, true);
assert.equal(cfg.adaptiveTimeoutMinMs, 2500);
assert.equal(cfg.adaptiveTimeoutMaxMs, 12000);
const defaults = mergeCompatibilityConfig();
assert.equal(defaults.maxConnectionAttempts, 0,
  'sem preferência explícita, limite de tentativas vem do catálogo Bluetooth e não de um segundo default');
assert.equal(compatibility.resolveMaxConnectionAttempts(defaults.maxConnectionAttempts, 3), 3,
  'a política padrão deve efetivamente resolver para três tentativas');
assert.equal(compatibility.resolveMaxConnectionAttempts(10, 3), 10,
  'a opção explícita do usuário deve continuar permitindo dez tentativas');
assert.equal(compatibility.resolveMaxConnectionAttempts(Number.NaN, 3), 3,
  'configuração inválida deve retornar ao limite seguro do catálogo');
assert.equal(defaults.ioTimeoutMs, 15000);
assert.equal(defaults.adaptiveTimeoutMaxMs, 15000);
assert.equal(defaults.optionalAtTimeoutMs, 2500);
assert.equal(defaults.protocolSelectionTimeoutMs, 15000);
const customTimeouts = mergeCompatibilityConfig({ optionalAtTimeoutMs: 1800, protocolSelectionTimeoutMs: 9000 });
assert.equal(customTimeouts.optionalAtTimeoutMs, 1800);
assert.equal(customTimeouts.protocolSelectionTimeoutMs, 9000);

const malformed = mergeCompatibilityConfig({
  ioTimeoutMs: Number.NaN,
  bluetoothConnectTimeoutMs: Number.POSITIVE_INFINITY,
  commandDelayMs: Number.NaN,
  adaptiveTimeoutMinMs: 12000,
  adaptiveTimeoutMaxMs: 3000,
  recoveryBackoffMs: [Number.NaN, Number.POSITIVE_INFINITY],
});
assert.equal(malformed.ioTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.ioTimeoutMs);
assert.equal(malformed.bluetoothConnectTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.bluetoothConnectTimeoutMs);
assert.equal(malformed.commandDelayMs, DEFAULT_ELM327_COMPATIBILITY.commandDelayMs);
assert.equal(malformed.adaptiveTimeoutMinMs, 12000);
assert.equal(malformed.adaptiveTimeoutMaxMs, 12000, 'adaptive maximum must never be below its minimum');
assert.deepEqual(malformed.recoveryBackoffMs, [2000, 5000], 'invalid backoff values must use finite defaults');

const invalidCommands = mergeCompatibilityConfig({ forceInitCommands: ['ATZ', 'not an AT command'] });
assert.deepEqual(invalidCommands.forceInitCommands, ['ATZ']);
const invalidEnum = mergeCompatibilityConfig({ partialResponseAction: 'BAD_VALUE' });
assert.equal(invalidEnum.partialResponseAction, DEFAULT_ELM327_COMPATIBILITY.partialResponseAction);

async function testRecoveryRequiresValidPidPayload() {
  const root = path.resolve(__dirname, '..');
  const formulaEngine = loadTs(path.join(root, 'src', 'obd', 'formulaEngine.ts'));
  const pidDefinition = loadTs(path.join(root, 'src', 'obd', 'pidDefinition.ts'), {
    './formulaEngine': formulaEngine,
  });
  const parser = loadTs(path.join(root, 'src', 'obd', 'parser.ts'), {
    './pidDefinition': pidDefinition,
    './formulaEngine': formulaEngine,
    './dtcParser': { parseDtcResponseForService: () => [] },
  });
  const { Elm327Session } = loadTs(path.join(root, 'src', 'obd', 'elm327.ts'), {
    './parser': parser,
    './elm327Compatibility': compatibility,
  });

  let command = '';
  const probeResponses = ['41 0C', '41 0C 1A F8'];
  const transport = {
    async open() {},
    async close() {},
    async write(data) {
      command = data.replace(/\r/g, '').trim().toUpperCase();
    },
    async readUntilPrompt() {
      if (command === 'ATZ') return 'ELM327 v1.5';
      if (command === 'ATDP') return 'ISO 14230-4 (KWP FAST)';
      if (command === '010C') return probeResponses.shift() ?? 'NO DATA';
      return 'OK';
    },
  };

  const session = new Elm327Session(transport, {
    commandDelayMs: 0,
    ioTimeoutMs: 2500,
    optionalAtTimeoutMs: 1000,
    protocolSelectionTimeoutMs: 2500,
    adaptiveTiming: false,
    forceInitialization: false,
  });
  try {
    await session.initialize();
    assert.equal(
      await session.recoverProtocol(),
      false,
      'marcador 41 0C sem payload não pode confirmar recuperação da ECU',
    );
    assert.equal(
      await session.recoverProtocol(),
      true,
      'payload completo 41 0C 1A F8 deve confirmar recuperação da ECU',
    );
  } finally {
    await session.close();
  }
}

async function testBoundedFirstProbeTimeoutOverride() {
  const root = path.resolve(__dirname, '..');
  const formulaEngine = loadTs(path.join(root, 'src', 'obd', 'formulaEngine.ts'));
  const pidDefinition = loadTs(path.join(root, 'src', 'obd', 'pidDefinition.ts'), {
    './formulaEngine': formulaEngine,
  });
  const parser = loadTs(path.join(root, 'src', 'obd', 'parser.ts'), {
    './pidDefinition': pidDefinition,
    './formulaEngine': formulaEngine,
    './dtcParser': { parseDtcResponseForService: () => [] },
  });
  const { Elm327Session } = loadTs(path.join(root, 'src', 'obd', 'elm327.ts'), {
    './parser': parser,
    './elm327Compatibility': compatibility,
  });

  let command = '';
  const timeouts = [];
  const transport = {
    async open() {},
    async close() {},
    async write(data) { command = data.replace(/\\r/g, '').trim().toUpperCase(); },
    async readUntilPrompt(timeoutMs) {
      timeouts.push({ command, timeoutMs });
      if (command === 'ATZ') return 'ELM327 v1.5';
      if (command === 'ATDP') return 'ISO 14230-4 (KWP FAST)';
      if (command === '010C') return '41 0C 1A F8';
      return 'OK';
    },
  };

  const session = new Elm327Session(transport, {
    commandDelayMs: 0,
    ioTimeoutMs: 15000,
    optionalAtTimeoutMs: 1000,
    protocolSelectionTimeoutMs: 9000,
    adaptiveTiming: true,
    adaptiveTimeoutMinMs: 3000,
    adaptiveTimeoutMaxMs: 15000,
    adaptiveTimeoutStepMs: 500,
    forceInitialization: false,
  });
  try {
    await session.initialize();
    const result = await session.executeCommand('010C', 9000);
    assert.equal(result.status, 'OK', '010C probe must still classify a complete ECU payload as a success');
    const probe = timeouts.filter((entry) => entry.command === '010C').at(-1);
    assert.equal(probe.timeoutMs, 9000,
      'first automatic ECU probe must use the explicit bounded protocol window instead of the 3 s adaptive minimum');
  } finally {
    await session.close();
  }
}

console.log('ELM327 compatibility regression tests: PASS');
testRecoveryRequiresValidPidPayload()
  .then(() => console.log('ELM327 recovery payload-gate regression: PASS'))
  .then(() => testBoundedFirstProbeTimeoutOverride())
  .then(() => console.log('ELM327 first ECU probe timeout regression: PASS'))
  .catch((error) => { console.error(error && error.stack ? error.stack : error); process.exitCode = 1; });
