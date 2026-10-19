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
assert(shared.includes("await initAutoSave(basePath)"), 'o autosave deve estar hidratado antes da abertura da sessão ECU');
const initCall = shared.indexOf('await initAutoSave(basePath)');
const startSessionCall = shared.indexOf('await startObdAutosaveSession()', initCall);
assert(initCall >= 0 && startSessionCall > initCall, 'a sessão diária só pode iniciar após a inicialização do autosave');
const autosaveManager = fs.readFileSync(path.join(ROOT, 'src', 'meriva', 'autosaveManager.ts'), 'utf8');
assert(autosaveManager.includes('initializationPromise'), 'initAutoSave deve serializar inicializações concorrentes');

assert(shared.includes('startBluetoothMonitor'));
assert(shared.includes('preferredAddress'));
assert(shared.includes('selectedAdapterAddress: connection.device.address.toUpperCase()'));
assert(shared.includes('ecuValidatedAt: validatedAt'));
// ECU validation must be attributed to a real OBD response, never a vehicle profile alone.
assert(shared.includes("ecuValidationSource: 'OBD_RESPONSE'"));
assert(shared.includes("probe.parsed.status === 'RESPONDEU'"));
assert(shared.includes("probe.commandStatus === 'OK'"));
assert(!rootLayout.includes('connectPreferredElm'), 'RootLayout must not start a competing OBD connection');
assert(!rootLayout.includes('ensureBluetoothReady'), 'Bluetooth connection readiness belongs to the dashboard connection owner');
assert(rootLayout.includes("if (audit.bluetooth !== 'GRANTED')"), 'RootLayout deve interromper a preparação sem permissão de Bluetooth');
assert(rootLayout.includes("if (audit.location !== 'GRANTED')"), 'RootLayout deve exigir permissão de localização antes dos serviços que dependem dela');
assert(bluetoothScreen.includes('ATIVAR BLUETOOTH'));
assert(bluetoothScreen.includes('CONECTAR E VALIDAR ELM327'));
assert(bluetoothScreen.includes('bluetoothConnected ? styles.online'));
assert(dashboard.includes('connectPreferredElm(settings.selectedAdapterAddress'));
assert(shared.includes('const compatibility = connection?.session.getCompatibilityConfig()'), 'recovery must preserve the active session compatibility settings');
assert(shared.includes("connectPreferredElm(connection.device.address, compatibility, 'EXPLICIT')"), 'recovery must pass the original compatibility settings');
assert(shared.includes('if (connection) reconnecting = true'), 'reserve recovery before awaiting async cleanup to ignore duplicate disconnect callbacks');
assert(shared.includes('const recoveryGeneration = connectionGeneration'), 'recovery must capture its initiating connection generation');
assert(shared.includes('connectionGeneration !== recoveryGeneration'), 'recovery retry must stop when a newer disconnect/request changes generation');
assert(shared.includes('function assertConnectionAttemptCurrent'), 'connection setup must check explicit cancellation after awaits');
assert(shared.includes('requestGeneration !== connectionGeneration'), 'stale connect attempt must not proceed to another candidate');
assert(shared.includes('if (active) void handleUnexpectedDisconnect(reason);'), 'a disconnect during handshake must not invalidate the candidate search before any session becomes active');
assert(shared.includes('if (connecting === attempt) connecting = null;'), 'finishing an old promise cannot erase the current connection attempt');
assert(shared.includes('const monitorGeneration = connectionGeneration;'), 'monitor must pin its health probe to one connection generation');
assert(shared.includes('active !== connection'), 'late keepalive/probe responses must not overwrite a disconnected/replaced session');

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
