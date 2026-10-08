'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const transport = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothClassicTransport.ts'), 'utf8');
const manager = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothManager.ts'), 'utf8');
const shared = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'sharedConnection.ts'), 'utf8');
const rootLayout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
const bluetoothScreen = fs.readFileSync(path.join(ROOT, 'app', 'bluetooth.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(ROOT, 'app', 'index.tsx'), 'utf8');

assert(transport.includes('onConnected?: () => void'));
assert(transport.includes('onDisconnected?: (reason: string) => void'));
assert(transport.includes('this.callbacks?.onConnected?.()'));
assert(transport.includes("this.callbacks?.onDisconnected?.('BLUETOOTH DESCONECTADO')"));
assert(manager.includes('callbacks?.onBluetoothConnected'));
assert(manager.includes('callbacks?.onDisconnected'));
assert(shared.includes("setLifecycle('BLUETOOTH_CONNECTED')"));
assert(shared.includes("setLifecycle('ELM_RESPONDING')"));
assert(shared.includes("setLifecycle('ELM_INITIALIZED')"));
assert(shared.includes("setLifecycle('ECU_RESPONDING')"));
assert(shared.includes("setLifecycle('READY')"));
assert(shared.includes('handleUnexpectedDisconnect'));
assert(shared.includes('startObdAutosaveSession'));
assert(shared.includes('closeObdAutosaveSession'));
assert(shared.includes('persistValidatedConnection'));
assert(shared.includes('startBluetoothMonitor'));
assert(shared.includes('preferredAddress'));
assert(shared.includes('selectedAdapterAddress: device.address.toUpperCase()'));
assert(shared.includes('ecuValidatedAt: validatedAt'));
assert(shared.includes("ecuValidationSource: state.vehicle?.ecuAddress ? 'VEHICLE_PROFILE' : 'OBD_RESPONSE'"));
assert(rootLayout.includes('connectPreferredElm(settings.selectedAdapterAddress)'));
assert(rootLayout.includes('Bluetooth necessário para diagnóstico do veículo.'));
assert(bluetoothScreen.includes('ATIVAR BLUETOOTH'));
assert(bluetoothScreen.includes('CONECTAR E VALIDAR ELM327'));
assert(bluetoothScreen.includes('bluetoothConnected ? styles.online'));
assert(dashboard.includes('connectPreferredElm(settings.selectedAdapterAddress'));

console.log('bluetoothLifecycle.test.js: OK');

const bluetoothScreenSource = fs.readFileSync(path.join(ROOT, 'app', 'bluetooth.tsx'), 'utf8');
assert(bluetoothScreenSource.includes('DIAGNÓSTICO PRONTO'));
assert(bluetoothScreenSource.includes('BLUETOOTH DESCONECTADO'));
assert(bluetoothScreenSource.includes('AGUARDANDO RESPOSTA'));
assert(!bluetoothScreenSource.includes('BLUETOOTH CLASSIC • SPP'));

const orderedStates = [
  'setLifecycle(\'BLUETOOTH_CONNECTED\')',
  'setLifecycle(\'ELM_RESPONDING\')',
  'setLifecycle(\'ELM_INITIALIZED\')',
  'setLifecycle(\'ECU_RESPONDING\')',
  'setLifecycle(\'READY\')',
].map((token) => shared.indexOf(token));
assert(orderedStates.every((value, index) => value >= 0 && (index === 0 || value > orderedStates[index - 1])), 'estados devem seguir a ordem Bluetooth → ELM → ECU → pronto');

const ecuGate = shared.indexOf("if (!connection.ecuValidated)");
const activeAssignment = shared.indexOf('    active = {', ecuGate);
assert(ecuGate >= 0 && activeAssignment > ecuGate, 'active não pode existir antes da validação da ECU');
