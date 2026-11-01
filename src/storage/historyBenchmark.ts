import * as FileSystem from 'expo-file-system';
import { migrateHistoryIndexDocument } from './historyIndexMigrations';
import { readDriveCycles } from './driveCycleStorage';

export interface HistoryStorageMeasurement {
  measuredAt: string;
  platform: string;
  androidApi: string | number;
  trips: number;
  telemetrySamples: number;
  uniqueTripIds: number;
  jsonBytes: number;
  tripDirectoryBytes: number;
  csvBytes: number;
  historyFiles: number;
  readParseMs: { median: number; p95: number; min: number };
  scratchWriteReadbackMs: { median: number; p95: number; min: number };
  integrity: 'OK' | 'FAILED';
  notes: string[];
}

const BENCHMARK_ROUNDS = 7;

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function summarize(values: number[]) {
  return {
    median: percentile(values, 0.5),
    p95: percentile(values, 0.95),
    min: Math.min(...values),
  };
}

async function measureDirectory(
  directory: string,
  predicate: (path: string) => boolean,
): Promise<{ bytes: number; files: number }> {
  const directoryInfo = await FileSystem.getInfoAsync(directory);
  if (!directoryInfo.exists || !directoryInfo.isDirectory) {
    throw new Error('HISTORY_MEASUREMENT_DIRECTORY_UNAVAILABLE: ' + directory);
  }

  let bytes = 0;
  let files = 0;
  // An unreadable directory must fail the measurement. Treating it as empty
  // creates deceptively small storage totals and can corrupt a SQLite decision.
  const names = await FileSystem.readDirectoryAsync(directory);
  for (const name of names) {
    const path = directory.replace(/\/$/, '') + '/' + name;
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (!info.exists) throw new Error('HISTORY_MEASUREMENT_ENTRY_DISAPPEARED: ' + path);
    if (info.isDirectory) {
      const nested = await measureDirectory(path, predicate);
      bytes += nested.bytes;
      files += nested.files;
    } else if (predicate(path)) {
      if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
        throw new Error('HISTORY_MEASUREMENT_SIZE_UNAVAILABLE: ' + path);
      }
      bytes += info.size;
      files += 1;
    }
  }
  return { bytes, files };
}

/**
 * Measures the real JSON history on the running device. All writes target a
 * unique scratch file; VIAGENS/index.json and its recovery copy are read-only.
 */
export async function measureHistoryStorage(
  basePath: string,
  platform: string,
  androidApi: string | number,
): Promise<HistoryStorageMeasurement> {
  const indexPath = basePath.replace(/\/$/, '') + '/VIAGENS/index.json';
  const info = await FileSystem.getInfoAsync(indexPath, { size: true });
  if (!info.exists || info.isDirectory) {
    throw new Error('HISTORICO_JSON_NAO_ENCONTRADO');
  }

  const raw = await FileSystem.readAsStringAsync(indexPath);
  let parsed: { cycles?: unknown; schemaVersion?: unknown };
  try {
    parsed = JSON.parse(raw) as { cycles?: unknown; schemaVersion?: unknown };
    const migration = migrateHistoryIndexDocument(parsed);
    parsed = migration.document;
  } catch (cause) {
    throw new Error('INDICE_DE_VIAGENS_INVALIDO_OU_SCHEMA_NAO_SUPORTADO; MEDICAO_CANCELADA: '
      + (cause instanceof Error ? cause.message : String(cause)));
  }
  if (!Array.isArray(parsed.cycles)) {
    throw new Error('INDICE_DE_VIAGENS_INVALIDO; MEDICAO_CANCELADA');
  }

  const cycles = parsed.cycles as Array<{ id?: unknown; telemetrySamples?: unknown }>;
  if (cycles.some((cycle) => !cycle || typeof cycle !== 'object' || Array.isArray(cycle)
    || typeof cycle.id !== 'string' || !cycle.id.trim())) {
    throw new Error('INDICE_DE_VIAGENS_CONTEM_VIAGEM_INVALIDA; MEDICAO_CANCELADA');
  }
  const ids = cycles.map((cycle) => cycle.id as string);
  const uniqueTripIds = new Set(ids).size;
  const validatedCycles = await readDriveCycles(basePath);
  if (validatedCycles.length !== uniqueTripIds) {
    throw new Error('INDICE_E_LEITURA_VALIDADA_DIVERGEM; MEDICAO_CANCELADA');
  }
  const telemetrySamples = cycles.reduce((total, cycle) =>
    total + (Array.isArray(cycle.telemetrySamples) ? cycle.telemetrySamples.length : 0), 0);

  const readTimes: number[] = [];
  const writeReadbackTimes: number[] = [];
  let scratchSequence = 0;
  let scratchPath = '';
  do {
    scratchSequence += 1;
    scratchPath = basePath.replace(/\/$/, '') + '/.history-benchmark-' + Date.now() + '-' + scratchSequence + '.tmp';
  } while ((await FileSystem.getInfoAsync(scratchPath)).exists);
  let integrity: 'OK' | 'FAILED' = 'OK';
  try {
    for (let index = 0; index < BENCHMARK_ROUNDS; index += 1) {
      const readStartedAt = Date.now();
      const current = await FileSystem.readAsStringAsync(indexPath);
      const currentParsed = JSON.parse(current) as { cycles?: unknown };
      if (current !== raw || !Array.isArray(currentParsed.cycles)
        || currentParsed.cycles.length !== cycles.length) {
        throw new Error('HISTORICO_MUDOU_DURANTE_MEDICAO');
      }
      readTimes.push(Date.now() - readStartedAt);

      const writeStartedAt = Date.now();
      await FileSystem.writeAsStringAsync(scratchPath, raw, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const written = await FileSystem.readAsStringAsync(scratchPath);
      if (written !== raw) {
        integrity = 'FAILED';
        throw new Error('JSON_SCRATCH_READBACK_DIVERGENTE');
      }
      writeReadbackTimes.push(Date.now() - writeStartedAt);
    }
  } finally {
    await FileSystem.deleteAsync(scratchPath, { idempotent: true }).catch(() => undefined);
  }

  const csv = await measureDirectory(basePath, (path) => path.toLowerCase().endsWith('.csv'));
  const tripsDirectory = basePath.replace(/\/$/, '') + '/VIAGENS';
  const tripFiles = await measureDirectory(tripsDirectory, () => true);

  return {
    measuredAt: new Date().toISOString(),
    platform,
    androidApi,
    trips: cycles.length,
    telemetrySamples,
    uniqueTripIds,
    jsonBytes: typeof info.size === 'number' ? info.size : raw.length,
    tripDirectoryBytes: tripFiles.bytes,
    csvBytes: csv.bytes,
    historyFiles: tripFiles.files,
    readParseMs: summarize(readTimes),
    scratchWriteReadbackMs: summarize(writeReadbackTimes),
    integrity,
    notes: [
      'Medição executada no dispositivo que está rodando o app.',
      'Gravação medida em arquivo temporário; o histórico real não foi alterado.',
      'Latências incluem a API Expo FileSystem e parse JSON; granularidade do relógio é milissegundos.',
      'SQLite ainda não foi comparado nesta execução; não interpretar estes números como justificativa para migrar.',
    ],
  };
}
