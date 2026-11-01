'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const files = new Map();
const directories = new Set(['/doc']);
const csvRows = [];
const exportFiles = new Map();

function ensureDirectory(directory) {
  const parts = directory.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    directories.add(current);
  }
}

function parentDirectory(filePath) {
  const index = filePath.lastIndexOf('/');
  return index <= 0 ? '/' : filePath.slice(0, index);
}

const fakeFileSystem = {
  EncodingType: { UTF8: 'utf8' },
  StorageAccessFramework: {
    async requestDirectoryPermissionsAsync() {
      return { granted: true, directoryUri: 'content://export' };
    },
    async createFileAsync(_directory, name) {
      const uri = 'content://export/' + name;
      exportFiles.set(uri, '');
      return uri;
    },
  },
  async getInfoAsync(filePath) {
    if (files.has(filePath)) {
      return { exists: true, isDirectory: false, size: Buffer.byteLength(files.get(filePath), 'utf8'), modificationTime: Date.now() / 1000 };
    }
    if (directories.has(filePath)) return { exists: true, isDirectory: true, size: 0 };
    return { exists: false, isDirectory: false, size: 0 };
  },
  async makeDirectoryAsync(directory) {
    ensureDirectory(directory);
  },
  async readDirectoryAsync(directory) {
    if (!directories.has(directory)) throw new Error('DIRECTORY_NOT_FOUND: ' + directory);
    const prefix = directory.replace(/\/$/, '') + '/';
    const names = new Set();
    for (const filePath of files.keys()) {
      if (!filePath.startsWith(prefix)) continue;
      const rest = filePath.slice(prefix.length);
      if (rest && !rest.includes('/')) names.add(rest);
    }
    for (const item of directories) {
      if (!item.startsWith(prefix)) continue;
      const rest = item.slice(prefix.length);
      if (rest && !rest.includes('/')) names.add(rest);
    }
    return Array.from(names);
  },
  async readAsStringAsync(filePath, options = {}) {
    if (exportFiles.has(filePath)) return exportFiles.get(filePath);
    if (!files.has(filePath)) throw new Error('FILE_NOT_FOUND: ' + filePath);
    const value = files.get(filePath);
    if (Number.isInteger(options.position) && Number.isInteger(options.length)) {
      return value.slice(options.position, options.position + options.length);
    }
    return value;
  },
  async writeAsStringAsync(filePath, value) {
    if (exportFiles.has(filePath)) {
      exportFiles.set(filePath, String(value));
      return;
    }
    ensureDirectory(parentDirectory(filePath));
    files.set(filePath, String(value));
  },
  async copyAsync({ from, to }) {
    if (files.has(from)) {
      ensureDirectory(parentDirectory(to));
      files.set(to, files.get(from));
      return;
    }
    if (!directories.has(from)) throw new Error('COPY_SOURCE_NOT_FOUND: ' + from);
    ensureDirectory(to);
    const prefix = from.replace(/\/$/, '') + '/';
    for (const [filePath, value] of Array.from(files.entries())) {
      if (filePath.startsWith(prefix)) files.set(to.replace(/\/$/, '') + '/' + filePath.slice(prefix.length), value);
    }
    for (const directory of Array.from(directories)) {
      if (directory.startsWith(prefix)) ensureDirectory(to.replace(/\/$/, '') + '/' + directory.slice(prefix.length));
    }
  },
  async moveAsync({ from, to }) {
    if (!files.has(from)) throw new Error('MOVE_SOURCE_NOT_FOUND: ' + from);
    if (files.has(to)) throw new Error('MOVE_TARGET_EXISTS: ' + to);
    ensureDirectory(parentDirectory(to));
    files.set(to, files.get(from));
    files.delete(from);
  },
  async deleteAsync(target, options = {}) {
    if (files.has(target)) {
      files.delete(target);
      return;
    }
    if (directories.has(target)) {
      const prefix = target.replace(/\/$/, '') + '/';
      for (const key of Array.from(files.keys())) if (key.startsWith(prefix)) files.delete(key);
      for (const key of Array.from(directories)) if (key === target || key.startsWith(prefix)) directories.delete(key);
      return;
    }
    if (!options.idempotent) throw new Error('DELETE_TARGET_NOT_FOUND: ' + target);
  },
};

const platform = { Platform: { OS: 'android', Version: 36 } };
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFileSystem;
  if (request === 'react-native') return platform;
  if (request === '../database/csvLogger') {
    return { appendCsvRow: async (filePath, row) => csvRows.push({ filePath, row }) };
  }
  return originalLoad.apply(this, arguments);
};

function loadTs(relativePath) {
  const absolutePath = path.join(ROOT, relativePath);
  const source = fs.readFileSync(absolutePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const loaded = new Module(absolutePath, module);
  loaded.filename = absolutePath;
  loaded.paths = Module._nodeModulePaths(path.dirname(absolutePath));
  loaded._compile(output, absolutePath);
  return loaded.exports;
}

const migrations = loadTs('src/storage/historyIndexMigrations.ts');
const health = loadTs('src/storage/storageHealth.ts');
const history = loadTs('src/storage/driveCycleStorage.ts');
const benchmark = loadTs('src/storage/historyBenchmark.ts');

function makeTrip(id) {
  return {
    id,
    startedAt: '2026-10-31T10:00:00.000Z',
    finishedAt: '2026-10-31T10:10:00.000Z',
    distanceTotalKm: 4.2,
    distanceIceKm: 4.2,
    fuelUsedL: 0.5,
    totalTimeHms: '00:10:00',
    drivingTimeHms: '00:09:00',
    standingTimeHms: '00:01:00',
    avgDrivingSpeedKmh: 28,
    avgFuelConsumptionKml: 8.4,
    fuelDataValid: true,
    maxSpeedKmh: 55,
    source: 'REAL_OBD',
    importedAt: '2026-10-31T10:10:00.000Z',
    telemetrySamples: [{
      timestamp: '2026-10-31T10:05:00.000Z',
      speedKmh: 28,
      rpm: 1800,
      coolantTempC: 85,
    }],
  };
}

async function main() {
  const legacy = { version: '1.0', cycles: [makeTrip('trip-1')], totalCount: 1 };
  const migrated = migrations.migrateHistoryIndexDocument(legacy);
  assert.equal(migrated.migrated, true);
  assert.equal(migrated.document.schemaVersion, 1);
  assert.equal(migrated.document.cycles.length, 1);
  assert.throws(
    () => migrations.migrateHistoryIndexDocument({ schemaVersion: 99, cycles: [] }),
    /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/,
  );

  const base = '/doc/MERIVA_SMART';
  const tripsDirectory = base + '/VIAGENS';
  const indexPath = tripsDirectory + '/index.json';
  const previousPath = tripsDirectory + '/index.previous.json';
  ensureDirectory(tripsDirectory);

  files.set(indexPath, '{JSON CORROMPIDO');
  files.set(previousPath, JSON.stringify({ ...legacy, schemaVersion: 1 }));
  const readRecovered = await history.readDriveCycles(base);
  assert.equal(readRecovered.length, 1, 'a leitura pode usar a cópia anterior validada sem escrever no índice principal');
  assert.equal(files.get(indexPath), '{JSON CORROMPIDO', 'a leitura não pode substituir o JSON corrompido');
  assert.ok(health.getStorageHealthIssues().some((issue) => issue.code === 'HISTORY_CORRUPTED'));

  await assert.rejects(
    () => history.addDriveCycle(base, makeTrip('trip-2')),
    /HISTORICO_DE_VIAGENS_CORROMPIDO/,
  );
  assert.equal(files.get(indexPath), '{JSON CORROMPIDO', 'a gravação deve bloquear o índice corrompido');

  const future = JSON.stringify({ schemaVersion: 99, cycles: [makeTrip('future-trip')], totalCount: 1 });
  files.set(indexPath, future);
  await assert.rejects(() => history.readDriveCycles(base), /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);
  await assert.rejects(() => history.addDriveCycle(base, makeTrip('trip-3')), /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);
  assert.equal(files.get(indexPath), future, 'o schema futuro deve permanecer byte a byte intacto');

  const originalLegacy = JSON.stringify(legacy);
  files.set(indexPath, originalLegacy);
  await history.initializeDriveCycles(base);
  const current = JSON.parse(files.get(indexPath));
  assert.equal(current.schemaVersion, 1, 'o legado íntegro deve migrar para o schema versionado');
  assert.equal(current.cycles[0].id, 'trip-1');
  assert.equal(JSON.parse(files.get(previousPath)).cycles[0].id, 'trip-1', 'a cópia anterior validada deve permanecer');

  const beforeBenchmark = files.get(indexPath);
  const measured = await benchmark.measureHistoryStorage(base, 'android', 36);
  assert.equal(measured.integrity, 'OK');
  assert.equal(measured.trips, 1);
  assert.equal(measured.uniqueTripIds, 1);
  assert.equal(files.get(indexPath), beforeBenchmark, 'o benchmark não pode alterar o índice principal');
  assert.ok(measured.readParseMs.p95 >= 0);
  assert.ok(measured.restoreDryRunMs.p95 >= 0);
  assert.match(benchmark.formatHistoryBenchmarkReport(measured), /LIMIARES PARA INVESTIGAR SQLITE/);
  const exported = await benchmark.exportHistoryBenchmarkTxt(measured);
  assert.equal(exported.ok, true);
  const report = Array.from(exportFiles.values()).find((value) => value.includes('RELATÓRIO DE MEDIÇÃO DO HISTÓRICO'));
  assert.ok(report && report.includes('ADB dumpsys meminfo'));
  assert.equal(files.get(indexPath), beforeBenchmark, 'exportar relatório também não pode alterar o histórico');

  Module._load = originalLoad;
  console.log('storageIntegrity.test.js: PASS');
}

main().catch((cause) => {
  Module._load = originalLoad;
  console.error(cause);
  process.exitCode = 1;
});
