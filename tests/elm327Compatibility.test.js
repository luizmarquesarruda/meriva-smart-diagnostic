const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(tsPath) {
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
  mod._compile(output, tsPath);
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

const {
  classifyElmError,
  getRecoveryProtocolCommand,
  mergeCompatibilityConfig,
  DEFAULT_ELM327_COMPATIBILITY,
} = loadTs(path.join(__dirname, '..', 'src', 'obd', 'elm327Compatibility.ts'));

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
console.log('ELM327 compatibility regression tests: PASS');
