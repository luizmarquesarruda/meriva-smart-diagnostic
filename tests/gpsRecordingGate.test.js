'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src', 'trip', 'gpsRecordingGate.ts');
const compiled = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const loaded = new Module(sourcePath, null);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(compiled, sourcePath);
const { shouldKeepGpsHistorySession } = loaded.exports;

const connected = { ecuValidated: true };
const responding = { bluetoothConnected: true, ecuResponseState: 'RESPONDING' };
const noResponse = { bluetoothConnected: true, ecuResponseState: 'NO_RESPONSE' };
const recovering = { bluetoothConnected: true, ecuResponseState: 'RECOVERING' };
const notValidated = { bluetoothConnected: true, ecuResponseState: 'NOT_VALIDATED' };

assert.strictEqual(shouldKeepGpsHistorySession(true, connected, responding), true,
  'ECU validada e Bluetooth ativo devem manter a gravação');
assert.strictEqual(shouldKeepGpsHistorySession(true, connected, noResponse), true,
  'uma falha transitória de probe não deve dividir a sessão GPS');
assert.strictEqual(shouldKeepGpsHistorySession(true, connected, recovering), true,
  'a sessão deve sobreviver enquanto o protocolo é recuperado');
assert.strictEqual(shouldKeepGpsHistorySession(true, connected, { ...responding, bluetoothConnected: false }), false,
  'Bluetooth desconectado deve encerrar a sessão');
assert.strictEqual(shouldKeepGpsHistorySession(true, null, responding), false,
  'ausência de conexão compartilhada deve encerrar a sessão');
assert.strictEqual(shouldKeepGpsHistorySession(true, { ecuValidated: false }, responding), false,
  'adaptador não validado não deve abrir gravação');
assert.strictEqual(shouldKeepGpsHistorySession(true, connected, notValidated), false,
  'estado ainda não validado não deve abrir gravação');
assert.strictEqual(shouldKeepGpsHistorySession(false, connected, responding), false,
  'serviço parado não deve manter a gravação');

console.log('gpsRecordingGate.test.js: OK');
