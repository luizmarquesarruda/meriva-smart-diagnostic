'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src', 'obd', 'bluetoothState.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
}).outputText;

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const state = mod.exports;

for (const connected of [
  'BLUETOOTH_CONNECTED',
  'ELM_RESPONDING',
  'ELM_INITIALIZED',
  'ECU_RESPONDING',
  'READY',
]) {
  assert.strictEqual(state.isBluetoothLinkUp(connected), true, connected + ' deve manter link Bluetooth real');
}

for (const disconnected of [
  'UNSUPPORTED',
  'BLUETOOTH_OFF',
  'BLUETOOTH_ON',
  'DEVICE_SELECTED',
  'BLUETOOTH_CONNECTING',
  'DISCONNECTED',
  'ERROR',
]) {
  assert.strictEqual(state.isBluetoothLinkUp(disconnected), false, disconnected + ' não é link conectado');
}

assert.strictEqual(state.canPollObd('READY'), true);
assert.strictEqual(state.canPollObd('ECU_RESPONDING'), false);
assert.strictEqual(state.canPollObd('ELM_INITIALIZED'), false);
assert.strictEqual(state.canPollObd('BLUETOOTH_CONNECTED'), false);
assert.strictEqual(state.canPollObd('BLUETOOTH_OFF'), false);

console.log('bluetoothState.test.js: OK');
