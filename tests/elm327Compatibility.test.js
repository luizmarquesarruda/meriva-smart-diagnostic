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

const { classifyElmError, mergeCompatibilityConfig } = loadTs(
  path.join(__dirname, '..', 'src', 'obd', 'elm327Compatibility.ts'),
);
assert.equal(classifyElmError('NO DATA'), 'NO_DATA');
assert.equal(classifyElmError('BUFFER FULL'), 'BUFFER_FULL');
assert.equal(classifyElmError('BUS ERROR'), 'BUS_ERROR');
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
assert.equal(defaults.maxConnectionAttempts, 0, 'retry count must be resolved from the bounded catalog policy');
const customTimeouts = mergeCompatibilityConfig({ optionalAtTimeoutMs: 1800, protocolSelectionTimeoutMs: 9000 });
assert.equal(customTimeouts.optionalAtTimeoutMs, 1800);
assert.equal(customTimeouts.protocolSelectionTimeoutMs, 9000);
console.log('ELM327 compatibility regression tests: PASS');


class FakeElmTransport {
  constructor() {
    this.currentCommand = '';
    this.calls = [];
  }
  async open() {}
  async close() {}
  async write(data) {
    this.currentCommand = data.replace(/\\r$/, '');
  }
  async readUntilPrompt(timeoutMs) {
    this.calls.push({ command: this.currentCommand, timeoutMs });
    if (this.currentCommand === 'ATZ') return 'ELM327 v1.5\\r>';
    if (this.currentCommand === 'ATDP') return 'AUTO\\r>';
    if (this.currentCommand === '010C') return '41 0C 1A F8\\r>';
    return 'OK\\r>';
  }
}

(async () => {
  const { Elm327Session } = loadTs(path.join(__dirname, '..', 'src', 'obd', 'elm327.ts'));
  const transport = new FakeElmTransport();
  const session = new Elm327Session(transport, { commandDelayMs: 0 });
  await session.initialize();
  const probe = await session.executeCommand('010C', 9000);
  assert.equal(probe.status, 'OK');
  const actualProbe = transport.calls.filter((call) => call.command === '010C').pop();
  assert.ok(actualProbe, 'o transporte deve receber a sonda ECU');
  assert.equal(actualProbe.timeoutMs, 9000,
    'timeout explícito da primeira sonda ECU deve chegar ao readUntilPrompt dentro da fila serial');
  await session.close();
  console.log('ELM327 ECU probe timeout regression: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
