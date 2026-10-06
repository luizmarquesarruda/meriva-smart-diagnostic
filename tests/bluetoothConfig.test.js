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

const exporter = fs.readFileSync(path.join(ROOT, 'src', 'obd', 'exportBluetoothDiagnosticTxt.ts'), 'utf8');
assert(exporter.includes('readLearningProfile'));
assert(exporter.includes('O QUE O APLICATIVO APRENDEU'));
assert(exporter.includes('AMOSTRAS REAIS'));
assert(exporter.includes('CONFIANÇA'));

console.log('bluetoothConfig.test.js: OK');
