'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compiled = new Map();

function loadTs(tsPath) {
  tsPath = path.normalize(tsPath);
  if (compiled.has(tsPath)) return compiled.get(tsPath).exports;

  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;

  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiled.set(tsPath, mod);
  mod._compile(output, tsPath);
  return mod.exports;
}

const files = new Map();
const dirs = new Set(['/doc']);
let writeDelayMs = 0;

function parentDir(p) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.substring(0, i);
}

function ensureDirTree(p) {
  const parts = p.split('/').filter(Boolean);
  let current = '';
  for (const part of parts) {
    current += '/' + part;
    dirs.add(current);
  }
}

function resetFS() {
  files.clear();
  dirs.clear();
  dirs.add('/doc');
  writeDelayMs = 0;
}

const fakeFS = {
  documentDirectory: '/doc',
  EncodingType: { UTF8: 'utf8' },

  async getInfoAsync(p) {
    if (files.has(p)) {
      return {
        exists: true,
        isDirectory: false,
        size: Buffer.byteLength(files.get(p), 'utf8'),
        uri: p,
        modificationTime: Date.now() / 1000,
      };
    }
    if (dirs.has(p)) return { exists: true, isDirectory: true, size: 0, uri: p };
    return { exists: false, isDirectory: false, size: 0, uri: p };
  },

  async makeDirectoryAsync(p) {
    ensureDirTree(p);
  },

  async readAsStringAsync(p) {
    if (!files.has(p)) throw new Error('ARQUIVO NAO EXISTE: ' + p);
    return files.get(p);
  },

  async writeAsStringAsync(p, content) {
    if (writeDelayMs > 0) await wait(writeDelayMs);
    ensureDirTree(parentDir(p));
    files.set(p, String(content));
  },

  async copyAsync({ from, to }) {
    if (files.has(from)) {
      ensureDirTree(parentDir(to));
      files.set(to, files.get(from));
      return;
    }
    if (dirs.has(from)) {
      ensureDirTree(to);
      for (const [p, content] of Array.from(files.entries())) {
        if (p.startsWith(from + '/')) {
          files.set(to + p.substring(from.length), content);
        }
      }
      return;
    }
    throw new Error('ORIGEM NAO EXISTE: ' + from);
  },

  async deleteAsync(p) {
    files.delete(p);
    for (const key of Array.from(files.keys())) {
      if (key.startsWith(p + '/')) files.delete(key);
    }
    dirs.delete(p);
  },

  async readDirectoryAsync(p) {
    if (!dirs.has(p)) throw new Error('DIRETORIO NAO EXISTE: ' + p);
    const names = new Set();
    for (const fp of files.keys()) {
      if (fp.startsWith(p + '/')) names.add(fp.substring(p.length + 1).split('/')[0]);
    }
    for (const dp of dirs) {
      if (dp.startsWith(p + '/')) names.add(dp.substring(p.length + 1).split('/')[0]);
    }
    return Array.from(names);
  },

  StorageAccessFramework: {
    async requestDirectoryPermissionsAsync() {
      return { granted: false, directoryUri: '' };
    },
    async createFileAsync() {
      throw new Error('SAF NAO SUPORTADO NOS TESTES');
    },
  },
};

const fakeRN = {
  AppState: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'android', Version: 35 },
};

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'expo-file-system') return fakeFS;
  if (request === 'react-native') return fakeRN;
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};

function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const BASE = '/doc/MERIVA_SMART';

async function testParser() {
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  assert.strictEqual(parser.parsePidResponse('0105', '41 05 69').value, 65);
  assert.strictEqual(parser.parsePidResponse('010C', '41 0C 1A F8').value, 1726);
  assert.strictEqual(parser.parsePidResponse('010C', '41 0C 1A').value, null);
  assert.strictEqual(parser.parsePidResponse('0199', '41 99 FF').status, 'VALOR NÃO INTERPRETADO');
  assert.strictEqual(parser.parsePidResponse('010C', 'NO DATA').status, 'NÃO RESPONDEU');
}

async function testElmAndProtocol() {
  const { Elm327Session } = loadTs(path.join(ROOT, 'src/obd/elm327.ts'));
  const { SimulatedObdTransport } = loadTs(path.join(ROOT, 'src/obd/simulatedTransport.ts'));

  const session = new Elm327Session(new SimulatedObdTransport());
  const initialization = await session.initialize();
  assert.ok(initialization.some((item) => item.command === 'ATDP'));
  assert.strictEqual(session.getProtocol(), 'SIMULATED OBD TRANSPORT');

  const result = await session.queryPid('010C');
  assert.strictEqual(result.tx, '010C');
  assert.strictEqual(result.rx, '41 0C 0C 18');
  assert.strictEqual(result.protocol, 'SIMULATED OBD TRANSPORT');
  assert.strictEqual(result.parsed.value, 774);
  await session.close();
}

async function testQuota() {
  resetFS();
  const m = loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  await fakeFS.writeAsStringAsync(`${BASE}/LOGS/a.csv`, 'x'.repeat(1024 * 1024));

  const quota = loadTs(path.join(ROOT, 'src/storage/quotaManager.ts'));
  const usage = await quota.getStorageUsage(BASE, 0.5);
  assert.strictEqual(usage.limitMb, 0.5);

  const status = await quota.checkStorageQuota(BASE, {
    limitMb: 0.5,
    warningThreshold: 0.8,
    cleanupTargetMb: 0.4,
    autoCleanupEnabled: true,
  });
  assert.strictEqual(status.critical, true);
  m.disposeAutoSave();
}

async function testRawLogger() {
  resetFS();
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  const logger = loadTs(path.join(ROOT, 'src/database/obdLogger.ts'));
  const parsed = parser.parsePidResponse('010C', '41 0C 1A F8');

  const query = {
    tx: '010C',
    rx: '41 0C 1A F8',
    elapsedMs: 17,
    commandStatus: 'OK',
    protocol: 'ISO 14230-4 (KWP FAST)',
    parsed,
  };

  await logger.logRawObdData(BASE, query, '010C', 'REAL');
  await logger.logInterpretedData(BASE, query, '010C', 'REAL');

  const rawFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_raw_'));
  const interpretedFile = Array.from(files.keys()).find((p) => p.includes('/LOGS/obd_interpreted_'));
  assert.ok(rawFile);
  assert.ok(interpretedFile);

  const raw = files.get(rawFile);
  const interpreted = files.get(interpretedFile);
  assert.ok(raw.startsWith('timestamp,tx,rx,pid,responseTimeMs,commandStatus,protocol,source'));
  assert.ok(raw.includes('010C,41 0C 1A F8'));
  assert.ok(interpreted.includes('010C,41 0C 1A F8'));
  assert.ok(interpreted.includes('ISO 14230-4 (KWP FAST)'));
}

async function testVehicleProfile() {
  resetFS();
  const vehicle = loadTs(path.join(ROOT, 'src/database/vehicleConfig.ts'));
  const profile = {
    vehicleName: 'Meriva Maxx',
    year: 2012,
    make: 'Chevrolet',
    model: 'Meriva Maxx',
    engine: '1.4 8V',
    createdAt: new Date().toISOString(),
    lastModified: new Date().toISOString(),
    protocolBaseline: 'N/D',
  };

  await vehicle.createVehicleProfile(BASE, profile);
  assert.strictEqual((await vehicle.readVehicleProfile(BASE)).vehicleName, 'Meriva Maxx');
  files.set(`${BASE}/CONFIG/veiculo.json`, '{invalido');
  assert.strictEqual(await vehicle.readVehicleProfile(BASE), null);
}

async function testSeedImporter() {
  resetFS();
  const seed = loadTs(path.join(ROOT, 'src/storage/seedImporter.ts'));
  const txt = loadTs(path.join(ROOT, 'src/database/txtDatabase.ts'));

  const content = `[PID]\nname=010C\n\n[OBSERVATION]\nrpm=900\n\n[DTC_HISTORICAL]\ncode=P0301\n\n[CONSUMPTION_REFERENCE]\nkm=20\n`;
  const first = await seed.importCarScannerBaseline(BASE, content);
  assert.strictEqual(first.pidsImported, 1);
  assert.strictEqual(first.observationsImported, 1);
  assert.strictEqual(first.dtcHistoricalImported, 1);
  assert.strictEqual(first.consumptionReferencesImported, 1);

  const second = await seed.importCarScannerBaseline(BASE, content);
  assert.deepStrictEqual(second, first);

  const pids = await txt.readTxtEntries(BASE, 'carscanner_baseline_pids.txt');
  assert.strictEqual(pids.length, 1);
}

async function testDriveCycleValidation() {
  resetFS();
  const storage = loadTs(path.join(ROOT, 'src/storage/driveCycleStorage.ts'));
  const cycle = {
    id: 'test-1',
    startedAt: '2026-10-02 10:00:00',
    finishedAt: '2026-10-02 10:10:00',
    distanceTotalKm: 5,
    distanceIceKm: 5,
    fuelUsedL: 0.5,
    totalTimeHms: '00:10:00',
    drivingTimeHms: '00:09:00',
    standingTimeHms: '00:01:00',
    avgDrivingSpeedKmh: 33.3,
    avgFuelConsumptionKml: 10,
    source: 'REAL_OBD',
    importedAt: '2026-10-02T13:00:00.000Z',
  };

  await storage.addDriveCycle(BASE, cycle);
  const read = await storage.readDriveCycles(BASE);
  assert.strictEqual(read.length, 1);
  assert.strictEqual(read[0].id, 'test-1');

  files.set(`${BASE}/VIAGENS/index.json`, JSON.stringify({ cycles: 'corrompido' }));
  assert.deepStrictEqual(await storage.readDriveCycles(BASE), []);
}

async function testAutosaveRace() {
  resetFS();
  const m = loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
  m.disposeAutoSave();
  await m.initAutoSave(BASE);

  m.updateAutoSaveState((state) => {
    state.settings.fase = 'primeira';
  });

  writeDelayMs = 40;
  const savePromise = m.saveNow('critical');
  await wait(5);

  m.updateAutoSaveState((state) => {
    state.settings.fase = 'segunda';
  });

  const saved = await savePromise;
  assert.strictEqual(saved, true);
  writeDelayMs = 0;

  await wait(1700);
  const envelope = JSON.parse(files.get(`${BASE}/CONFIG/autosave.json`));
  assert.strictEqual(envelope.payload.settings.fase, 'segunda');
  m.disposeAutoSave();
}

async function main() {
  const tests = [
    ['parser', testParser],
    ['elm/protocolo', testElmAndProtocol],
    ['quota configurável', testQuota],
    ['logger TX/RX', testRawLogger],
    ['perfil do veículo', testVehicleProfile],
    ['seed importer', testSeedImporter],
    ['drive cycles', testDriveCycleValidation],
    ['autosave race', testAutosaveRace],
  ];

  let failed = 0;
  for (const [name, fn] of tests) {
    try {
      await fn();
      console.log(`PASS regression: ${name}`);
    } catch (error) {
      failed++;
      console.error(`FAIL regression: ${name}`);
      console.error(error && error.stack ? error.stack : error);
    }
  }

  console.log(failed === 0 ? `\\n${tests.length} regressões: TODAS PASSARAM` : `\\n${tests.length} regressões: ${failed} FALHARAM`);
  process.exitCode = failed === 0 ? 0 : 1;
}

main();
