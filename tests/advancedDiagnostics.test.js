const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalResolveFilename = Module._resolveFilename;
const originalTsExtension = Module._extensions['.ts'];

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (typeof request === 'string' && parent?.filename && request.startsWith('.')) {
      const candidate = path.resolve(path.dirname(parent.filename), request + '.ts');
      if (fs.existsSync(candidate)) return candidate;
    }
    throw error;
  }
};

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText, sourcePath);
  return mod.exports;
}

const advanced = loadTs('src/obd/advancedDiagnostics.ts');

const vinResponse = [
  '49 02 01 00 00 00 31',
  '49 02 02 44 34 47 50',
  '49 02 03 30 30 52 35',
  '49 02 04 35 42 31 32',
  '49 02 05 33 34 35 36',
].join('\n');
assert.strictEqual(advanced.parseVinMode09Response(vinResponse), '1D4GP00R55B123456');
const vinCrOnly = vinResponse.replace(/\n/g, '\r');
assert.strictEqual(advanced.parseVinMode09Response(vinCrOnly), '1D4GP00R55B123456');

assert.strictEqual(advanced.parseVinMode09Response('49 02 01 00 00 00 31\nNO DATA'), null);
assert.strictEqual(advanced.parseVinMode09Response('49 02 01 00 00 00 00'), null);

const rpm = advanced.parseFreezeFramePidResponse('010C', '7E8 04 42 0C 1A F8');
assert.strictEqual(rpm.status, 'RESPONDEU');
assert.strictEqual(rpm.value, 1726);
assert.strictEqual(rpm.source, 'REAL_OBD');

const coolant = advanced.parseFreezeFramePidResponse('0105', '42 05 5A');
assert.strictEqual(coolant.value, 50);

const truncated = advanced.parseFreezeFramePidResponse('010C', '42 0C 1A');
assert.strictEqual(truncated.value, null);
assert.strictEqual(truncated.status, 'VALOR_NAO_INTERPRETADO');

console.log('advancedDiagnostics.test.js: PASS');


Module._resolveFilename = originalResolveFilename;
if (originalTsExtension) Module._extensions['.ts'] = originalTsExtension;
else delete Module._extensions['.ts'];
