'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const transport = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothClassicTransport.ts'), 'utf8');
const recovery = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'connectionRecovery.ts'), 'utf8');
const manager = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothManager.ts'), 'utf8');
const shared = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'sharedConnection.ts'), 'utf8');
const rootLayout = fs.readFileSync(path.join(ROOT, 'app', '_layout.tsx'), 'utf8');
const bluetoothScreen = fs.readFileSync(path.join(ROOT, 'app', 'bluetooth.tsx'), 'utf8');
const dashboard = fs.readFileSync(path.join(ROOT, 'app', 'index.tsx'), 'utf8');

assert(transport.includes('onConnected?: () => void'));
assert(transport.includes('onDisconnected?: (reason: string) => void'));
assert.ok(transport.includes('normalizeBluetoothAddress(eventAddress) !== normalizeBluetoothAddress(this.deviceAddress)'),
  'eventos Android devem comparar o MAC normalizado, independentemente de caixa/separadores');
assert(transport.includes('this.callbacks?.onConnected?.()'));
assert(transport.includes("this.callbacks?.onDisconnected?.('BLUETOOTH DESCONECTADO')"));
assert(manager.includes('callbacks?.onBluetoothConnected'));
assert(manager.includes("import { runWithTimeout } from './connectionRecovery';"), 'Bluetooth readiness must use the bounded native-operation helper');
assert.match(manager, /const status = await runWithTimeout\(\s*\(\) => requestBluetoothPermissionsOnly\(\)/, 'runtime permission request must have a finite wait');
assert.match(manager, /const available = await runWithTimeout\(\s*\(\) => bluetoothClassic\.isBluetoothAvailable\(\)/, 'native Bluetooth availability must have a finite wait');
assert.match(manager, /let enabled = await runWithTimeout\(\s*\(\) => bluetoothClassic\.isBluetoothEnabled\(\)/, 'native radio state must have a finite wait');
assert.match(manager, /const requested = await runWithTimeout\(\s*\(\) => requestBluetoothEnabled\(\)/, 'Bluetooth enable request must not await forever');
assert(!/await bluetoothClassic\.isBluetoothAvailable\(\)/.test(manager), 'unbounded Bluetooth availability await must not return');
assert(!/await bluetoothClassic\.isBluetoothEnabled\(\)/.test(manager), 'unbounded Bluetooth radio state await must not return');
assert(!/await requestBluetoothPermissionsOnly\(\)/.test(manager), 'unbounded runtime permission await must not return');
assert(manager.includes('callbacks?.onDisconnected'));
assert(shared.includes("setLifecycle('BLUETOOTH_CONNECTED')"));
assert(shared.includes("setLifecycle('ELM_RESPONDING')"));
assert(shared.includes("setLifecycle('ELM_INITIALIZED')"));
assert(shared.includes("setLifecycle('ECU_RESPONDING')"));
assert(shared.includes("setLifecycle('READY')"));
assert(shared.includes('handleUnexpectedDisconnect'));
assert(shared.includes('readBluetoothEnabledForMonitor'), 'health monitor must centralize radio-state probes');
assert(shared.includes('BLUETOOTH_MONITOR_STATE_TIMEOUT_MS'), 'health monitor radio-state probe must have a finite timeout');
assert(shared.includes("runWithTimeout, shouldRetryAfterDisconnectCleanup"), 'health monitor must use the bounded-wait helper');
assert(!/await RNBluetoothClassic\.isBluetoothEnabled\(\)/.test(shared), 'unbounded native radio-state await must not return in the health monitor');
assert(shared.includes('ESTADO DO BLUETOOTH NÃO CONFIRMADO PELO MONITOR'), 'unknown radio state must not be mislabeled as ECU failure');
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
assert(rootLayout.includes('canStartObdStartup(audit)'), 'RootLayout deve interromper a preparação sem permissão de Bluetooth');
assert(rootLayout.includes('canStartObdStartup(audit)'), 'a inicialização OBD deve depender da permissão Bluetooth');
assert(rootLayout.includes('canUseGps(audit)'), 'GPS/viagens devem consultar a permissão de localização separadamente');
assert(!rootLayout.includes("if (audit.location !== 'GRANTED')"), 'localização negada não deve bloquear diagnóstico OBD');
assert(bluetoothScreen.includes('ATIVAR BLUETOOTH'));
assert(bluetoothScreen.includes('CONECTAR E VALIDAR ELM327'));
assert(bluetoothScreen.includes('bluetoothConnected ? styles.online'));
assert(dashboard.includes('connectPreferredElm(settings.selectedAdapterAddress'));
assert(shared.includes('const compatibility = connection?.session.getCompatibilityConfig()'), 'recovery must preserve the active session compatibility settings');
assert(shared.includes("connectPreferredElm(connection.device.address, compatibility, 'EXPLICIT')"), 'recovery must pass the original compatibility settings');
assert(shared.includes('if (connection) reconnecting = true'), 'reserve recovery before awaiting async cleanup to ignore duplicate disconnect callbacks');
assert(transport.includes('timedOutNativeAttemptStillPending('), 'timed-out native connect must not race a second socket mode');
assert(transport.includes('waitForNativeConnectAttempt('), 'waiting for a concurrent native attempt must have an explicit timeout');
assert(transport.includes('pendingNativeConnectionSettlements'), 'a late native connection must be serialized through its cleanup completion');
assert.match(transport, /pendingNativeConnectionSettlements\.get\(addressKey\) \?\? pending/, 'concurrent opens must wait for native cleanup, not only the raw socket promise');
assert.match(transport, /await this\.safeDisconnect\(lateDevice\)[\s\S]*?LATE_CONNECT_DISCONNECTED/, 'a timed-out late success must be disconnected before the settlement completes');
assert(transport.includes("CONNECT_ABORT_PREVIOUS_NATIVE_ATTEMPT_PENDING"), 'a stale native connection must fail fast instead of being awaited forever');
assert(shared.includes('cleanupDisconnectedSession('), 'disconnect recovery must isolate persistence failure from session close');
assert(recovery.includes('export async function runWithTimeout'), 'native asynchronous probes must use the tested bounded-wait helper');
assert(transport.includes('private async assertDeviceConnected'), 'transport must centralize native connection-state checks');
assert(transport.includes('runWithTimeout('), 'native isConnected calls must be bounded');
assert.match(transport, /runWithTimeout\([\s\S]*?isBluetoothAvailable\(\)/, 'Bluetooth availability probe must be bounded');
assert.match(transport, /runWithTimeout\([\s\S]*?isBluetoothEnabled\(\)/, 'Bluetooth radio-state probes must be bounded');
assert(transport.includes('CANCEL_DISCOVERY_FAILED_OR_TIMED_OUT'), 'discovery cancellation must not wait forever');
assert(transport.includes('pendingNativeDiscoveryCancellation'), 'timed-out discovery cancellation must be shared until the native promise settles');
assert(transport.includes('cancelBluetoothDiscovery()'), 'RFCOMM open must use the shared bounded discovery cancellation');
assert(!transport.includes("() => RNBluetoothClassic.cancelDiscovery!()"), 'native discovery cancellation must not be started independently on every retry');
assert(transport.includes('ESTADO DA DESCOBERTA BLUETOOTH INDETERMINADO; CONEXÃO RFCOMM CANCELADA'), 'a stalled discovery cancellation must stop a new RFCOMM attempt');
assert(transport.includes('INITIAL_DEVICE_CONNECTED_CHECK_FAILED'), 'an unknown initial socket state must register cleanup and fail closed');
assert(transport.includes('INITIAL_CONNECTION_CHECK_CLEANUP'), 'initial socket probe failure must preserve the native cleanup guard');
assert.match(transport, /getBondedDevices\(\)[\s\S]*?TIMEOUT: LISTAGEM DE DISPOSITIVOS PAREADOS/, 'paired-device enumeration must be bounded');
assert(transport.includes('DEVICE_CONNECTED_CHECK_FAILED'), 'unknown native connection state must be logged and fail closed');
const connectedProbe = transport.slice(transport.indexOf('private async assertDeviceConnected'), transport.indexOf('async write('));
assert(connectedProbe.includes("registerPendingNativeSocketCleanup(device, 'DEVICE_CONNECTED_CHECK_CLEANUP')"),
  'a timed-out/rejected runtime socket-state probe must register shared cleanup before reconnect');
assert(connectedProbe.includes('this.markDisconnected()'),
  'unknown runtime socket state must clear local state after the cleanup guard is installed');
assert(transport.includes('await this.assertDeviceConnected(device, NATIVE_CONNECTION_CHECK_TIMEOUT_MS)'), 'write must not transmit while native state is unknown');
assert(transport.includes('Math.min(NATIVE_CONNECTION_CHECK_TIMEOUT_MS, remainingMs)'), 'read must reserve only the remaining response timeout for native state checks');
const promptRead = transport.slice(transport.indexOf('async readUntilPrompt'), transport.indexOf('private async safeDisconnect'));
assert(promptRead.indexOf("const promptIndex = this.received.indexOf('>')") < promptRead.indexOf('await this.assertDeviceConnected('),
  'a resposta ELM já delimitada no buffer deve ser consumida antes de consultar o estado nativo do socket');
assert(transport.includes('private receiveDesynchronized = false'),
  'transport must remember when a response timed out before its framing prompt');
assert.match(transport, /this\.receiveDesynchronized = true;[\s\S]*?READ_TIMEOUT/,
  'a read timeout must poison the current stream boundary');
assert(transport.includes('TX_BLOCKED_RX_DESYNCHRONIZED'),
  'a late response must not be consumed as the next PID response');
assert(transport.includes("registerPendingNativeSocketCleanup(device, 'RX_DESYNCHRONIZED_CLEANUP')"),
  'an unframed ELM timeout must force socket cleanup before another command');
assert(transport.includes('NATIVE_SOCKET_CLEANUP_TIMEOUT'), 'direct close timeout must be observable and keep the socket guard');
assert.match(transport, /runWithTimeout\(\s*\(\) => nativeDisconnect!/, 'native socket disconnect must have a finite timeout while reusing the tracked native promise');
assert(transport.includes('BLUETOOTH_DISCONNECT_TIMEOUT'), 'timed-out native disconnect must be reported separately');
assert(transport.includes('pendingNativeDisconnectOperations'),
  'the raw native disconnect promise must remain tracked after the JavaScript timeout');
assert.match(transport, /let nativeDisconnect = pendingNativeDisconnectOperations\.get\(addressKey\)[\s\S]*?if \(!nativeDisconnect\)[\s\S]*?device\.disconnect\(\)/,
  'disconnect retries must reuse a pending native operation instead of opening overlapping native cleanup calls');
assert(!/await device\.disconnect\(\)/.test(transport), 'unbounded native disconnect await must not return');
assert(transport.includes('replacementSocketBlocked: true'), 'an unconfirmed native close must block replacement RFCOMM sockets');


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
