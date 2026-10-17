'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'adapterVoltage.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const parse = mod.exports.parseAdapterVoltageResponse;
assert.strictEqual(parse('12.6V'), 12.6);
assert.strictEqual(parse('ATRV\r\n12.4 V\r\n>'), 12.4);
assert.strictEqual(parse('NO DATA'), null);
assert.strictEqual(parse('4.9V'), null);
assert.strictEqual(parse('21.0V'), null);
console.log('adapterVoltage: ATRV parsing passed');
