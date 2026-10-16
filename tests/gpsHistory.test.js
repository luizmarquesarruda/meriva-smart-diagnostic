'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/gps/gpsHistory.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

let files;
let directories;

function parentDir(value) {
  const index = value.lastIndexOf('/');
  return index <= 0 ? '/' : value.slice(0, index);
}

function createMemoryFS() {
  return {
    documentDirectory: '/doc/',
    EncodingType: { UTF8: 'utf8' },
    async getInfoAsync(value) {
      if (files.has(value)) return { exists: true, isDirectory: false, size: files.get(value).length };
      if (directories.has(value)) return { exists: true, isDirectory: true, size: 0 };
      return { exists: false, isDirectory: false, size: 0 };
    },
    async makeDirectoryAsync(value) {
      const parts = value.split('/').filter(Boolean);
      let current = '';
      for (const part of parts) {
        current += '/' + part;
        directories.add(current);
      }
    },
    async readDirectoryAsync(value) {
      if (!directories.has(value)) throw new Error('DIRECTORY_NOT_FOUND: ' + value);
      const prefix = value.replace(/[/]+$/, '') + '/';
      const names = new Set();
      for (const directory of directories) {
        if (!directory.startsWith(prefix)) continue;
        const remainder = directory.slice(prefix.length);
        if (remainder && !remainder.includes('/')) names.add(remainder);
      }
      for (const file of files.keys()) {
        if (!file.startsWith(prefix)) continue;
        const remainder = file.slice(prefix.length);
        if (remainder && !remainder.includes('/')) names.add(remainder);
      }
      return Array.from(names);
    },
    async readAsStringAsync(value) {
      if (!files.has(value)) throw new Error('FILE_NOT_FOUND: ' + value);
      return files.get(value);
    },
    async writeAsStringAsync(value, text) {
      const parent = parentDir(value);
      if (!directories.has(parent)) await this.makeDirectoryAsync(parent);
      files.set(value, String(text));
    },
    async deleteAsync(value) {
      files.delete(value);
      directories.delete(value);
      for (const file of Array.from(files.keys())) {
        if (file.startsWith(value.replace(/[/]+$/, '') + '/')) files.delete(file);
      }
      for (const directory of Array.from(directories)) {
        if (directory.startsWith(value.replace(/[/]+$/, '') + '/')) directories.delete(directory);
      }
    },
  };
}

files = new Map();
directories = new Set(['/doc']);
const fakeFS = createMemoryFS();
const compiledCache = new Map();
function loadTs(tsPath) {
  tsPath = path.resolve(tsPath);
  if (compiledCache.has(tsPath)) return compiledCache.get(tsPath).exports;
  const source = fs.readFileSync(tsPath, 'utf8');
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(tsPath, null);
  loaded.filename = tsPath;
  loaded.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiledCache.set(tsPath, loaded);
  loaded._compile(compiled, tsPath);
  return loaded.exports;
}

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFS;
  if (request === '../meriva/dailyObdHistory') {
    return loadTs(path.join(ROOT, 'src/meriva/dailyObdHistory.ts'));
  }
  return originalLoad.apply(this, arguments);
};

const dailyHistoryModule = loadTs(path.join(ROOT, 'src/meriva/dailyObdHistory.ts'));
const compiledModule = loadTs(sourcePath);
Module._load = originalLoad;

const {
  GpsHistoryStore,
  GPS_HISTORY_DIRECTORY,
  GPS_HISTORY_RETENTION_DAYS,
  GPS_HISTORY_MAX_SAMPLES_PER_DAY,
  GPS_HISTORY_SEGMENT_RECORDS,
} = compiledModule.exports;
const { appendDailyGpsHistoryIndex } = dailyHistoryModule;

function localKey(timestamp) {
  const date = new Date(timestamp);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function makeSample(timestamp, speedKmh = 36, signalQuality = 'EXCELENTE', valid = true) {
  return {
    schemaVersion: 1,
    timestamp,
    latitude: -23.55,
    longitude: -46.63,
    speedKmh,
    accuracyMeters: valid ? 4 : null,
    altitudeMeters: 700,
    headingDegrees: 180,
    source: 'GPS',
    valid,
    signalQuality,
  };
}

function linesInDirectory(directory) {
  return Array.from(files.entries())
    .filter(([name]) => name.startsWith(directory + '/'))
    .flatMap(([, content]) => content.split(/\r?\n/).filter(Boolean));
}

(async () => {
  const dir = '/doc/MERIVA_SMART/' + GPS_HISTORY_DIRECTORY;
  await fakeFS.makeDirectoryAsync(dir, { intermediates: true });

  const noon = new Date();
  noon.setHours(12, 0, 0, 0);
  let clock = noon.getTime();

  // Seed an expired local archive; the next day initialization must prune it.
  const oldDate = new Date(clock);
  oldDate.setDate(oldDate.getDate() - (GPS_HISTORY_RETENTION_DAYS + 5));
  const expiredName = `gps_${localKey(oldDate.getTime())}_0001.jsonl`;
  await fakeFS.writeAsStringAsync(dir + '/' + expiredName, '{"expired":true}\n');

  const store = new GpsHistoryStore('/doc/MERIVA_SMART', () => clock);
  await store.startSession();
  for (let index = 0; index < 3; index += 1) {
    const timestamp = clock;
    await store.record(makeSample(timestamp), 36);
    clock += 10_000;
  }
  await store.flush();

  let names = await fakeFS.readDirectoryAsync(dir);
  const todayFiles = names.filter((name) => name.startsWith('gps_' + localKey(noon.getTime()) + '_'));
  assert.strictEqual(todayFiles.length, 1, 'three nearby moving samples should occupy one segment');
  assert.strictEqual(linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length, 3);
  assert(!names.includes(expiredName), 'expired date segments should be removed by retention cleanup');
  const records = linesInDirectory(dir).map((line) => JSON.parse(line));
  assert(records.every((record) => record.source === 'GPS' && record.schemaVersion === 1 && typeof record.sessionId === 'string'));
  assert.strictEqual(records[0].latitude, -23.55);
  assert.strictEqual(records[0].speedKmh, 36);
  const dayKey = localKey(noon.getTime());
  const dailyIndexResult = await appendDailyGpsHistoryIndex('/doc/MERIVA_SMART', dayKey);
  assert.strictEqual(dailyIndexResult.added, false, 'GPS archive index should be idempotent');
  const dailyTxtPath = '/doc/MERIVA_SMART/VIAGENS/meriva_smart_daily_obd_history.txt';
  const dailyTxt = await fakeFS.readAsStringAsync(dailyTxtPath);
  assert.strictEqual((dailyTxt.match(/--- REGISTRO GPS LOCAL ---/g) || []).length, 1);

  // Duplicate timestamps must not create duplicate JSONL records.
  await store.record(makeSample(clock - 10_000), 36);
  await store.flush();
  assert.strictEqual(linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length, 3);

  // A movement transition is kept immediately; stationary samples are throttled.
  await store.record(makeSample(clock, 0), 0);
  clock += 1_000;
  await store.record(makeSample(clock, 0), 0);
  await store.flush();
  let count = linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length;
  assert.strictEqual(count, 4, 'movement-to-stopped transition should be recorded once');
  clock += 300_000;
  await store.record(makeSample(clock, 0), 0);
  await store.flush();
  count = linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length;
  assert.strictEqual(count, 5, 'stationary heartbeat should be written at the configured interval');

  // ECU disconnect flushes the final queued sample and ignores later GPS fixes.
  const firstSessionId = records[0].sessionId;
  clock += 10_000;
  await store.record(makeSample(clock, 36), 36);
  await store.stopSession();
  assert.strictEqual(linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length, 6,
    'disconnect must flush the last sample accepted during the ECU session');
  await store.record(makeSample(clock + 10_000), 36);
  await store.flush();
  assert.strictEqual(linesInDirectory(dir).filter((line) => line.includes('"schemaVersion":1')).length, 6,
    'samples received while ECU is disconnected must not be stored');
  await store.startSession();
  clock += 10_000;
  await store.record(makeSample(clock), 36);
  await store.flush();
  const afterReconnect = linesInDirectory(dir).map((line) => JSON.parse(line));
  assert.notStrictEqual(afterReconnect[afterReconnect.length - 1].sessionId, firstSessionId,
    'ECU reconnection must create a new GPS recording session');

  // Segment rollover is deterministic and never writes more than the configured chunk size.
  files.clear();
  directories.clear();
  directories.add('/doc');
  await fakeFS.makeDirectoryAsync(dir, { intermediates: true });
  let segmentClock = new Date(clock);
  segmentClock.setHours(13, 0, 0, 0);
  let segmentNow = segmentClock.getTime();
  const segmentDate = localKey(segmentNow);
  const segmentStore = new GpsHistoryStore('/doc/MERIVA_SMART', () => segmentNow);
  await segmentStore.startSession();
  for (let index = 0; index < GPS_HISTORY_SEGMENT_RECORDS + 2; index += 1) {
    await segmentStore.record(makeSample(segmentNow), 36);
    segmentNow += 10_000;
  }
  await segmentStore.flush();
  names = await fakeFS.readDirectoryAsync(dir);
  const segmentedFiles = names.filter((name) => name.startsWith('gps_' + segmentDate + '_')).sort();
  assert.strictEqual(segmentedFiles.length, 2, 'segment should roll over after 300 persisted rows');
  assert.strictEqual(files.get(dir + '/' + segmentedFiles[0]).split(/\r?\n/).filter(Boolean).length, GPS_HISTORY_SEGMENT_RECORDS);
  assert.strictEqual(files.get(dir + '/' + segmentedFiles[1]).split(/\r?\n/).filter(Boolean).length, 2);
  await appendDailyGpsHistoryIndex('/doc/MERIVA_SMART', segmentDate);

  // The daily hard cap is enforced using the number of existing persisted lines.
  files.clear();
  directories.clear();
  directories.add('/doc');
  await fakeFS.makeDirectoryAsync(dir, { intermediates: true });
  const capDay = localKey(clock);
  const midnight = new Date(clock);
  midnight.setHours(0, 0, 0, 0);
  let remaining = GPS_HISTORY_MAX_SAMPLES_PER_DAY;
  let timestamp = midnight.getTime();
  let segment = 1;
  while (remaining > 0) {
    const size = Math.min(GPS_HISTORY_SEGMENT_RECORDS, remaining);
    const rows = [];
    for (let i = 0; i < size; i += 1) {
      rows.push(JSON.stringify(makeSample(timestamp)));
      timestamp += 10_000;
    }
    const fileName = `gps_${capDay}_${String(segment).padStart(4, '0')}.jsonl`;
    await fakeFS.writeAsStringAsync(dir + '/' + fileName, rows.join('\n') + '\n');
    remaining -= size;
    segment += 1;
  }

  // Pick a timestamp later than the final seeded row, inside the same local day.
  const finalSampleTime = timestamp - 10_000;
  const cappedClock = finalSampleTime + 10_000;
  const cappedStore = new GpsHistoryStore('/doc/MERIVA_SMART', () => cappedClock);
  await cappedStore.startSession();
  await cappedStore.record(makeSample(cappedClock), 36);
  await cappedStore.flush();
  const totalLines = linesInDirectory(dir).length;
  assert.strictEqual(totalLines, GPS_HISTORY_MAX_SAMPLES_PER_DAY, 'daily storage limit must never be exceeded');

  console.log('PASS GPS HISTORY: JSONL segments, deduplication, retention, throttling and daily cap');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
