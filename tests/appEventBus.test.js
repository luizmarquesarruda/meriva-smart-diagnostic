const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(output, sourcePath);
  return mod.exports;
}

const bus = loadTs('src/state/appEventBus.ts');
const received = [];
const unsubscribe = bus.subscribeAppEvents((event) => received.push(event));
bus.emitAppEvent('OBD_TELEMETRY_UPDATED', { pid: '010C' });
bus.emitAppEvent('BLUETOOTH_STATUS_CHANGED');
unsubscribe();
bus.emitAppEvent('DTC_UPDATED');

assert.strictEqual(received.length, 2);
assert.strictEqual(received[0].type, 'OBD_TELEMETRY_UPDATED');
assert.strictEqual(received[0].pid, '010C');
assert.ok(received[0].timestamp);

console.log('appEventBus.test.js: PASS');
