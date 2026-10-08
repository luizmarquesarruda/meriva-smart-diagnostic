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

const { isPidDiscoveryCacheUsable, PID_DISCOVERY_CACHE_TTL_MS } = loadTs('src/obd/pidDiscoveryCache.ts');
const now = Date.parse('2026-10-08T12:00:00.000Z');
const base = {
  supportedPids: ['010C', '010D'],
  protocol: 'ISO 14230-4 KWP FAST',
  discoveredAt: new Date(now - 60_000).toISOString(),
  adapterAddress: 'AA:BB:CC:DD:EE:FF',
  vin: '9BG123456789',
  ecuAddress: '0x11',
};

assert.strictEqual(isPidDiscoveryCacheUsable(base, { adapterAddress: 'aa bb cc dd ee ff', vin: '9BG123456789', ecuAddress: '0x11' }, now), true);
assert.strictEqual(isPidDiscoveryCacheUsable(base, { adapterAddress: '11:22:33:44:55:66' }, now), false);
assert.strictEqual(isPidDiscoveryCacheUsable({ ...base, discoveredAt: new Date(now - PID_DISCOVERY_CACHE_TTL_MS - 1).toISOString() }, { adapterAddress: base.adapterAddress }, now), false);
assert.strictEqual(isPidDiscoveryCacheUsable({ ...base, adapterAddress: undefined }, { adapterAddress: base.adapterAddress }, now), false);

console.log('pidDiscoveryCache.test.js: PASS');
