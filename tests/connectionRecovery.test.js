'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/obd/connectionRecovery.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, strict: true },
}).outputText;
const loaded = { exports: {} };
new Function('exports', 'module', js)(loaded.exports, loaded);

async function run() {
  const { cleanupDisconnectedSession, timedOutNativeAttemptStillPending, waitForNativeConnectAttempt } = loaded.exports;
  const order = [];
  const diskError = new Error('disk unavailable');
  const cleanup = await cleanupDisconnectedSession(
    async () => { order.push('persist'); throw diskError; },
    async () => { order.push('close'); },
  );

  assert.deepEqual(order, ['persist', 'close'], 'session close must run even if persistence fails');
  assert.equal(cleanup.persistenceError, diskError);
  assert.equal(cleanup.closeError, null);

  const closeError = new Error('session already closed');
  const bothFailed = await cleanupDisconnectedSession(
    async () => { throw diskError; },
    async () => { throw closeError; },
  );
  assert.equal(bothFailed.persistenceError, diskError);
  assert.equal(bothFailed.closeError, closeError, 'cleanup errors must be reported without escaping');

  const attempt = new Promise(() => {});
  assert.equal(timedOutNativeAttemptStillPending(true, attempt, attempt), true,
    'a timed-out native call still registered must stop a second socket attempt');
  assert.equal(timedOutNativeAttemptStillPending(false, attempt, attempt), false,
    'a non-timed-out attempt must not trigger timeout abort logic');
  assert.equal(timedOutNativeAttemptStillPending(true, attempt, Promise.resolve()), false,
    'an unrelated pending promise must not be mistaken for the current native call');

  assert.equal(await waitForNativeConnectAttempt(Promise.resolve('connected'), 20), true,
    'concurrent opens must continue after the prior native request settles');
  const neverSettles = new Promise(() => {});
  assert.equal(await waitForNativeConnectAttempt(neverSettles, 5), false,
    'a native request that never settles must not block a future open indefinitely');

  console.log('connectionRecovery.test.js: OK');
}

run().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
