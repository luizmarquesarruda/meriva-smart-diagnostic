'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const DOCUMENT_DIRECTORY = 'file:///doc/';
const BASE = DOCUMENT_DIRECTORY + 'MERIVA_SMART';
const SQLITE_NAME = 'meriva_smart_history.db';
const files = new Map();
const directories = new Set(['file:///doc/']);
const databases = new Map();
const compiled = new Map();

function normalizePath(value) {
  return value.replace(/\/+/g, '/').replace(/^file:\//, 'file:///').replace(/\/$/, '');
}
function ensureDirectory(directory) {
  let current = normalizePath(directory).replace(/\/+$/, '');
  while (current && current !== 'file:') {
    directories.add(current);
    const separator = current.lastIndexOf('/');
    if (separator < 0) break;
    current = current.slice(0, separator);
  }
}
function parentDirectory(filePath) {
  const index = filePath.lastIndexOf('/');
  return index < 0 ? '.' : filePath.slice(0, index);
}
function dbPath() {
  return DOCUMENT_DIRECTORY.replace(/\/+$/, '') + '/SQLite/' + SQLITE_NAME;
}
function serializeDb(state) {
  return JSON.stringify({
    __testSqlite: true,
    rows: [...state.rows.values()],
    metadata: [...state.metadata.entries()],
  });
}
function persistDb(name, state) {
  const target = dbPath();
  ensureDirectory(parentDirectory(target));
  files.set(target, serializeDb(state));
}
function newDatabaseFromDisk() {
  const stored = files.get(dbPath());
  if (stored) {
    try {
      const parsed = JSON.parse(stored);
      if (parsed.__testSqlite === true) {
        return {
          rows: new Map((parsed.rows || []).map(row => [row.id, row])),
          metadata: new Map(parsed.metadata || []),
        };
      }
    } catch { /* a real SQLite binary is not expected in this test double */ }
  }
  return { rows: new Map(), metadata: new Map() };
}

const fakeFS = {
  documentDirectory: DOCUMENT_DIRECTORY,
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync(target) {
    ensureDirectory(target);
  },
  async getInfoAsync(target) {
    if (files.has(target)) {
      return { exists: true, isDirectory: false, size: Buffer.byteLength(files.get(target), 'utf8'), uri: target };
    }
    if (directories.has(target) || directories.has(target.replace(/\/$/, ''))) {
      return { exists: true, isDirectory: true, size: 0, uri: target };
    }
    return { exists: false, isDirectory: false, size: 0, uri: target };
  },
  async readAsStringAsync(target) {
    if (!files.has(target)) throw new Error('FILE_NOT_FOUND:' + target);
    return files.get(target);
  },
  async writeAsStringAsync(target, value) {
    ensureDirectory(parentDirectory(target));
    files.set(target, String(value));
  },
  async copyAsync({ from, to }) {
    if (files.has(from)) {
      ensureDirectory(parentDirectory(to));
      files.set(to, files.get(from));
      return;
    }
    if (directories.has(from)) {
      ensureDirectory(to);
      for (const [source, value] of [...files.entries()]) {
        if (source.startsWith(from + '/')) {
          files.set(to + source.slice(from.length), value);
        }
      }
      return;
    }
    throw new Error('COPY_SOURCE_NOT_FOUND:' + from);
  },
  async moveAsync({ from, to }) {
    if (!files.has(from)) throw new Error('MOVE_SOURCE_NOT_FOUND:' + from);
    ensureDirectory(parentDirectory(to));
    files.set(to, files.get(from));
    files.delete(from);
  },
  async deleteAsync(target, options = {}) {
    const existed = files.has(target) || directories.has(target);
    files.delete(target);
    for (const file of [...files.keys()]) if (file.startsWith(target.replace(/\/$/, '') + '/')) files.delete(file);
    for (const directory of [...directories]) if (directory === target || directory.startsWith(target.replace(/\/$/, '') + '/')) directories.delete(directory);
    if (target === dbPath()) databases.delete(SQLITE_NAME);
    if (!existed && !options.idempotent) throw new Error('DELETE_TARGET_NOT_FOUND:' + target);
  },
  async readDirectoryAsync(target) {
    const prefix = target.replace(/\/$/, '') + '/';
    const children = new Set();
    for (const item of [...files.keys(), ...directories]) {
      if (!item.startsWith(prefix)) continue;
      const remainder = item.slice(prefix.length);
      if (remainder) children.add(remainder.split('/')[0]);
    }
    return [...children];
  },
};

function getDb(name) {
  let state = databases.get(name);
  if (!state) {
    state = newDatabaseFromDisk();
    databases.set(name, state);
  }
  return state;
}
const fakeSQLite = {
  async openDatabaseAsync(name) {
    const state = getDb(name);
    const databasePath = dbPath();
    if (!files.has(databasePath)) persistDb(name, state);
    return {
      async execAsync() { persistDb(name, state); },
      async getFirstAsync(sql, ...params) {
        if (/FROM\s+drive_cycle_metadata/i.test(sql)) {
          const value = state.metadata.get(String(params[0]));
          return value === undefined ? null : { value };
        }
        return null;
      },
      async getAllAsync(sql) {
        if (/FROM\s+drive_cycles/i.test(sql) && /payload_json/i.test(sql)) {
          return [...state.rows.values()].map(row => ({ id: row.id, payload_json: row.payload_json }));
        }
        if (/FROM\s+drive_cycles/i.test(sql) && /\bSELECT\s+id\b/i.test(sql)) {
          return [...state.rows.keys()].map(id => ({ id }));
        }
        return [];
      },
      async runAsync(sql, ...params) {
        if (/INSERT\s+OR\s+(?:IGNORE|REPLACE)\s+INTO\s+drive_cycles/i.test(sql)) {
          const [id, startedAt, source, payloadJson, updatedAt] = params;
          if (/INSERT\s+OR\s+IGNORE/i.test(sql) && state.rows.has(String(id))) return { changes: 0 };
          state.rows.set(String(id), {
            id: String(id), started_at: String(startedAt), source: String(source),
            payload_json: String(payloadJson), updated_at: String(updatedAt),
          });
          persistDb(name, state);
          return { changes: 1 };
        }
        if (/DELETE\s+FROM\s+drive_cycles/i.test(sql)) {
          const count = state.rows.size;
          state.rows.clear();
          persistDb(name, state);
          return { changes: count };
        }
        if (/INSERT\s+OR\s+REPLACE\s+INTO\s+drive_cycle_metadata/i.test(sql)) {
          state.metadata.set(String(params[0]), String(params[1]));
          persistDb(name, state);
          return { changes: 1 };
        }
        throw new Error('UNSUPPORTED_SQL_IN_TEST_DOUBLE:' + sql);
      },
      async withTransactionAsync(operation) {
        const prior = {
          rows: new Map(state.rows),
          metadata: new Map(state.metadata),
        };
        try {
          await operation();
          persistDb(name, state);
        } catch (error) {
          state.rows = prior.rows;
          state.metadata = prior.metadata;
          persistDb(name, state);
          throw error;
        }
      },
      async closeAsync() {},
    };
  },
};

const originalLoad = Module._load;
Module._load = function(request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFS;
  if (request === 'expo-sqlite') return fakeSQLite;
  if (request === '../database/csvLogger') return { appendCsvRow: async () => {} };
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};

function loadTs(relativePath) {
  const sourcePath = path.resolve(ROOT, relativePath);
  if (compiled.has(sourcePath)) return compiled.get(sourcePath).exports;
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
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

function validCycle(id, overrides = {}) {
  return {
    id,
    startedAt: '2026-10-27T10:00:00.000Z',
    finishedAt: '2026-10-27T10:10:00.000Z',
    distanceTotalKm: 5,
    distanceIceKm: 5,
    fuelUsedL: 0.5,
    totalTimeHms: '00:10:00',
    drivingTimeHms: '00:09:00',
    standingTimeHms: '00:01:00',
    avgDrivingSpeedKmh: 33.3,
    avgFuelConsumptionKml: 10,
    source: 'REAL_OBD',
    importedAt: '2026-10-27T10:10:00.000Z',
    ...overrides,
  };
}
function resetHarness({ keepFiles = false, keepDb = false } = {}) {
  files.clear();
  directories.clear();
  directories.add('file:///doc/');
  if (!keepFiles) files.clear();
  if (!keepDb) databases.clear();
  compiled.clear();
}

async function main() {
  const storage = loadTs('src/storage/driveCycleStorage.ts');
  const indexPath = BASE + '/VIAGENS/index.json';
  const previousPath = BASE + '/VIAGENS/index.previous.json';
  const legacyCycle = validCycle('legacy-real');
  const seedCycle = validCycle('seed-reference', { source: 'CARSCANNER_SEED' });

  await fakeFS.makeDirectoryAsync(BASE + '/VIAGENS');
  await fakeFS.writeAsStringAsync(indexPath, JSON.stringify({
    version: '1.0',
    initializedAt: '2026-10-01T00:00:00.000Z',
    cycles: [seedCycle, legacyCycle],
    totalCount: 2,
  }));
  await storage.initializeDriveCycles(BASE);
  assert.deepStrictEqual(
    (await storage.readDriveCycles(BASE)).map(cycle => cycle.id),
    ['legacy-real'],
    'legacy real trip must migrate to SQLite and seed/reference records must not enter operational history',
  );
  assert.ok(files.has(BASE + '/VIAGENS/index.pre-sqlite.json'), 'migration must preserve a one-time source backup');
  assert.ok(files.has(BASE + '/VIAGENS/' + SQLITE_NAME), 'a verified SQLite snapshot must be available for backup/recovery');
  assert.equal(JSON.parse(files.get(indexPath)).version, '2.0-sqlite');

  // A restart/reinitialization must not duplicate migrated rows.
  storage.__resetDriveCycleStorageForTests();
  await storage.initializeDriveCycles(BASE);
  assert.deepStrictEqual(
    (await storage.readDriveCycles(BASE)).map(cycle => cycle.id),
    ['legacy-real'],
    'migration marker makes repeated startup idempotent',
  );

  await storage.addDriveCycle(BASE, validCycle('new-real'));
  assert.deepStrictEqual(
    (await storage.readDriveCycles(BASE)).map(cycle => cycle.id),
    ['legacy-real', 'new-real'],
    'new trips must be written to SQLite and remain readable',
  );
  assert.deepStrictEqual(
    JSON.parse(files.get(indexPath)).cycles.map(cycle => cycle.id),
    ['legacy-real', 'new-real'],
    'JSON compatibility snapshot must follow authoritative SQLite state',
  );

  files.set(indexPath, '{broken json');
  assert.deepStrictEqual(
    (await storage.readDriveCycles(BASE)).map(cycle => cycle.id),
    ['legacy-real', 'new-real'],
    'corrupt JSON compatibility data must not hide or destroy valid SQLite rows',
  );

  // The previous checked snapshot is preferred for explicit rollback/restore.
  const restored = await storage.restoreDriveCyclesFromBackup(BASE);
  assert.deepStrictEqual(restored.map(cycle => cycle.id), ['legacy-real'],
    'restoration uses a verified previous JSON snapshot and replaces SQLite atomically');
  assert.deepStrictEqual(
    (await storage.readDriveCycles(BASE)).map(cycle => cycle.id),
    ['legacy-real'],
  );

  // Migration must stop before touching invalid legacy data.
  resetHarness();
  storage.__resetDriveCycleStorageForTests();
  await fakeFS.makeDirectoryAsync(BASE + '/VIAGENS');
  const corrupted = '{not valid history';
  await fakeFS.writeAsStringAsync(indexPath, corrupted);
  await assert.rejects(
    () => storage.initializeDriveCycles(BASE),
    /LEGACY_TRIP_HISTORY_INVALID/,
    'invalid old history must stop migration without silently initializing an empty SQLite history',
  );
  assert.equal(files.get(indexPath), corrupted, 'invalid source JSON remains untouched for manual recovery');

  // Duplicate IDs cannot be silently collapsed by the SQLite primary key.
  resetHarness();
  storage.__resetDriveCycleStorageForTests();
  await fakeFS.makeDirectoryAsync(BASE + '/VIAGENS');
  await fakeFS.writeAsStringAsync(indexPath, JSON.stringify({
    version: '1.0',
    cycles: [validCycle('duplicate'), validCycle('duplicate', { distanceTotalKm: 9 })],
    totalCount: 2,
  }));
  await assert.rejects(
    () => storage.initializeDriveCycles(BASE),
    /LEGACY_TRIP_HISTORY_DUPLICATE_IDS/,
    'migration must not silently discard distinct legacy records that share a primary key',
  );
  assert.equal(JSON.parse(files.get(indexPath)).cycles.length, 2,
    'duplicate-ID legacy source must remain intact for manual reconciliation');

  console.log('PASS sqlite trip history: idempotent migration, seed filtering, read/write, recovery, corruption and duplicate-ID safety');
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
}).finally(() => {
  Module._load = originalLoad;
});
