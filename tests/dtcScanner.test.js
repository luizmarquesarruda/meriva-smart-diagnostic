'use strict';

const assert = require('assert');
const { loadTs } = require('./helpers/loadTs');
const { parseDtcResponseForService, isValidDtcResponse } = loadTs('src/obd/dtcParser.ts');
const scanner = loadTs('src/obd/dtcScanner.ts');

assert.deepStrictEqual(parseDtcResponseForService('03', '43 01 30 00 00'), ['P0130']);
assert.strictEqual(isValidDtcResponse('03', '43 00 00 00'), true);
assert.strictEqual(isValidDtcResponse('03', 'NO DATA'), false);
assert.strictEqual(isValidDtcResponse('03', 'UNABLE TO CONNECT'), false);
assert.strictEqual(isValidDtcResponse('03', '41 0C 1A F8'), false);
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

  const invalidResponseResults = await scanner.scanDtcServices({}, async (command) => ({
    response: command === '03' ? '41 0C 1A F8' : 'NO DATA',
    status: 'OK',
    elapsedMs: 20,
  }));
  assert.strictEqual(invalidResponseResults.every((item) => item.available === false), true);
  assert.strictEqual(invalidResponseResults.find((item) => item.service === '03').available, false);
  assert.strictEqual(invalidResponseResults.find((item) => item.service === '07').available, false);
  assert.strictEqual(invalidResponseResults.find((item) => item.service === '0A').available, false);

  console.log('DTC services: mode 03/07/0A parsing + unsupported handling: PASS');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
