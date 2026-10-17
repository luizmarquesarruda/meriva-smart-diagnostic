'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'vehicleIdentity.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

(async () => {
  const replies = {
    '0902': 'NO DATA',
    // Two Mode 09 frames repeat 49 04 NN; NN is a sequence byte, not ECU ID text.
    '0904': '49 04 01 32 34 35 37 49 04 02 38 33 33 36',
    '090A': '49 0A 01 4D 45 52 49 56 41',
  };
  const result = await mod.exports.readVehicleIdentity({
    executeCommand: async (command) => ({ status: 'OK', response: replies[command] ?? '', elapsedMs: 1 }),
  });
  assert.strictEqual(result.ecuId, '24578336');
  assert.strictEqual(result.ecuName, 'MERIVA');
  assert.strictEqual(result.vin, null);
  console.log('vehicleIdentity: multiframe Mode 09 headers removed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
