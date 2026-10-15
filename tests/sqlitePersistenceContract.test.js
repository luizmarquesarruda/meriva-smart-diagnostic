'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const parse = (relativePath) => JSON.parse(read(relativePath));

const database = read('src/storage/merivaDatabase.ts');
const autosave = read('src/meriva/autosaveManager.ts');
const testScreen = read('app/testes-sensores.tsx');
const packageJson = parse('package.json');
const packageLock = parse('package-lock.json');
const diary = read('docs/DIARIO_DE_BORDO.md');
const reportDocs = read('docs/SQLITE_PERSISTENCIA.md');

assert.equal(packageJson.dependencies['expo-sqlite'], '~14.0.6');
assert.equal(packageLock.packages[''].dependencies['expo-sqlite'], '~14.0.6');
assert.equal(packageLock.packages['node_modules/expo-sqlite'].version, '14.0.6');
assert.equal(packageLock.packages['node_modules/@expo/websql'].version, '1.0.1');

for (const table of [
  'schema_migrations',
  'obd_sessions',
  'pid_readings',
  'dtc_events',
  'sensor_tests',
  'sensor_test_readings',
  'trip_records',
  'learned_pids',
  'diagnostic_findings',
]) {
  assert.match(database, new RegExp('CREATE TABLE IF NOT EXISTS ' + table + '\\b'), 'tabela faltando: ' + table);
}

assert.match(database, /PRAGMA journal_mode = WAL/i, 'WAL deve ser habilitado');
assert.match(database, /PRAGMA user_version = 1/i, 'migração 1 deve ser versionada');
assert.match(database, /PRAGMA user_version = 2/i, 'migração 2 deve ser versionada');
assert.match(database, /MIN_PID_SAMPLE_INTERVAL_MS = 2_000/, 'amostragem de PID deve ser limitada');
assert.match(database, /reading\.source !== 'REAL'/, 'simulação não pode virar histórico operacional');
assert.match(database, /reading\.status !== 'RESPONDEU'/, 'leituras sem resposta não podem alimentar PIDs aprendidos');
assert.match(database, /dtc\.source === 'REAL_OBD'/, 'DTCs importados/simulados não podem ser persistidos como reais');
assert.match(database, /cycle\.source === 'REAL_OBD'/, 'viagens importadas/semente não podem entrar no banco');
assert.match(database, /ON CONFLICT\(pid\) DO UPDATE/, 'aprendizado PID deve atualizar a chave existente');
assert.match(database, /ON CONFLICT\(id\) DO UPDATE/, 'relatórios repetidos do mesmo teste devem ser idempotentes');
assert.match(database, /status = 'RECOVERED'/, 'sessões abandonadas precisam ser recuperadas como encerradas');

assert.match(autosave, /initializeMerivaDatabase\(\)/, 'autosave deve inicializar SQLite');
assert.match(autosave, /migrateLegacyStateToSqlite\(runtime\.state\)/, 'snapshot antigo deve ser migrado sem ser removido');
assert.match(autosave, /recordRealPidReading\(reading\)/, 'amostras de telemetria devem alimentar SQLite');
assert.match(autosave, /persistOperationalStateToSqlite\(runtime\.state\.dtcs, runtime\.state\.driveCycles\)/, 'DTCs e viagens devem sincronizar');
assert.match(autosave, /appendAutoSaveHistory/, 'histórico TXT existente deve permanecer ativo');
assert.match(autosave, /autosave\.json/, 'JSON interno continua como recuperação do estado');

assert.match(testScreen, /persistSensorTestReport\(/, 'relatório da central de testes deve persistir no SQLite');
assert.match(testScreen, /writeAsStringAsync\(path,lines\.join/, 'a exportação visível do teste continua em TXT');
assert.match(testScreen, /TXT salvo\. O registro interno SQLite falhou/, 'falha no banco não deve apagar/invalidar o TXT');

assert.match(reportDocs, /TXT/i);
assert.match(reportDocs, /JSON/i);
assert.match(diary, /2026-10-15 — Evolução de persistência SQLite/);

console.log('sqlitePersistenceContract.test.js: OK — esquema, lockfile, filtros de dados reais, amostragem, migração JSON e exportação TXT.');
