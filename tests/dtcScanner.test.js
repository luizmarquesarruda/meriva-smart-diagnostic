'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compiled = new Map();

function loadTs(file) {
  const sourcePath = path.isAbsolute(file)
    ? path.normalize(file)
    : path.resolve(ROOT, file);
  if (compiled.has(sourcePath)) return compiled.get(sourcePath).exports;

  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = new Module(sourcePath, module);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  // Cache before compilation so local TypeScript dependencies share one instance.
  compiled.set(sourcePath, mod);

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (parent?.filename && (request.startsWith('./') || request.startsWith('../'))) {
      const resolved = path.resolve(path.dirname(parent.filename), request);
      const candidates = [
        request.endsWith('.ts') ? resolved : resolved + '.ts',
        path.join(resolved, 'index.ts'),
      ];
      const localTsPath = candidates.find((candidate) =>
        candidate.startsWith(ROOT + path.sep) && fs.existsSync(candidate)
      );
      if (localTsPath) return loadTs(localTsPath);
    }
    return originalLoad.apply(this, arguments);
  };

  try {
    mod._compile(output, sourcePath);
    return mod.exports;
  } catch (error) {
    compiled.delete(sourcePath);
    throw error;
  } finally {
    Module._load = originalLoad;
  }
}

const { parseDtcResponseForService } = loadTs('src/obd/dtcParser.ts');
const scanner = loadTs('src/obd/dtcScanner.ts');

assert.deepStrictEqual(parseDtcResponseForService('03', '43 01 30 00 00'), ['P0130']);
assert.deepStrictEqual(parseDtcResponseForService('07', '47 01 23 00 00'), ['P0123']);
assert.deepStrictEqual(parseDtcResponseForService('0A', '4A 01 23 00 00'), ['P0123']);

(async () => {
  const replies = {
    '03': { response: '43 01 30 00 00', status: 'OK', elapsedMs: 20 },
    '07': { response: '47 00 00 00 00', status: 'OK', elapsedMs: 20 },
    '0A': { response: '?', status: 'UNSUPPORTED', elapsedMs: 20, errorMessage: 'COMANDO NÃO SUPORTADO' },
  };
  const results = await scanner.scanDtcServices({}, async (command) => replies[command]);
  assert.strictEqual(results.length, 3);
  assert.deepStrictEqual(results[0].codes, ['P0130']);
  assert.strictEqual(results[0].available, true);
  assert.deepStrictEqual(results[1].codes, []);
  assert.strictEqual(results[1].available, true);
  assert.strictEqual(results[2].available, false);

  const summary = scanner.summarizeDtcScan(results);
  assert.deepStrictEqual(summary.stored, ['P0130']);
  assert.deepStrictEqual(summary.pending, []);
  assert.deepStrictEqual(summary.permanent, []);
  assert.deepStrictEqual(summary.unavailable, ['0A']);

  // Exercise the real parser dependency through Mode 02 freeze-frame decoding.
  const freezeFrame = await scanner.readFreezeFrame({}, async (command) => ({
    '020200': { response: '42 02 01 01 30 00 00', status: 'OK', elapsedMs: 20 },
    '020C00': { response: '42 0C 00 1A F8', status: 'OK', elapsedMs: 20 },
    '020500': { response: '42 05 00 69', status: 'OK', elapsedMs: 20 },
  })[command]);
  assert.strictEqual(freezeFrame.frame, 1);
  assert.strictEqual(freezeFrame.dtc, 'P0130');
  assert.strictEqual(freezeFrame.rpm, 1726);
  assert.strictEqual(freezeFrame.coolantC, 65);
  assert.strictEqual(freezeFrame.available, true);

  console.log('DTC services + freeze-frame parser loading and decoding: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
