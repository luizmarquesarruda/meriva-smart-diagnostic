'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const files = new Map();
const directories = new Set(['/doc']);

function parentDir(value) {
  const index = value.lastIndexOf('/');
  return index <= 0 ? '/' : value.slice(0, index);
}

const fakeFS = {
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
    const prefix = value.replace(/\/+$/, '') + '/';
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
  async writeAsStringAsync(value, content) {
    const parent = parentDir(value);
    if (parent && !directories.has(parent)) await this.makeDirectoryAsync(parent);
    files.set(value, String(content));
  },
  async copyAsync({ from, to }) {
    if (!files.has(from)) throw new Error('COPY_SOURCE_NOT_FOUND: ' + from);
    const parent = parentDir(to);
    if (parent && !directories.has(parent)) await this.makeDirectoryAsync(parent);
    files.set(to, files.get(from));
  },
  async deleteAsync(value) {
    files.delete(value);
    directories.delete(value);
  },
};

const compiled = new Map();
function loadTs(file) {
  const sourcePath = path.resolve(file);
  if (compiled.has(sourcePath)) return compiled.get(sourcePath).exports;
  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  compiled.set(sourcePath, mod);
  mod._compile(output, sourcePath);
  return mod.exports;
}

const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFS;
  if (request.startsWith('./') || request.startsWith('../')) {
    const parent = arguments[1];
    if (parent?.filename) {
      const resolved = path.resolve(path.dirname(parent.filename), request);
      if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
    }
  }
  return originalLoad.apply(this, arguments);
};

const storage = loadTs(path.join(ROOT, 'src/storage/driveCycleStorage.ts'));
Module._load = originalLoad;

const BASE = '/doc/MERIVA_SMART';
const indexPath = BASE + '/VIAGENS/index.json';
const backupPath = BASE + '/VIAGENS/index.previous.json';

function makeCycle(id, overrides = {}) {
  return {
    id,
    startedAt: '2026-10-12T10:00:00.000Z',
    finishedAt: '2026-10-12T10:20:00.000Z',
    distanceTotalKm: 12.3,
    distanceIceKm: 12.3,
    fuelUsedL: 0.8,
    totalTimeHms: '00:20:00',
    drivingTimeHms: '00:18:00',
    standingTimeHms: '00:02:00',
    avgDrivingSpeedKmh: 41,
    avgFuelConsumptionKml: 15.375,
    source: 'REAL_OBD',
    importedAt: '2026-10-12T10:20:01.000Z',
    ...overrides,
  };
}

(async () => {
  await storage.initializeDriveCycles(BASE);
  assert.deepStrictEqual(await storage.readDriveCycles(BASE), []);
  assert.ok(files.has(backupPath), 'primeira inicialização deve criar backup válido');

  await storage.addDriveCycle(BASE, makeCycle('trip-1'));
  assert.deepStrictEqual((await storage.readDriveCycles(BASE)).map((cycle) => cycle.id), ['trip-1']);

  // Corrupt the primary index; addDriveCycle must preserve it and recover from
  // the last successfully committed backup rather than replacing history with [].
  const damagedOriginal = '{broken-json-do-not-delete';
  files.set(indexPath, damagedOriginal);
  await storage.addDriveCycle(BASE, makeCycle('trip-2'));
  const recovered = await storage.readDriveCycles(BASE);
  assert.deepStrictEqual(recovered.map((cycle) => cycle.id), ['trip-1', 'trip-2']);
  assert.ok(
    Array.from(files.keys()).some((name) => /^\/doc\/MERIVA_SMART\/VIAGENS\/index\.json\.corrupt\.\d+\.json$/.test(name)),
    'índice corrompido deve ser arquivado para recuperação manual',
  );

  // Concurrent finalizations must serialize read-modify-write and keep both trips.
  await Promise.all([
    storage.addDriveCycle(BASE, makeCycle('trip-3')),
    storage.addDriveCycle(BASE, makeCycle('trip-4')),
  ]);
  await storage.addDriveCycle(BASE, makeCycle('trip-4'));
  const finalCycles = await storage.readDriveCycles(BASE);
  assert.deepStrictEqual(
    finalCycles.map((cycle) => cycle.id).sort(),
    ['trip-1', 'trip-2', 'trip-3', 'trip-4'],
    'gravações concorrentes e repetidas não podem perder nem duplicar viagens',
  );

  // Invalid measurements are rejected before touching the persisted history.
  await assert.rejects(
    storage.addDriveCycle(BASE, makeCycle('invalid', { fuelUsedL: -2 })),
    /VIAGEM INVÁLIDA/,
  );
  assert.strictEqual((await storage.readDriveCycles(BASE)).length, 4);

  // With no valid backup, a corrupt index must remain byte-for-byte intact.
  files.clear();
  directories.clear();
  directories.add('/doc');
  await fakeFS.makeDirectoryAsync(BASE + '/VIAGENS', { intermediates: true });
  files.set(indexPath, damagedOriginal);
  await assert.rejects(
    storage.addDriveCycle(BASE, makeCycle('trip-blocked')),
    /CORROMPIDO E SEM BACKUP VÁLIDO/,
  );
  assert.strictEqual(files.get(indexPath), damagedOriginal, 'sem backup válido, não sobrescrever o índice danificado');
  assert.strictEqual(files.has(indexPath + '.tmp'), false);

  console.log('driveCycleStorageSafety.test.js: OK');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
