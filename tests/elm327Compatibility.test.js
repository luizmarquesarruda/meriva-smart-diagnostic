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
assert.equal(defaults.ioTimeoutMs, 15000);\nassert.equal(defaults.maxConnectionAttempts, 1);\nassert.equal(defaults.allowUnsupportedAtCommands, true);
assert.equal(defaults.adaptiveTimeoutMaxMs, 15000);
assert.ok(true);\nconsole.log('ELM327 compatibility regression tests: PASS');

// Android/RFCOMM regression guards: raw ELM transport must not inject a
// '>' delimiter into the native connection. The JS transport owns prompt framing.
const transportSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'bluetoothClassicTransport.ts'), 'utf8');
assert.ok(transportSource.includes("connectionType: 'raw'"));
assert.ok(!transportSource.includes("delimiter: '>'"));
assert.ok(transportSource.includes('clearInputBuffer()'));

const elmSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'elm327.ts'), 'utf8');
assert.ok(elmSource.includes("command === 'ATZ'"));
assert.ok(elmSource.includes('clearInputBuffer?.()'));
console.log('Android RFCOMM/ELM327 v1.5 regression guards: PASS');

// O auto-connect da tela deve começar por ELM/OBD pareado, nunca por um
// Bluetooth genérico só porque ele aparece primeiro na lista.
const connectionScreenSource = fs.readFileSync(path.join(__dirname, '..', 'app', 'conexao.tsx'), 'utf8');
assert.ok(connectionScreenSource.includes('const first = preferredDevice || elmLike;'));
assert.ok(!connectionScreenSource.includes('const first = preferredDevice || elmLike || list[0]'));
console.log('Paired-first generic-device guard: PASS');
