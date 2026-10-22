'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (
      parent?.filename?.includes(path.join('src', 'obd')) &&
      request.startsWith('./')
    ) {
      const candidate = path.resolve(path.dirname(parent.filename), request) + '.ts';
      if (fs.existsSync(candidate)) return loadTs(path.relative(path.join(__dirname, '..'), candidate));
    }
    return originalLoad(request, parent, isMain);
  };
  try {
    mod._compile(output, sourcePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

const { isValidDtcResponseForService, parseDtcResponseForService } = loadTs('src/obd/dtcParser.ts');
const scanner = loadTs('src/obd/dtcScanner.ts');

assert.deepStrictEqual(parseDtcResponseForService('03', '43 01 30 00 00'), ['P0130']);
assert.deepStrictEqual(parseDtcResponseForService('07', '47 01 23 00 00'), ['P0123']);
assert.deepStrictEqual(parseDtcResponseForService('0A', '4A 01 23 00 00'), ['P0123']);
assert.strictEqual(isValidDtcResponseForService('03', '43 00 00 00 00'), true, 'a complete positive no-code frame is valid');
assert.strictEqual(isValidDtcResponseForService('03', 'NO CODES'), true, 'an explicit no-codes response is valid');
assert.strictEqual(isValidDtcResponseForService('03', 'NO DATA'), false, 'NO DATA is not proof of no DTC');
assert.strictEqual(isValidDtcResponseForService('03', '43 01 30 00'), false, 'truncated positive response is invalid');
assert.strictEqual(isValidDtcResponseForService('03', 'garbage'), false, 'missing positive header is invalid');

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

  const freeze = await scanner.readFreezeFrame({}, async (command) => ({
    response: command === '020200'
      ? '42 02 00 01 30'
      : command === '020C00'
        ? '42 0C 00 1F 40'
        : '42 05 00 50',
    status: 'OK',
    elapsedMs: 15,
  }));
  assert.strictEqual(freeze.dtc, 'P0130', 'freeze-frame DTC starts after the frame-number byte');
  assert.strictEqual(freeze.frame, 0, 'frame number must be read from the response header');
  assert.strictEqual(freeze.available, true);

  const summary = scanner.summarizeDtcScan(results);
  assert.deepStrictEqual(summary.stored, ['P0130']);
  assert.deepStrictEqual(summary.pending, []);
  assert.deepStrictEqual(summary.permanent, []);
  assert.deepStrictEqual(summary.unavailable, ['0A']);

  const noDataResults = await scanner.scanDtcServices({}, async (command) => ({
    response: command === '03' ? 'NO DATA' : command === '07' ? '47 00 00 00 00' : '4A 00 00 00 00',
    status: command === '03' ? 'ERROR' : 'OK',
    elapsedMs: 15,
  }));
  assert.strictEqual(noDataResults[0].available, false, 'NO DATA must remain unavailable instead of clearing prior DTC evidence');
  assert.deepStrictEqual(noDataResults[0].codes, []);

  const malformedResults = await scanner.scanDtcServices({}, async (command) => ({
    response: command === '03' ? '43 01 30 00' : command === '07' ? '47 00 00 00 00' : '4A 00 00 00 00',
    status: 'OK',
    elapsedMs: 15,
  }));
  assert.strictEqual(malformedResults[0].available, false, 'truncated DTC frame must remain unavailable');

  console.log('DTC services + validated empty responses + unsupported/malformed handling: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
