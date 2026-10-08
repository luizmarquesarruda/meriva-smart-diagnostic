'use strict';

const assert = require('assert');
const { loadTs } = require('./helpers/loadTs');
const state = loadTs('src/obd/bluetoothState.ts');

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

assert.strictEqual(state.canPollObd('READY', 'RESPONDING'), true);
assert.strictEqual(state.canPollObd('READY', 'NO_RESPONSE'), false);
assert.strictEqual(state.canPollObd('READY', 'RECOVERING'), false);
assert.strictEqual(state.canPollObd('READY', 'NOT_VALIDATED'), false);
assert.strictEqual(state.canPollObd('ECU_RESPONDING', 'RESPONDING'), false);
assert.strictEqual(state.canPollObd('ELM_INITIALIZED', 'RESPONDING'), false);
assert.strictEqual(state.canPollObd('BLUETOOTH_CONNECTED', 'RESPONDING'), false);
assert.strictEqual(state.canPollObd('BLUETOOTH_OFF', 'RESPONDING'), false);

console.log('bluetoothState.test.js: OK');
