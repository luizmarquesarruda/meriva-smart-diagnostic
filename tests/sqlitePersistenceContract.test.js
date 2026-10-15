'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const parse = (relativePath) => JSON.parse(read(relativePath));

const database = read('src/storage/merivaDatabase.ts');
const tripStorage = read('src/storage/driveCycleStorage.ts');
const autoTripService = read('src/trip/autoTripService.ts');
const autosave = read('src/meriva/autosaveManager.ts');
const testScreen = read('app/testes-sensores.tsx');
const healthScreen = read('app/saude.tsx');
const storageScreen = read('app/armazenamento.tsx');
const packageJson = parse('package.json');
const packageLock = parse('package-lock.json');
const diary = read('docs/DIARIO_DE_BORDO.md');
const reportDocs = read('docs/SQLITE_PERSISTENCIA.md');
const driveCycles = read('src/data/driveCycles.ts');
const learningProfile = read('src/database/learningProfile.ts');
const hydration = read('src/meriva/autosaveValidation.ts');
const historyTxt = read('src/meriva/autosaveHistoryTxt.ts');
const txtFormatter = read('src/meriva/autosaveTxtFormatter.ts');
const homeScreen = read('app/index.tsx');
const pidCatalog = parse('src/knowledge/meriva_confirmed_pids.json');

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
assert.match(database, /PRAGMA page_count/, 'tamanho lógico do banco deve ser obtido pelo SQLite');
assert.doesNotMatch(database, /openDatabaseAsync\(MERIVA_DATABASE_NAME, \{\},/, 'não usar API de diretório customizado ausente no SQLite v14');
assert.match(database, /lastPersistedTripFingerprints/, 'UPSERTs de viagens inalteradas devem ser evitados');
assert.match(database, /lastPersistedDtcFingerprints/, 'UPSERTs de DTCs inalterados devem ser evitados');
assert.match(database, /reading\.source !== 'REAL'/, 'simulação não pode virar histórico operacional');
assert.match(database, /reading\.status !== 'RESPONDEU'/, 'leituras sem resposta não podem alimentar PIDs aprendidos');
assert.match(database, /dtc\.source === 'REAL_OBD'/, 'DTCs importados/simulados não podem ser persistidos como reais');
assert.match(database, /cycle\.source === 'REAL_OBD'/, 'viagens importadas/semente não podem entrar no banco');
assert.match(database, /ON CONFLICT\(pid\) DO UPDATE/, 'aprendizado PID deve atualizar a chave existente');
assert.match(database, /ON CONFLICT\(id\) DO UPDATE/, 'relatórios repetidos do mesmo teste devem ser idempotentes');
assert.match(database, /status = 'RECOVERED'/, 'sessões abandonadas precisam ser recuperadas como encerradas');
assert.match(database, /SELECT metadata_json FROM obd_sessions/, 'fechamento de sessão deve preservar metadados anteriores');
assert.match(database, /withTransactionAsync\(async \(\) => \{[\s\S]*STALE_SESSION_BEFORE_NEW_SESSION[\s\S]*INSERT INTO obd_sessions/, 'abertura ECU deve fechar sessões órfãs e criar a nova sessão numa transação');
assert.match(database, /activeSessionId = null;[\s\S]*lastPidSampleAt\.clear\(\)/, 'fechar/trocar sessão deve cortar atribuição a sessão antiga antes do I/O seguinte');
assert.match(tripStorage, /serializeIndexOperation/, 'gravações simultâneas de viagens devem ser serializadas');
assert.match(tripStorage, /DRIVE_CYCLE_INDEX_UNREADABLE/, 'histórico corrompido sem backup não pode ser substituído silenciosamente');
assert.match(tripStorage, /writeIndexSafely/, 'índice de viagens deve usar staging, validação e recuperação');
assert.match(tripStorage, /CARSCANNER_SEED_NOT_ALLOWED_IN_OPERATIONAL_TRIP_HISTORY/, 'seed CarScanner não pode ser escrito no histórico operacional');
assert.match(autoTripService, /pendingFinalizedTrips/, 'viagem pendente de persistência deve ficar retida para nova tentativa');
assert.match(autoTripService, /AUTOSAVE_DA_VIAGEM_NAO_CONFIRMADO/, 'viagem não pode sair da fila antes de confirmar autosave');
assert.match(database, /persistDiagnosticFindings\(/, 'achados da IA local devem ser persistidos');
assert.match(database, /INSERT INTO diagnostic_findings/, 'achados devem ir para a tabela operacional');
assert.match(database, /stableHash\(/, 'IDs dos achados devem ser determinísticos e idempotentes');

assert.match(autosave, /initializeMerivaDatabase\(\)/, 'autosave deve inicializar SQLite');
assert.match(autosave, /migrateLegacyStateToSqlite\(runtime\.state\)/, 'snapshot antigo deve ser migrado sem ser removido');
assert.match(autosave, /recordRealPidReading\(reading\)/, 'amostras de telemetria devem alimentar SQLite');
assert.match(autosave, /persistOperationalStateToSqlite\(runtime\.state\.dtcs, runtime\.state\.driveCycles\)/, 'DTCs e viagens devem sincronizar');
assert.match(autosave, /appendAutoSaveHistory/, 'histórico TXT existente deve permanecer ativo');
assert.match(autosave, /autosave\.json/, 'JSON interno continua como recuperação do estado');

assert.match(testScreen, /persistSensorTestReport\(/, 'relatório da central de testes deve persistir no SQLite');
assert.match(testScreen, /writeAsStringAsync\(path,lines\.join/, 'a exportação visível do teste continua em TXT');
assert.match(testScreen, /TXT salvo\. O registro interno SQLite falhou/, 'falha no banco não deve apagar/invalidar o TXT');
assert.match(healthScreen, /persistDiagnosticFindings\(/, 'Central de Saúde deve registrar achados com evidência real');
assert.match(healthScreen, /lastPersistedFindingSignature/, 'achados idênticos não devem ser gravados a cada render');
assert.match(healthScreen, /30_000/, 'atualizações numéricas de hipótese devem ser limitadas a 30 s');
assert.match(database, /evidenceIdentity/, 'identidade do achado não deve depender da oscilação numérica da evidência');
assert.match(healthScreen, /setState\(\{\.\.\.getAutoSaveState\(\)\}\)/, 'poll de saúde deve publicar novo snapshot para atualizar UI e persistência');
assert.match(storageScreen, /getSqliteStorageOverview\(/, 'Central de Relatórios deve consultar estatísticas SQLite');
assert.match(storageScreen, /Amostras reais de PID/, 'contadores SQLite devem ser visíveis ao usuário');
assert.match(storageScreen, /Achados diagnósticos/, 'contagem de achados da Central de Saúde deve ser visível');
assert.match(database, /SQLITE_SCHEMA_NEWER_THAN_APP/, 'app não deve abrir silenciosamente banco de esquema futuro');

assert.match(driveCycles, /INITIAL_DRIVE_CYCLES: DriveCycle\[\] = \[\]/, 'novas instalações não devem ter viagens importadas');
assert.doesNotMatch(homeScreen, /initializeCarScannerSeed/, 'startup não deve reinstalar seeds CarScanner');
assert.match(homeScreen, /purgeCarScannerHistory/, 'startup deve limpar perfil legado');
assert.match(learningProfile, /globalSampleCounts\.seedSamples = 0/, 'purga deve zerar contador seed');
assert.match(learningProfile, /source = 'REAL_ONLY'/, 'aprendizado deve ficar real-only');
assert.match(hydration, /cycle\.source === 'REAL_OBD'/, 'autosave legado deve recuperar apenas viagens reais');
assert.match(hydration, /CARSCANNER_BASELINE/, 'estatísticas misturadas devem ser removidas na hidratação');
assert.match(historyTxt, /Histórico legado removido/, 'TXT legado não deve exibir aprendizado contaminado');
assert.match(txtFormatter, /state\.driveCycles\.filter\(\(cycle\) => cycle\.source === 'REAL_OBD'\)/, 'relatórios TXT devem incluir apenas viagens reais');
assert.ok(pidCatalog.candidates.every((pid) => pid.evidence !== 'CARSCANNER_SEED' && pid.observed_value === undefined), 'catálogo não deve conter valores importados como baseline');
assert.match(reportDocs, /TXT/i);
assert.match(reportDocs, /JSON/i);
assert.match(diary, /2026-10-15 — Evolução de persistência SQLite/);

console.log('sqlitePersistenceContract.test.js: OK — esquema, lockfile, filtros de dados reais, amostragem, migração JSON e exportação TXT.');
