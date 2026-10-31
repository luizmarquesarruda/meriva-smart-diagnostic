import * as FileSystem from 'expo-file-system';

export interface HistoryStorageMeasurement {
  measuredAt: string;
  platform: string;
  androidApi: string | number;
  trips: number;
  telemetrySamples: number;
  uniqueTripIds: number;
  jsonBytes: number;
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
  let bytes = 0;
  let files = 0;
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => []);
  for (const name of names) {
    const path = directory.replace(/\/$/, '') + '/' + name;
    const info = await FileSystem.getInfoAsync(path, { size: true }).catch(() => null);
    if (!info?.exists) continue;
    if (info.isDirectory) {
      const nested = await measureDirectory(path, predicate);
      bytes += nested.bytes;
      files += nested.files;
    } else if (predicate(path)) {
      bytes += typeof info.size === 'number' ? info.size : 0;
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
  const parsed = JSON.parse(raw) as { cycles?: unknown };
  if (!Array.isArray(parsed.cycles)) {
    throw new Error('INDICE_DE_VIAGENS_INVALIDO; MEDICAO_CANCELADA');
  }

  const cycles = parsed.cycles as Array<{ id?: unknown; telemetrySamples?: unknown }>;
  const ids = cycles.map((cycle) => cycle.id).filter((id): id is string => typeof id === 'string');
  const uniqueTripIds = new Set(ids).size;
  const telemetrySamples = cycles.reduce((total, cycle) =>
    total + (Array.isArray(cycle.telemetrySamples) ? cycle.telemetrySamples.length : 0), 0);

  const readTimes: number[] = [];
  const writeReadbackTimes: number[] = [];
  const scratchPath = basePath.replace(/\/$/, '') + '/.history-benchmark-' + Date.now() + '.tmp';
  let integrity: 'OK' | 'FAILED' = 'OK';
  try {
    for (let index = 0; index < BENCHMARK_ROUNDS; index += 1) {
      const readStartedAt = Date.now();
      const current = await FileSystem.readAsStringAsync(indexPath);
      const currentParsed = JSON.parse(current) as { cycles?: unknown };
      if (!Array.isArray(currentParsed.cycles) || currentParsed.cycles.length !== cycles.length) {
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
