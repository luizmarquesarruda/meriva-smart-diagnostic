'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'meriva', 'dailyObdHistory.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const files = new Map();
const directories = new Set(['/doc', '/doc/MERIVA_SMART']);
let failNextMainMove = false;
let failReadPath = null;

const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync(directory) {
    directories.add(directory);
  },
  async getInfoAsync(filePath) {
    return {
      exists: files.has(filePath) || directories.has(filePath),
      isDirectory: directories.has(filePath),
      size: files.has(filePath) ? Buffer.byteLength(files.get(filePath), 'utf8') : 0,
    };
  },
  async readAsStringAsync(filePath) {
    if (failReadPath === filePath) throw new Error('SIMULATED_READ_FAILURE');
    if (!files.has(filePath)) throw new Error('FILE_NOT_FOUND: ' + filePath);
    return files.get(filePath);
  },
  async writeAsStringAsync(filePath, value) {
    files.set(filePath, String(value));
  },
  async moveAsync({ from, to }) {
    if (failNextMainMove && to.endsWith('meriva_smart_daily_obd_history.txt')) {
      failNextMainMove = false;
      throw new Error('SIMULATED_MAIN_MOVE_FAILURE');
    }
    if (!files.has(from)) throw new Error('MOVE_SOURCE_NOT_FOUND: ' + from);
    if (directories.has(to)) throw new Error('MOVE_TARGET_IS_DIRECTORY: ' + to);
    files.set(to, files.get(from));
    files.delete(from);
  },
  async copyAsync({ from, to }) {
    if (!files.has(from)) throw new Error('COPY_SOURCE_NOT_FOUND: ' + from);
    if (directories.has(to)) throw new Error('COPY_TARGET_IS_DIRECTORY: ' + to);
    files.set(to, files.get(from));
  },
  async deleteAsync(filePath, options = {}) {
    if (files.has(filePath)) {
      files.delete(filePath);
      return;
    }
    if (directories.has(filePath) && !options.idempotent) {
      directories.delete(filePath);
      return;
    }
    if (!options.idempotent) throw new Error('DELETE_TARGET_NOT_FOUND: ' + filePath);
  },
};

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFileSystem;
  return originalLoad.apply(this, arguments);
};

const loaded = new Module(sourcePath, module);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, sourcePath);
Module._load = originalLoad;

const { appendDailyObdSessionEvent, DAILY_OBD_HISTORY_FILE } = loaded.exports;
const basePath = '/doc/MERIVA_SMART';
const logPath = basePath + '/VIAGENS/' + DAILY_OBD_HISTORY_FILE;
const previousPath = logPath + '.previous';
const temporaryPath = logPath + '.tmp';

function makeState() {
  return {
    obd: {
      adapterName: 'OBDII',
      connected: true,
      ecuValidatedAt: '2026-10-31T10:00:00.000Z',
      protocol: 'ISO 14230-4 KWP FAST',
      lastKnownProtocol: 'ISO 14230-4 KWP FAST',
      lastConnectedAt: '2026-10-31T10:00:00.000Z',
    },
    lastReadings: [],
    dtcs: [],
    driveCycles: [],
  };
}

async function main() {
  const first = await appendDailyObdSessionEvent(
    basePath, makeState(), 'SESSION_START', '2026-10-31T10:00:00.000Z',
  );
  assert.equal(first.eventCount, 1);
  assert.ok(files.get(logPath).includes('SESSION_START | 2026-10-31T10:00:00.000Z'));

  const second = await appendDailyObdSessionEvent(
    basePath, makeState(), 'SESSION_END', '2026-10-31T11:00:00.000Z',
  );
  assert.equal(second.eventCount, 2);
  assert.ok(files.get(logPath).includes('SESSION_START | 2026-10-31T10:00:00.000Z'));
  assert.ok(files.get(logPath).includes('SESSION_END | 2026-10-31T11:00:00.000Z'));
  assert.equal(files.get(previousPath).includes('SESSION_START | 2026-10-31T10:00:00.000Z'), true,
    'a verified previous snapshot must be kept before replacing the main history');

  // Two concurrent appends must serialize and retain both events.
  const concurrent = await Promise.all([
    appendDailyObdSessionEvent(basePath, makeState(), 'SESSION_RECOVERED', '2026-10-31T12:00:00.000Z'),
    appendDailyObdSessionEvent(basePath, makeState(), 'SESSION_START', '2026-10-31T13:00:00.000Z'),
  ]);
  assert.deepEqual(concurrent.map((item) => item.eventCount).sort((a, b) => a - b), [3, 4]);
  let history = files.get(logPath);
  assert.ok(history.includes('SESSION_RECOVERED | 2026-10-31T12:00:00.000Z'));
  assert.ok(history.includes('SESSION_START | 2026-10-31T13:00:00.000Z'));

  // A failed replacement must restore the last verified snapshot.
  const beforeFailedWrite = history;
  failNextMainMove = true;
  await assert.rejects(
    () => appendDailyObdSessionEvent(basePath, makeState(), 'SESSION_END', '2026-10-31T14:00:00.000Z'),
    /SIMULATED_MAIN_MOVE_FAILURE/,
  );
  assert.equal(files.get(logPath), beforeFailedWrite,
    'failed replacement must restore the previous complete daily history');
  assert.equal(files.get(logPath).includes('SESSION_END | 2026-10-31T14:00:00.000Z'), false);
  assert.equal(files.has(temporaryPath), false, 'failed temporary file must be cleaned up');

  const afterRecovery = await appendDailyObdSessionEvent(
    basePath, makeState(), 'SESSION_END', '2026-10-31T15:00:00.000Z',
  );
  assert.equal(afterRecovery.eventCount, 5);

  // If the main file is missing, recover the last verified previous snapshot
  // rather than silently creating a new empty history.
  files.delete(logPath);
  const recoveredMain = await appendDailyObdSessionEvent(
    basePath, makeState(), 'SESSION_RECOVERED', '2026-10-31T16:00:00.000Z',
  );
  assert.equal(recoveredMain.eventCount, 6);
  history = files.get(logPath);
  assert.ok(history.includes('SESSION_START | 2026-10-31T10:00:00.000Z'));
  assert.ok(history.includes('SESSION_RECOVERED | 2026-10-31T16:00:00.000Z'));

  // An unreadable existing main file is not an empty history and must not be overwritten.
  const preservedHistory = files.get(logPath);
  failReadPath = logPath;
  await assert.rejects(
    () => appendDailyObdSessionEvent(basePath, makeState(), 'SESSION_START', '2026-10-31T17:00:00.000Z'),
    /SIMULATED_READ_FAILURE/,
  );
  failReadPath = null;
  assert.equal(files.get(logPath), preservedHistory);

  console.log('dailyObdHistory.test.js: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
