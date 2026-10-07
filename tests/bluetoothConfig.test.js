const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const configPath = path.join(ROOT, 'src', 'knowledge', 'bluetooth_config.json');
const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));

assert.strictEqual(config.adapterProfile, 'ELM327_MINI_GENERICO');
assert.strictEqual(config.transport.type, 'BLUETOOTH_CLASSIC_RFCOMM_SPP');
assert.deepStrictEqual(config.transport.socketModes, ['INSECURE', 'SECURE']);
assert.strictEqual(config.transport.connectionType, 'delimited');
assert.strictEqual(config.transport.delimiter, '');
assert.strictEqual(config.transport.charset, 'ascii');
assert.strictEqual(config.retry.maxAttempts, 20);
assert.strictEqual(config.retry.intervalMs, 8000);
assert.strictEqual(config.retry.stopOnSuccess, true);
assert.strictEqual(config.validation.command, '010C');
assert.strictEqual(config.validation.responsePrefix, '41 0C');
assert.deepStrictEqual(config.initialization.required, ['ATZ']);
assert.deepStrictEqual(config.initialization.optional, ['ATI']);

const manager = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothManager.ts'), 'utf8');
assert(manager.includes("bluetooth_config.json"));
assert(manager.includes('MAX_BLUETOOTH_ATTEMPTS = bluetoothConfig.retry.maxAttempts'));
assert(manager.includes('BLUETOOTH_RETRY_INTERVAL_MS = bluetoothConfig.retry.intervalMs'));

const sharedConnection = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'sharedConnection.ts'), 'utf8');
assert(sharedConnection.includes('cada candidato recebe até 20 tentativas'));
assert(!sharedConnection.includes('while (!active)'), 'sharedConnection não deve repetir rodadas infinitamente após esgotar os candidatos');
const exporter = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'exportBluetoothDiagnosticTxt.ts'), 'utf8');
assert(exporter.includes('readLearningProfile'));
assert(exporter.includes('O QUE O APLICATIVO APRENDEU'));
assert(exporter.includes('AMOSTRAS REAIS'));
assert(exporter.includes('CONFIANÇA'));

console.log('bluetoothConfig.test.js: OK');

// Regression: o manager não pode acessar APIs do módulo nativo antes de verificar sua existência.
assert(manager.includes('BLUETOOTH_NATIVE_MODULE_UNAVAILABLE'));
assert(manager.includes('const bluetoothClassic = RNBluetoothClassic as'));
// Regression: respostas duplicadas após o prompt não podem vazar para o próximo comando.
const transport = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothClassicTransport.ts'), 'utf8');
assert(transport.includes('trailingDiscarded'));
assert(transport.includes('this.received = \'\';'));


const lifecycleState = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'bluetoothState.ts'), 'utf8');
assert(lifecycleState.includes("export type BluetoothLifecycleState"));
assert(lifecycleState.includes("return state === 'READY'"));
assert(transport.includes('onConnected?: () => void'));
assert(transport.includes('onDisconnected?: (reason: string) => void'));
assert(sharedConnection.includes('preferredAddress'));
assert(sharedConnection.includes("setLifecycle('BLUETOOTH_OFF')"));
assert(sharedConnection.includes("setLifecycle('DISCONNECTED')"));
