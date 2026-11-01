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
let failMoveTarget = null;
let failCopyTo = null;

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
    if (failCopyTo === to) {
      failCopyTo = null;
      throw new Error('SIMULATED_COPY_FAILURE: ' + to);
    }
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
    if (failMoveTarget === to) {
      failMoveTarget = null;
      throw new Error('SIMULATED_MOVE_FAILURE: ' + to);
    }
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
let migrationExports = null;
let healthExports = null;
let atomicExports = null;
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === 'expo-file-system') return fakeFileSystem;
  if (request === 'react-native') return platform;
  if (request === './historyIndexMigrations') return migrationExports;
  if (request === './storageHealth' || request === '../storage/storageHealth') return healthExports;
  if (request === '../storage/atomicJsonFile') return atomicExports;
  if (request === './merivaManual') return { MERIVA_MANUAL: {
    modelYear: 2012,
    engine: { designation: '1.4 8V ECONO.FLEX', displacementCm3: 1389, cylinders: 4 },
    modelYearReference: '2011/2012',
    capacities: { fuelTankL: 54, fuelReserveApproxL: 5 },
    source: 'MANUAL_CHEVROLET_MERIVA',
  } };
  if (request === '../maintenance/maintenanceRules') return { MAINTENANCE_TASKS: [{ id: 'OIL' }] };
  if (request === '../database/csvLogger') {
    return { appendCsvRow: async (filePath, row) => csvRows.push({ filePath, row }), flushCsvLogs: async () => undefined };
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

const atomicJson = loadTs('src/storage/atomicJsonFile.ts');
atomicExports = atomicJson;
const migrations = loadTs('src/storage/historyIndexMigrations.ts');
migrationExports = migrations;
const health = loadTs('src/storage/storageHealth.ts');
healthExports = health;
const history = loadTs('src/storage/driveCycleStorage.ts');
const benchmark = loadTs('src/storage/historyBenchmark.ts');
const backup = loadTs('src/storage/backup.ts');
const appSettings = loadTs('src/database/appSettings.ts');
const vehicleConfig = loadTs('src/database/vehicleConfig.ts');
const learningProfile = loadTs('src/database/learningProfile.ts');
const maintenanceStorage = loadTs('src/database/maintenanceStorage.ts');

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

  const isJsonRecord = (value) => typeof value === 'object' && value !== null &&
    !Array.isArray(value) && value.schemaVersion === 1 && typeof value.value === 'string';
  const isFutureJson = (value) => typeof value === 'object' && value !== null &&
    typeof value.schemaVersion === 'number' && value.schemaVersion > 1;

  const corruptJsonPath = '/doc/atomic/corrupt.json';
  ensureDirectory('/doc/atomic');
  files.set(corruptJsonPath, '{JSON CORROMPIDO');
  await assert.rejects(
    () => atomicJson.writeJsonAtomically(corruptJsonPath, { schemaVersion: 1, value: 'novo' }, isJsonRecord, isFutureJson),
    /JSON_CORRUPTED/,
  );
  assert.equal(files.get(corruptJsonPath), '{JSON CORROMPIDO');

  const futureJsonPath = '/doc/atomic/future.json';
  const futureJson = JSON.stringify({ schemaVersion: 2, value: 'versão futura' });
  files.set(futureJsonPath, futureJson);
  await assert.rejects(
    () => atomicJson.writeJsonAtomically(futureJsonPath, { schemaVersion: 1, value: 'novo' }, isJsonRecord, isFutureJson),
    /JSON_SCHEMA_VERSION_NEWER_THAN_APP/,
  );
  assert.equal(files.get(futureJsonPath), futureJson, 'schema futuro deve permanecer byte a byte intacto');

  const validJsonPath = '/doc/atomic/valid.json';
  const originalValid = { schemaVersion: 1, value: 'versão anterior' };
  files.set(validJsonPath, JSON.stringify(originalValid));
  files.set('/doc/atomic/valid.previous.json', JSON.stringify({ schemaVersion: 1, value: 'cópia anterior' }));
  await atomicJson.writeJsonAtomically(validJsonPath, { schemaVersion: 1, value: 'versão nova' }, isJsonRecord, isFutureJson);
  assert.equal(JSON.parse(files.get(validJsonPath)).value, 'versão nova');
  assert.equal(JSON.parse(files.get('/doc/atomic/valid.previous.json')).value, 'versão anterior',
    'a cópia anterior deve conter o último principal validado');

  const rollbackJsonPath = '/doc/atomic/rollback.json';
  const rollbackOriginal = { schemaVersion: 1, value: 'estado íntegro' };
  files.set(rollbackJsonPath, JSON.stringify(rollbackOriginal));
  failMoveTarget = rollbackJsonPath;
  await assert.rejects(
    () => atomicJson.writeJsonAtomically(rollbackJsonPath, { schemaVersion: 1, value: 'falha' }, isJsonRecord, isFutureJson),
    /SIMULATED_MOVE_FAILURE/,
  );
  assert.deepEqual(JSON.parse(files.get(rollbackJsonPath)), rollbackOriginal,
    'falha ao substituir deve restaurar a cópia anterior verificada');

  const settingsBase = '/doc/SETTINGS_TEST';
  const settingsPath = settingsBase + '/CONFIG/app-settings.json';
  ensureDirectory(settingsBase + '/CONFIG');
  const brokenSettings = '{CONFIGURAÇÕES CORROMPIDAS';
  files.set(settingsPath, brokenSettings);
  files.set(settingsBase + '/CONFIG/app-settings.previous.json', JSON.stringify({
    schemaVersion: 1, fuelType: 'ETANOL', distanceUnit: 'KM', autoConnectObd: true,
  }));
  const restoredSettings = await appSettings.readAppSettings(settingsBase);
  assert.equal(restoredSettings.fuelType, 'ETANOL');
  assert.equal(files.get(settingsPath), brokenSettings, 'settings usa cópia anterior apenas para leitura');
  await assert.rejects(
    () => appSettings.writeAppSettings(settingsBase, restoredSettings),
    /JSON_CORRUPTED/,
  );
  assert.equal(files.get(settingsPath), brokenSettings, 'write de settings não pode substituir JSON corrompido');

  const futureSettingsBase = '/doc/FUTURE_SETTINGS_TEST';
  const futureSettingsPath = futureSettingsBase + '/CONFIG/app-settings.json';
  ensureDirectory(futureSettingsBase + '/CONFIG');
  const futureSettings = JSON.stringify({ schemaVersion: 2, fuelType: 'GASOLINA' });
  files.set(futureSettingsPath, futureSettings);
  await appSettings.readAppSettings(futureSettingsBase);
  assert.equal(files.get(futureSettingsPath), futureSettings, 'settings não pode sobrescrever schema futuro');

  const vehicleBase = '/doc/VEHICLE_TEST';
  const vehiclePath = vehicleBase + '/CONFIG/veiculo.json';
  ensureDirectory(vehicleBase + '/CONFIG');
  const brokenVehicle = '{VEICULO CORROMPIDO';
  const previousVehicle = {
    schemaVersion: 1, vehicleName: 'Meriva Maxx', year: 2012, make: 'Chevrolet',
    model: 'Meriva Maxx', engine: '1.4 8V ECONO.FLEX', displacementCm3: 1389,
    cylinders: 4, fuel: 'Gasolina / Álcool', modelYearReference: '2011/2012',
    tankCapacityL: 54, reserveCapacityL: 5, manualSource: 'MANUAL_CHEVROLET_MERIVA',
    createdAt: '2026-10-31T10:00:00.000Z', lastModified: '2026-10-31T10:00:00.000Z',
    protocolBaseline: 'KWP/K-Line',
  };
  files.set(vehiclePath, brokenVehicle);
  files.set(vehicleBase + '/CONFIG/veiculo.previous.json', JSON.stringify(previousVehicle));
  const safeVehicle = await vehicleConfig.ensureMerivaVehicleProfile(vehicleBase);
  assert.equal(safeVehicle.vehicleName, 'Meriva Maxx');
  assert.equal(files.get(vehiclePath), brokenVehicle, 'perfil recuperado não pode provocar regravação do arquivo corrompido');

  const learningBase = '/doc/LEARNING_TEST';
  const learningPath = learningBase + '/APRENDIZADO/dna_meriva.json';
  ensureDirectory(learningBase + '/APRENDIZADO');
  const brokenLearning = '{DNA CORROMPIDO';
  files.set(learningPath, brokenLearning);
  assert.equal(await learningProfile.readLearningProfile(learningBase), null);
  const ephemeralLearning = await learningProfile.createLearningProfile(learningBase, '2026-10-31T10:00:00.000Z');
  assert.equal(ephemeralLearning.learningStatus, 'COLD_START');
  assert.equal(files.get(learningPath), brokenLearning, 'perfil de aprendizado corrompido deve permanecer intacto');

  const maintenanceBase = '/doc/MAINTENANCE_TEST';
  const maintenancePath = maintenanceBase + '/MANUTENCAO/registros.json';
  ensureDirectory(maintenanceBase + '/MANUTENCAO');
  const brokenMaintenance = '{MANUTENÇÃO CORROMPIDA';
  files.set(maintenancePath, brokenMaintenance);
  const maintenancePrevious = {
    schemaVersion: 1, currentOdometerKm: 123456, severeUse: false,
    records: {}, fuelings: [], updatedAt: '2026-10-31T10:00:00.000Z',
  };
  files.set(maintenanceBase + '/MANUTENCAO/registros.previous.json', JSON.stringify(maintenancePrevious));
  const restoredMaintenance = await maintenanceStorage.readMaintenanceData(maintenanceBase);
  assert.equal(restoredMaintenance.currentOdometerKm, 123456);
  assert.equal(files.get(maintenancePath), brokenMaintenance,
    'manutenção deve usar cópia anterior somente para leitura');

  const freshSettings = await appSettings.readAppSettings('/doc/FRESH_SETTINGS_TEST');
  assert.equal(freshSettings.fuelType, 'FLEX');
  assert.equal(JSON.parse(files.get('/doc/FRESH_SETTINGS_TEST/CONFIG/app-settings.json')).schemaVersion, 1,
    'instalação sem arquivo deve criar configurações versionadas');

  const base = '/doc/MERIVA_SMART';
  const tripsDirectory = base + '/VIAGENS';
  const indexPath = tripsDirectory + '/index.json';
  const previousPath = tripsDirectory + '/index.previous.json';
  ensureDirectory(tripsDirectory);

  files.set(indexPath, '{JSON CORROMPIDO');
  files.set(previousPath, JSON.stringify({ ...legacy, schemaVersion: 1 }));
  const readRecovered = await history.readDriveCycles(base);
  assert.equal(readRecovered.length, 1, 'a leitura pode usar a cópia anterior validada sem escrever no índice principal');
  await history.initializeDriveCycles(base);
  assert.equal(files.get(indexPath), '{JSON CORROMPIDO', 'nem a inicialização pode substituir o JSON corrompido');
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
  assert.ok(report && report.includes('dumpsys meminfo'));
  assert.equal(files.get(indexPath), beforeBenchmark, 'exportar relatório também não pode alterar o histórico');

  const backupBase = '/doc/BACKUP_POLICY_TEST';
  for (const directory of ['BANCO', 'LEITURAS', 'LOGS', 'VIAGENS']) {
    ensureDirectory(backupBase + '/' + directory);
    files.set(backupBase + '/' + directory + '/' + directory.toLowerCase() + (directory === 'BANCO' ? '.json' : '.csv'), 'conteúdo');
  }
  const createdBackup = await backup.createBackup(backupBase);
  assert.ok(!createdBackup.includes.includes('LEITURAS'));
  assert.ok(!createdBackup.includes.includes('LOGS'), 'novos backups não devem copiar CSVs brutos de LOGS');
  assert.ok(files.has(backupBase + '/LEITURAS/leituras.csv'), 'a política de backup não pode apagar a origem LEITURAS');
  assert.ok(files.has(backupBase + '/LOGS/logs.csv'), 'a política de backup não pode apagar a origem LOGS');

  const backupRoot = backupBase + '/BACKUP';
  const legacyName = 'meriva_smart_2026-10-30T00-00-00-000Z';
  const legacyRoot = backupRoot + '/' + legacyName;
  const legacyDirectories = [];
  let legacySize = 0;
  for (const directory of ['LEITURAS', 'LOGS']) {
    ensureDirectory(legacyRoot + '/' + directory);
    const content = 'CSV legado preservado';
    files.set(legacyRoot + '/' + directory + '/historico.csv', content);
    const sizeBytes = Buffer.byteLength(content, 'utf8');
    legacySize += sizeBytes;
    legacyDirectories.push({ directory, sizeBytes });
  }
  files.set(legacyRoot + '/manifest.json', JSON.stringify({
    schemaVersion: 1,
    createdAt: '2026-10-30T00:00:00.000Z',
    payloadSizeBytes: legacySize,
    directories: legacyDirectories,
  }));
  const listedBackups = await backup.listVerifiedBackups(backupBase);
  assert.ok(listedBackups.some((item) => item.name === legacyName),
    'backups antigos com LEITURAS/LOGS devem continuar válidos para restauração');
  await new Promise((resolve) => setTimeout(resolve, 5));
  const legacyRestore = await backup.restoreBackup(backupBase, legacyName);
  assert.ok(legacyRestore.includes.includes('LEITURAS') && legacyRestore.includes.includes('LOGS'),
    'a restauração legada deve recuperar as pastas que estavam presentes no manifesto');
  assert.equal(files.get(backupBase + '/LEITURAS/historico.csv'), 'CSV legado preservado');
  assert.equal(files.get(backupBase + '/LOGS/historico.csv'), 'CSV legado preservado');
  const restoreSafety = (await backup.listVerifiedBackups(backupBase))
    .find((item) => item.name === legacyRestore.safetyBackupName);
  assert.ok(restoreSafety?.includes.includes('LEITURAS') && restoreSafety.includes.includes('LOGS'),
    'o snapshot de rollback deve preservar também as pastas brutas substituídas por um backup legado');

  files.set(backupBase + '/LEITURAS/historico.csv', 'LEITURAS ATUAIS ANTES DA FALHA');
  files.set(backupBase + '/LOGS/historico.csv', 'LOGS ATUAIS ANTES DA FALHA');
  failCopyTo = backupBase + '/LOGS';
  await assert.rejects(
    () => backup.restoreBackup(backupBase, legacyName),
    /RESTORE_FAILED_ROLLED_BACK/,
  );
  assert.equal(files.get(backupBase + '/LEITURAS/historico.csv'), 'LEITURAS ATUAIS ANTES DA FALHA',
    'falha em um diretório deve restaurar LEITURAS do snapshot de segurança');
  assert.equal(files.get(backupBase + '/LOGS/historico.csv'), 'LOGS ATUAIS ANTES DA FALHA',
    'falha em um diretório deve restaurar LOGS do snapshot de segurança');

  Module._load = originalLoad;
  console.log('storageIntegrity.test.js: PASS');
}

main().catch((cause) => {
  Module._load = originalLoad;
  console.error(cause);
  process.exitCode = 1;
});
