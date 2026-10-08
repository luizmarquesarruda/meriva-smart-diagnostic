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

const compat = loadTs('src/obd/elm327Compatibility.ts');
assert.strictEqual(compat.classifyElmError('7F 22 78'), 'RESPONSE_PENDING');
assert.strictEqual(compat.classifyElmError('RESPONSE PENDING'), 'RESPONSE_PENDING');
const cfg = compat.mergeCompatibilityConfig();
assert.strictEqual(cfg.responsePendingMaxRetries, 3);
assert.strictEqual(cfg.responsePendingDelayMs, 150);

const elmSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'elm327.ts'), 'utf8');
assert(elmSource.includes("RESPONSE_PENDING"));
assert(elmSource.includes("responsePendingMaxRetries"));
assert(elmSource.includes("queryPids(pids: string[])"));
assert(elmSource.includes("for (let index = 0; index < normalizedPids.length; index += 6)"));

console.log('obdProtocolRobustness.test.js: PASS');
