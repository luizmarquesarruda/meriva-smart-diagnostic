'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/storage/historyBenchmark.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'app/armazenamento.tsx'), 'utf8');
const logger = fs.readFileSync(path.join(root, 'src/database/csvLogger.ts'), 'utf8');
const queuePolicyPath = path.join(root, 'src/database/csvQueuePolicy.ts');
const queuePolicyOutput = ts.transpileModule(fs.readFileSync(queuePolicyPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const queuePolicyModule = new Module(queuePolicyPath, null);
queuePolicyModule.filename = queuePolicyPath;
queuePolicyModule.paths = Module._nodeModulePaths(path.dirname(queuePolicyPath));
queuePolicyModule._compile(queuePolicyOutput, queuePolicyPath);
const { getCsvQueueAction, MAX_PENDING_CSV_ROWS, HARD_MAX_PENDING_CSV_ROWS, SPILL_CHUNK_ROWS } = queuePolicyModule.exports;
const migrations = fs.readFileSync(path.join(root, 'src/storage/historyIndexMigrations.ts'), 'utf8');
const tripStorage = fs.readFileSync(path.join(root, 'src/storage/driveCycleStorage.ts'), 'utf8');
const migrationPath = path.join(root, 'src/storage/historyIndexMigrations.ts');
const migrationOutput = ts.transpileModule(fs.readFileSync(migrationPath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const migrationModule = new Module(migrationPath, null);
migrationModule.filename = migrationPath;
migrationModule.paths = Module._nodeModulePaths(path.dirname(migrationPath));
migrationModule._compile(migrationOutput, migrationPath);
const { migrateHistoryIndexDocument } = migrationModule.exports;

assert.match(source, /BENCHMARK_ROUNDS\s*=\s*7/);
assert.match(source, /VIAGENS\/index\.json/);
assert.match(source, /\.history-benchmark-/);
assert.match(source, /writeAsStringAsync\(scratchPath/);
assert.match(source, /readAsStringAsync\(scratchPath/);
assert.match(source, /written !== raw/);
assert.match(source, /deleteAsync\(scratchPath/);
assert.match(source, /readAsStringAsync\(indexPath/);
assert.match(source, /migrateHistoryIndexDocument\(parsed\)/, 'benchmark must reject unsupported/future history schema');
assert.match(source, /readDriveCycles\(basePath\)/, 'benchmark must validate main history using the canonical reader');
assert.match(source, /cycles\.every\(\(cycle\) => isDriveCycle\(cycle\)\)/, 'benchmark must validate each trip record before counting it');
assert.match(source, /current !== raw/, 'benchmark must cancel if history contents change during measurement');
assert.match(source, /HISTORY_MEASUREMENT_DIRECTORY_UNAVAILABLE/, 'directory enumeration failures must not be reported as zero bytes');
assert.match(source, /readDirectoryAsync\(directory\)/, 'directory listing must be strict instead of swallowing I/O errors');
assert.doesNotMatch(source, /readDirectoryAsync\(directory\)\.catch\(\(\) => \[\]\)/);
assert.match(source, /scratchSequence/, 'benchmark scratch names must avoid overwriting a previous measurement file');
assert.match(source, /utf8ByteLength\(raw\)/, 'JSON size must be measured in UTF-8 bytes from the exact snapshot');
assert.match(source, /HISTORICO_MUDOU_DURANTE_LEITURA_INICIAL/, 'the initial file size must match the bytes read');
assert.match(source, /HISTORY_BENCHMARK_SCRATCH_NOT_REMOVED/, 'scratch cleanup failure must be visible');
assert.doesNotMatch(source, /deleteAsync\(scratchPath, \{ idempotent: true \}\)\.catch\(\(\) => undefined\)/,
  'benchmark must not silently leave measurement files behind');


assert.doesNotMatch(source, /writeAsStringAsync\(indexPath/);
assert.match(source, /uniqueTripIds/);
assert.match(source, /telemetrySamples/);
assert.match(screen, /MEDIR TAMANHO E LATÊNCIA JSON/);
assert.match(screen, /measureHistoryStorage\(/);
assert.match(screen, /autoTripService\.withPollingPaused/, 'benchmark must wait for the active OBD polling cycle before measuring history');
assert.match(logger, /getCsvQueueStatus/);
assert.equal(MAX_PENDING_CSV_ROWS, 10_000);
assert.equal(HARD_MAX_PENDING_CSV_ROWS, 20_000);
assert.equal(SPILL_CHUNK_ROWS, 128);
assert.match(migrations, /CURRENT_HISTORY_SCHEMA_VERSION\s*=\s*2/);
assert.match(migrations, /1:\s*\(document\)/);
assert.match(migrations, /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);
assert.match(tripStorage, /migrateHistoryIndexDocument\(parsed\)/);
assert.match(tripStorage, /schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION/);
assert.match(tripStorage, /CURRENT_HISTORY_SCHEMA_VERSION/);
assert.match(tripStorage, /schemaVersion as number/);
assert.match(tripStorage, /verified\.totalCount !== data\.cycles\.length/);
assert.match(source, /tripDirectoryBytes/);
const legacyIndex = { version: '1.0', totalCount: 99, customMetadata: 'preserve', cycles: [{ id: 'trip-1', telemetrySamples: [{ timestamp: '2026-01-01T00:00:00.000Z' }] }] };
const migrated = migrateHistoryIndexDocument(legacyIndex);
assert.equal(migrated.migrated, true);
assert.equal(migrated.document.schemaVersion, 2);
assert.equal(migrated.document.totalCount, 1);
assert.equal(migrated.document.customMetadata, 'preserve');
assert.equal(migrated.document.cycles[0].id, 'trip-1');
assert.equal(migrateHistoryIndexDocument(migrated.document).migrated, false);
assert.throws(() => migrateHistoryIndexDocument({ schemaVersion: 3, cycles: [] }), /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);
assert.match(logger, /peakObservedPendingRows/);
assert.match(logger, /maxFlushDurationMs/);
assert.match(logger, /flushFailures/);

// Stress the policy with 50,000 arrivals while durable spool is available.
let pending = 0;
let spooled = 0;
let dropped = 0;
for (let index = 0; index < 50_000; index += 1) {
  const action = getCsvQueueAction(pending);
  if (action === 'drop') { dropped += 1; continue; }
  pending += 1;
  if (getCsvQueueAction(pending) === 'spill') { spooled += pending; pending = 0; }
  assert.ok(pending <= HARD_MAX_PENDING_CSV_ROWS, 'pending queue exceeded hard cap');
}
assert.equal(spooled + pending + dropped, 50_000);
assert.equal(dropped, 0, 'successful spool must avoid dropping stress-test rows');
assert.ok(spooled > 0, 'stress run must exercise durable spool threshold');
assert.equal(getCsvQueueAction(HARD_MAX_PENDING_CSV_ROWS), 'drop');

console.log('historyBenchmark.test.js: OK');
