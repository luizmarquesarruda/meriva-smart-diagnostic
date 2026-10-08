'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const { loadTs } = require('./helpers/loadTs');

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
