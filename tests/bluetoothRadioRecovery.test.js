'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src', 'obd', 'bluetoothRadioRecovery.ts');
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

const {
  decideBluetoothRadioRecovery,
  getBluetoothRadioRecoveryStopReason,
} = mod.exports;

assert.equal(decideBluetoothRadioRecovery(true, new Error('socket read failed')), 'CONTINUE');
assert.equal(decideBluetoothRadioRecovery(false, new Error('socket read failed')), 'STOP_RADIO_OFF');
assert.equal(decideBluetoothRadioRecovery(null, new Error('socket read failed')), 'STOP_RADIO_STATE_UNKNOWN');
assert.equal(decideBluetoothRadioRecovery(undefined, 'timeout'), 'STOP_RADIO_STATE_UNKNOWN');
assert.equal(decideBluetoothRadioRecovery(true, 'BLUETOOTH DESLIGADO DURANTE A CONEXÃO'), 'STOP_RADIO_OFF');
assert.equal(decideBluetoothRadioRecovery(null, 'Bluetooth mAdapter is not enabled'), 'STOP_RADIO_OFF');
assert.equal(getBluetoothRadioRecoveryStopReason(new Error('Bluetooth adapter is not enabled')), 'RADIO_OFF');
assert.equal(getBluetoothRadioRecoveryStopReason(new Error('ESTADO DO BLUETOOTH NÃO PÔDE SER CONFIRMADO APÓS FALHA RFCOMM')), 'RADIO_STATE_UNKNOWN');
assert.equal(getBluetoothRadioRecoveryStopReason(new Error('java.io.IOException: read failed')), null);
console.log('bluetoothRadioRecovery.test.js: OK');
