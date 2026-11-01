'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/database/csvLogger.ts');
const files = new Map();
const directories = new Set(['/base', '/base/LOGS']);

function info(filePath) {
  const isDirectory = directories.has(filePath);
  const value = files.get(filePath);
  return {
    exists: isDirectory || files.has(filePath),
    isDirectory,
    size: value === undefined ? 0 : Buffer.byteLength(value, 'utf8'),
    modificationTime: Date.now() / 1000,
  };
}

const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync(directory) {
    directories.add(directory);
  },
  async getInfoAsync(filePath) {
    return info(filePath);
  },
  async readDirectoryAsync(directory) {
    if (!directories.has(directory)) throw new Error('DIRECTORY_NOT_FOUND: ' + directory);
    const prefix = directory.endsWith('/') ? directory : directory + '/';
    return Array.from(new Set([
      ...Array.from(files.keys()).filter((file) => file.startsWith(prefix)).map((file) => file.slice(prefix.length).split('/')[0]),
      ...Array.from(directories).filter((item) => item.startsWith(prefix)).map((item) => item.slice(prefix.length).split('/')[0]),
    ])).filter(Boolean);
  },
  async writeAsStringAsync(filePath, value) {
    files.set(filePath, String(value));
  },
  async readAsStringAsync(filePath) {
    if (!files.has(filePath)) throw new Error('FILE_NOT_FOUND: ' + filePath);
    return files.get(filePath);
  },
  async moveAsync({ from, to }) {
    if (!files.has(from)) throw new Error('MOVE_SOURCE_NOT_FOUND: ' + from);
    if (files.has(to)) throw new Error('MOVE_TARGET_EXISTS: ' + to);
    files.set(to, files.get(from));
    files.delete(from);
  },
  async deleteAsync(filePath, options = {}) {
    if (files.has(filePath)) {
      files.delete(filePath);
      return;
    }
    if (!options.idempotent) throw new Error('DELETE_TARGET_NOT_FOUND: ' + filePath);
  },
};

function loadLogger() {
  const source = require('node:fs').readFileSync(sourcePath, 'utf8');
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

  const originalLoad = Module._load;
  Module._load = function(request) {
    if (request === 'expo-file-system') return fakeFileSystem;
    if (request === 'react-native') return { AppState: { addEventListener: () => ({ remove() {} }) } };
    if (request === './csvQueuePolicy') {
      return {
        BATCH_FLUSH_ROW_LIMIT: 8,
        HARD_MAX_PENDING_CSV_ROWS: 100,
        MAX_PENDING_CSV_ROWS: 4,
        SPILL_CHUNK_ROWS: 2,
        getCsvQueueAction(pendingRows) {
          if (!Number.isFinite(pendingRows) || pendingRows < 0 || pendingRows >= 100) return 'drop';
          if (pendingRows >= 4) return 'spill';
          if (pendingRows >= 8) return 'flush';
          return 'queue';
        },
      };
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    mod._compile(output, sourcePath);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

function parseCsv(content) {
  return content.trim().split('\n').map((line) => line.split(','));
}

async function main() {
  const filePath = '/base/LOGS/obd_raw_2026-11-01.csv';
  const logger = loadLogger();
  const rows = [
    { timestamp: '2026-11-01T10:00:00.001Z', eventId: 'event-1', pid: '010C' },
    { timestamp: '2026-11-01T10:00:00.002Z', eventId: 'event-2', pid: '010C', extra: 'new-column' },
    { timestamp: '2026-11-01T10:00:00.003Z', eventId: 'event-3', pid: '010D' },
    { timestamp: '2026-11-01T10:00:00.004Z', eventId: 'event-4', pid: '010D', extra: 'also-kept' },
  ];

  for (const row of rows) logger.queueCsvRow(filePath, row);
  await logger.flushCsvLogs();

  const initialSegments = await logger.getCsvLogSegments(filePath);
  assert.deepEqual(initialSegments, [
    filePath,
    '/base/LOGS/obd_raw_2026-11-01.part-0002.csv',
  ], 'overflow must use canonical daily segments, not orphan .queue files');
  assert.equal(logger.getCsvQueueStatus().durablySpooledRows, rows.length);
  assert.ok(!Array.from(files.keys()).some((item) => item.includes('.queue-')));

  const initialContents = initialSegments.map((segment) => files.get(segment));
  for (const csv of initialContents) {
    const records = parseCsv(csv);
    assert.equal(records[0].join(','), 'timestamp,eventId,pid,extra',
      'all chunk rows must share the union of observed columns');
    assert.ok(Buffer.byteLength(csv, 'utf8') <= logger.MAX_CSV_SEGMENT_BYTES);
    assert.equal(records.length, 3, 'each test segment must contain a header and two data rows');
  }

  // Simulate a process restart: module memory is reset while filesystem data remains.
  const restartedLogger = loadLogger();
  assert.equal(restartedLogger.getCsvQueueStatus().durablySpooledRows, 0,
    'the in-memory metric is per process and must not masquerade as a persisted counter');
  assert.deepEqual(await restartedLogger.getCsvLogSegments(filePath), initialSegments,
    'committed segments must be discoverable after restart');

  await restartedLogger.appendCsvRowIfMissing(
    filePath,
    { timestamp: '2026-11-01T10:00:00.001Z', eventId: 'event-1', pid: '010C' },
    'eventId',
  );
  assert.deepEqual(await restartedLogger.getCsvLogSegments(filePath), initialSegments,
    'idempotent summary insertion must find identifiers in earlier committed segments');

  await restartedLogger.appendCsvRowIfMissing(
    filePath,
    { timestamp: '2026-11-01T10:00:00.005Z', eventId: 'event-5', pid: '010C' },
    'eventId',
  );
  const allSegments = await restartedLogger.getCsvLogSegments(filePath);
  const allRecords = allSegments.flatMap((segment) => parseCsv(files.get(segment)).slice(1));
  const eventIds = allRecords.map((record) => record[1]);
  assert.deepEqual(eventIds, ['event-1', 'event-2', 'event-3', 'event-4', 'event-5']);
  assert.equal(new Set(eventIds).size, eventIds.length, 'restart/append must not duplicate committed rows');

  // A normal append that would cross 512 KiB must rotate rather than enlarge the prior segment.
  const rotationPath = '/base/LOGS/obd_raw_2026-11-01_rotation.csv';
  const header = 'timestamp,eventId,pid\\n';
  const existingPrefix = '2026-11-01T09:00:00.000Z,existing,';
  const largeValue = 'x'.repeat(restartedLogger.MAX_CSV_SEGMENT_BYTES
    - Buffer.byteLength(header, 'utf8')
    - Buffer.byteLength(existingPrefix, 'utf8')
    - 16);
  const originalSegment = header + existingPrefix + largeValue + '\\n';
  files.set(rotationPath, originalSegment);
  await restartedLogger.appendCsvRowIfMissing(
    rotationPath,
    { timestamp: '2026-11-01T10:00:00.006Z', eventId: 'after-limit', pid: '010C' },
    'eventId',
  );
  const rotatedSegments = await restartedLogger.getCsvLogSegments(rotationPath);
  assert.deepEqual(rotatedSegments, [
    rotationPath,
    '/base/LOGS/obd_raw_2026-11-01_rotation.part-0002.csv',
  ], 'an append that exceeds the byte budget must create a new segment');
  assert.equal(files.get(rotationPath), originalSegment,
    'rotation must not rewrite or truncate the previously committed segment');
  for (const segment of rotatedSegments) {
    assert.ok(Buffer.byteLength(files.get(segment), 'utf8') <= restartedLogger.MAX_CSV_SEGMENT_BYTES,
      'no committed segment may exceed the byte limit');
  }
  assert.ok(files.get(rotatedSegments[1]).includes('after-limit'));

  console.log('csvSpoolDurability.test.js: PASS');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
