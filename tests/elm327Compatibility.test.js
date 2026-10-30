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
  Module._load = function(request, parent, isMain) {
    if (parent && parent.filename === tsPath && Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    return originalLoad.apply(this, arguments);
  };
  try { mod._compile(output, tsPath); }
  finally { Module._load = originalLoad; }
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
const { classifyElmError, mergeCompatibilityConfig, getRecoveryProtocolCommand, resolveMaxConnectionAttempts } = compatibility;
assert.equal(classifyElmError('NO DATA'), 'NO_DATA');
assert.equal(classifyElmError('BUFFER FULL'), 'BUFFER_FULL');
assert.equal(classifyElmError('BUS ERROR'), 'BUS_ERROR');
assert.equal(classifyElmError('', 'TIMEOUT'), 'TIMEOUT');
assert.equal(classifyElmError('?'), 'UNSUPPORTED');
const cfg = mergeCompatibilityConfig({ adaptiveTiming: true, adaptiveTimeoutMinMs: 2500, adaptiveTimeoutMaxMs: 12000 });
assert.equal(cfg.adaptiveTiming, true);
assert.equal(cfg.adaptiveTimeoutMinMs, 2500);
assert.equal(cfg.adaptiveTimeoutMaxMs, 12000);
assert.equal(getRecoveryProtocolCommand('ISO 14230-4 (KWP FAST)'), 'ATSP5');
assert.equal(getRecoveryProtocolCommand('ISO 14230-4 (KWP 5BAUD)'), 'ATSP4');
assert.equal(getRecoveryProtocolCommand('ISO 9141-2'), 'ATSP3');
assert.equal(getRecoveryProtocolCommand('SAE J1850 PWM'), 'ATSP1');
assert.equal(getRecoveryProtocolCommand('SAE J1850 VPW'), 'ATSP2');
assert.equal(getRecoveryProtocolCommand('ISO 15765-4 CAN 11/500'), 'ATSP6');
assert.equal(getRecoveryProtocolCommand('unknown'), 'ATSP0');
assert.equal(resolveMaxConnectionAttempts(0, 3), 3);
assert.equal(resolveMaxConnectionAttempts(10, 3), 10);
assert.equal(resolveMaxConnectionAttempts(Number.NaN, 3), 3);
assert.equal(mergeCompatibilityConfig().maxConnectionAttempts, 0, 'zero means use finite catalog retry default');
const defaults = mergeCompatibilityConfig();
assert.equal(defaults.maxConnectionAttempts, 0);
assert.equal(defaults.ioTimeoutMs, 15000);
assert.equal(defaults.adaptiveTimeoutMaxMs, 15000);
assert.equal(defaults.optionalAtTimeoutMs, 2500);
assert.equal(defaults.protocolSelectionTimeoutMs, 15000);
const customTimeouts = mergeCompatibilityConfig({ optionalAtTimeoutMs: 1800, protocolSelectionTimeoutMs: 9000 });
assert.equal(customTimeouts.optionalAtTimeoutMs, 1800);
assert.equal(customTimeouts.protocolSelectionTimeoutMs, 9000);
console.log('ELM327 compatibility regression tests: PASS');


(async () => {
  const parserStub = { parsePidResponse: () => ({ status: 'RESPONDEU', value: 800, unit: 'rpm' }) };
  const { Elm327Session } = loadTs(
    path.join(__dirname, '..', 'src', 'obd', 'elm327.ts'),
    { './parser': parserStub, './elm327Compatibility': compatibility },
  );
  class FakeTransport {
    failNextWrite = false;
    timeoutNextRead = false;
    async open() {}
    async close() {}
    async write() {
      if (this.failNextWrite) {
        this.failNextWrite = false;
        throw new Error('NATIVE WRITE FAILURE');
      }
    }
    async readUntilPrompt() {
      if (this.timeoutNextRead) {
        this.timeoutNextRead = false;
        throw new Error('TIMEOUT: RESPOSTA ELM SEM PROMPT FINAL');
      }
      return 'OK';
    }
  }
  const transport = new FakeTransport();
  const session = new Elm327Session(transport, {
    ...compatibility.DEFAULT_ELM327_COMPATIBILITY,
    commandDelayMs: 0, adaptiveTiming: false, ioTimeoutMs: 1000,
    optionalAtTimeoutMs: 1000, protocolSelectionTimeoutMs: 1000,
  });
  await session.initialize();
  transport.failNextWrite = true;
  const writeFailure = await session.executeCommand('010C');
  assert.equal(writeFailure.status, 'ERROR');
  let health = session.getHealthSnapshot();
  assert.equal(health.timeouts, 0, 'falha de escrita não pode inflar timeout');
  assert.equal(health.errors, 1, 'falha de escrita deve aumentar errors');
  transport.timeoutNextRead = true;
  const readTimeout = await session.executeCommand('010D');
  assert.equal(readTimeout.status, 'TIMEOUT');
  health = session.getHealthSnapshot();
  assert.equal(health.timeouts, 1, 'somente timeout real incrementa timeouts');
  assert.equal(health.errors, 1, 'timeout não duplica em errors');
  await session.close();
  console.log('ELM327 health counters: PASS');
})().catch((error) => { console.error(error); process.exitCode = 1; });
