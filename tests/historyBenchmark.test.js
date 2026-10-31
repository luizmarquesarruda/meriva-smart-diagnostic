'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/storage/historyBenchmark.ts'), 'utf8');
const screen = fs.readFileSync(path.join(root, 'app/armazenamento.tsx'), 'utf8');
const logger = fs.readFileSync(path.join(root, 'src/database/csvLogger.ts'), 'utf8');
const migrations = fs.readFileSync(path.join(root, 'src/storage/historyIndexMigrations.ts'), 'utf8');
const tripStorage = fs.readFileSync(path.join(root, 'src/storage/driveCycleStorage.ts'), 'utf8');

assert.match(source, /BENCHMARK_ROUNDS\s*=\s*7/);
assert.match(source, /VIAGENS\/index\.json/);
assert.match(source, /\.history-benchmark-/);
assert.match(source, /writeAsStringAsync\(scratchPath/);
assert.match(source, /readAsStringAsync\(scratchPath/);
assert.match(source, /written !== raw/);
assert.match(source, /deleteAsync\(scratchPath/);
assert.match(source, /readAsStringAsync\(indexPath/);
assert.doesNotMatch(source, /writeAsStringAsync\(indexPath/);
assert.match(source, /uniqueTripIds/);
assert.match(source, /telemetrySamples/);
assert.match(screen, /MEDIR TAMANHO E LATÊNCIA JSON/);
assert.match(screen, /measureHistoryStorage\(/);
assert.match(logger, /MAX_PENDING_CSV_ROWS\s*=\s*10_000/);
assert.match(logger, /HARD_MAX_PENDING_CSV_ROWS\s*=\s*20_000/);
assert.match(logger, /SPILL_CHUNK_ROWS\s*=\s*128/);
assert.match(logger, /getCsvQueueStatus/);
assert.match(migrations, /CURRENT_HISTORY_SCHEMA_VERSION\s*=\s*2/);
assert.match(migrations, /1:\s*\(document\)/);
assert.match(migrations, /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);
assert.match(tripStorage, /migrateHistoryIndexDocument\(parsed\)/);
assert.match(tripStorage, /schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION/);
assert.match(tripStorage, /HISTORY_SCHEMA_VERSION_NEWER_THAN_APP/);

console.log('historyBenchmark.test.js: OK');
