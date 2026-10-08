const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(output, sourcePath);
  return mod.exports;
}

const { TelemetryScheduler } = loadTs('src/obd/telemetryScheduler.ts');
const scheduler = new TelemetryScheduler();
const supported = ['010C', '010D', '0105', '010B', '0111', '0110', '012F', '015E'];

const firstBatch = scheduler.getDuePids(0, supported, true);
assert.ok(firstBatch.length > 0);
assert.ok(firstBatch.length <= 6, 'uma requisição CAN deve respeitar o limite de 6 PIDs');

scheduler.markPolled(firstBatch, 0);
assert.deepStrictEqual(scheduler.getDuePids(500, supported, true), []);

const later = scheduler.getDuePids(1000, supported, true);
assert.ok(later.length > 0, 'PIDs FAST devem voltar a ficar elegíveis pela cadência');

const serial = new TelemetryScheduler();
const firstSerial = serial.getDuePids(0, supported, false);
serial.markPolled(firstSerial, 0);
const secondSerial = serial.getDuePids(0, supported, false);
assert.notDeepStrictEqual(secondSerial, firstSerial, 'scheduler serial deve alternar entre PIDs elegíveis');

console.log('telemetryScheduler.test.js: PASS');
