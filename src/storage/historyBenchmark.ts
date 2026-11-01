import * as FileSystem from 'expo-file-system';
import { Platform } from 'react-native';
import { CURRENT_HISTORY_SCHEMA_VERSION, migrateHistoryIndexDocument } from './historyIndexMigrations';

export interface BenchmarkPercentiles {
  median: number;
  p95: number;
  min: number;
}

export interface HistoryBenchmarkThresholds {
  historyReadParseP95Ms: number;
  scratchWriteReadbackP95Ms: number;
  restoreDryRunP95Ms: number;
  screenOpenP95Ms: number;
  processMemoryIncreaseMb: number;
  sqliteLatencyGainPercent: number;
}

export interface HistoryStorageMeasurement {
  measuredAt: string;
  platform: string;
  androidApi: string | number;
  trips: number;
  uniqueTripIds: number;
  duplicateTripIds: number;
  telemetrySamples: number;
  jsonBytes: number;
  tripDirectoryBytes: number;
  csvBytes: number;
  historyFiles: number;
  readParseMs: BenchmarkPercentiles;
  scratchWriteReadbackMs: BenchmarkPercentiles;
  restoreDryRunMs: BenchmarkPercentiles;
  processMemoryMb: null;
  thresholds: HistoryBenchmarkThresholds;
  integrity: 'OK' | 'FAILED';
  notes: string[];
}

export interface HistoryBenchmarkExportResult {
  ok: boolean;
  fileName?: string;
  reason?: 'CANCELADO' | 'ERRO' | 'INDISPONIVEL';
  message?: string;
}

export const HISTORY_BENCHMARK_ROUNDS = 7;
export const HISTORY_BENCHMARK_THRESHOLDS: HistoryBenchmarkThresholds = {
  historyReadParseP95Ms: 250,
  scratchWriteReadbackP95Ms: 500,
  restoreDryRunP95Ms: 500,
  screenOpenP95Ms: 1000,
  processMemoryIncreaseMb: 20,
  sqliteLatencyGainPercent: 30,
};

function percentile(values: number[], ratio: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * ratio) - 1)] ?? 0;
}

function summarize(values: number[]): BenchmarkPercentiles {
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
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) return { bytes: 0, files: 0 };
  if (!info.isDirectory) throw new Error('CAMINHO_DE_MEDICAO_NAO_E_DIRETORIO: ' + directory);

  let bytes = 0;
  let files = 0;
  const names = await FileSystem.readDirectoryAsync(directory);
  for (const name of names) {
    const path = directory.replace(/\/$/, '') + '/' + name;
    const child = await FileSystem.getInfoAsync(path, { size: true });
    if (!child.exists) throw new Error('ARQUIVO_MUDOU_DURANTE_MEDICAO: ' + path);
    if (child.isDirectory) {
      const nested = await measureDirectory(path, predicate);
      bytes += nested.bytes;
      files += nested.files;
    } else if (predicate(path)) {
      if (typeof child.size !== 'number' || !Number.isFinite(child.size) || child.size < 0) {
        throw new Error('TAMANHO_INDISPONIVEL_DURANTE_MEDICAO: ' + path);
      }
      bytes += child.size;
      files += 1;
    }
  }
  return { bytes, files };
}

/**
 * Mede somente cópias temporárias. O índice principal e sua cópia anterior
 * são estritamente somente leitura durante todo o benchmark.
 */
export async function measureHistoryStorage(
  basePath: string,
  platform: string,
  androidApi: string | number,
): Promise<HistoryStorageMeasurement> {
  const root = basePath.replace(/\/$/, '');
  const indexPath = root + '/VIAGENS/index.json';
  const info = await FileSystem.getInfoAsync(indexPath, { size: true });
  if (!info.exists || info.isDirectory) throw new Error('HISTORICO_JSON_NAO_ENCONTRADO');
  if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
    throw new Error('TAMANHO_DO_INDICE_INDISPONIVEL');
  }

  const raw = await FileSystem.readAsStringAsync(indexPath, { encoding: FileSystem.EncodingType.UTF8 });
  const migrated = migrateHistoryIndexDocument(JSON.parse(raw));
  const cycles = migrated.document.cycles;
  if (!Array.isArray(cycles)) throw new Error('INDICE_DE_VIAGENS_INVALIDO; MEDICAO_CANCELADA');

  const validTrip = (cycle: unknown): cycle is { id: string; telemetrySamples?: unknown } => {
    if (typeof cycle !== 'object' || cycle === null || Array.isArray(cycle)) return false;
    const item = cycle as Record<string, unknown>;
    const validDate = (value: unknown): boolean =>
      typeof value === 'string' && Number.isFinite(Date.parse(value));
    const finiteNonNegative = (value: unknown): boolean =>
      typeof value === 'number' && Number.isFinite(value) && value >= 0;
    return typeof item.id === 'string' && item.id.length > 0 &&
      validDate(item.startedAt) && validDate(item.finishedAt) &&
      finiteNonNegative(item.distanceTotalKm) &&
      finiteNonNegative(item.distanceIceKm) &&
      finiteNonNegative(item.fuelUsedL) &&
      finiteNonNegative(item.avgDrivingSpeedKmh) &&
      finiteNonNegative(item.avgFuelConsumptionKml) &&
      ['REAL_OBD', 'SIMULACAO', 'CARSCANNER_SEED'].includes(String(item.source)) &&
      (item.telemetrySamples === undefined || Array.isArray(item.telemetrySamples));
  };
  if (!cycles.every(validTrip)) {
    throw new Error('HISTORICO_CONTEM_VIAGEM_INVALIDA; MEDICAO_CANCELADA');
  }

  const ids = cycles.map((cycle) => cycle.id);
  const uniqueTripIds = new Set(ids).size;
  const telemetrySamples = cycles.reduce((total, cycle) => {
    const samples = typeof cycle === 'object' && cycle !== null
      ? (cycle as { telemetrySamples?: unknown }).telemetrySamples
      : null;
    return total + (Array.isArray(samples) ? samples.length : 0);
  }, 0);

  const readTimes: number[] = [];
  const writeReadbackTimes: number[] = [];
  const restoreTimes: number[] = [];
  const stamp = Date.now() + '-' + Math.random().toString(16).slice(2);
  const writeScratch = root + '/.history-benchmark-write-' + stamp + '.tmp';
  const restoreScratchPaths: string[] = [];
  let integrity: 'OK' | 'FAILED' = 'OK';

  try {
    for (let index = 0; index < HISTORY_BENCHMARK_ROUNDS; index += 1) {
      const readStarted = Date.now();
      const current = await FileSystem.readAsStringAsync(indexPath, { encoding: FileSystem.EncodingType.UTF8 });
      const currentDocument = migrateHistoryIndexDocument(JSON.parse(current)).document;
      if (!Array.isArray(currentDocument.cycles) ||
          currentDocument.cycles.length !== cycles.length) {
        throw new Error('HISTORICO_MUDOU_DURANTE_MEDICAO');
      }
      readTimes.push(Date.now() - readStarted);

      const writeStarted = Date.now();
      await FileSystem.writeAsStringAsync(writeScratch, raw, { encoding: FileSystem.EncodingType.UTF8 });
      const written = await FileSystem.readAsStringAsync(writeScratch, { encoding: FileSystem.EncodingType.UTF8 });
      if (written !== raw) {
        integrity = 'FAILED';
        throw new Error('JSON_SCRATCH_READBACK_DIVERGENTE');
      }
      writeReadbackTimes.push(Date.now() - writeStarted);

      const restoreStarted = Date.now();
      const restoreScratch = root + '/.history-benchmark-restore-' + stamp + '-' + index + '.tmp';
      restoreScratchPaths.push(restoreScratch);
      await FileSystem.copyAsync({ from: writeScratch, to: restoreScratch });
      const restored = await FileSystem.readAsStringAsync(restoreScratch, { encoding: FileSystem.EncodingType.UTF8 });
      if (restored !== raw) {
        integrity = 'FAILED';
        throw new Error('RESTORE_DRY_RUN_DIVERGENTE');
      }
      restoreTimes.push(Date.now() - restoreStarted);
    }
  } finally {
    await FileSystem.deleteAsync(writeScratch, { idempotent: true }).catch(() => undefined);
    await Promise.all(restoreScratchPaths.map((path) =>
      FileSystem.deleteAsync(path, { idempotent: true }).catch(() => undefined),
    ));
  }

  const csv = await measureDirectory(root, (path) => path.toLowerCase().endsWith('.csv'));
  const tripDirectory = await measureDirectory(root + '/VIAGENS', () => true);

  return {
    measuredAt: new Date().toISOString(),
    platform,
    androidApi,
    trips: cycles.length,
    uniqueTripIds,
    duplicateTripIds: Math.max(0, ids.length - uniqueTripIds),
    telemetrySamples,
    jsonBytes: info.size,
    tripDirectoryBytes: tripDirectory.bytes,
    csvBytes: csv.bytes,
    historyFiles: tripDirectory.files,
    readParseMs: summarize(readTimes),
    scratchWriteReadbackMs: summarize(writeReadbackTimes),
    restoreDryRunMs: summarize(restoreTimes),
    processMemoryMb: null,
    thresholds: HISTORY_BENCHMARK_THRESHOLDS,
    integrity,
    notes: [
      'Medição executada no armazenamento local do aparelho.',
      'O índice de viagens e a cópia anterior foram lidos; nenhuma das duas fontes foi gravada ou apagada.',
      'Leitura e parse, escrita temporária/read-back e cópia temporária de restauração foram medidos em sete rodadas.',
      'A memória do processo não é exposta de forma confiável pela API JavaScript do Expo; medir no aparelho com: adb shell dumpsys meminfo <pacote>.',
      'O tempo de abertura da tela deve ser medido separadamente, em perfil de produção, com o mesmo conjunto de viagens.',
      'SQLite não foi medido nesta execução. Não migrar sem comparar a mesma carga, incluindo restauração e integridade.',
    ],
  };
}

export function formatHistoryBenchmarkReport(result: HistoryStorageMeasurement): string {
  const lines = [
    'MERIVA SMART DIAGNOSTIC',
    'RELATÓRIO DE MEDIÇÃO DO HISTÓRICO',
    'MEDIDO EM: ' + result.measuredAt,
    'PLATAFORMA: ' + result.platform + ' | API ANDROID: ' + result.androidApi,
    'INTEGRIDADE: ' + result.integrity,
    '',
    '[VOLUME]',
    'VIAGENS: ' + result.trips,
    'IDs ÚNICOS: ' + result.uniqueTripIds,
    'IDs DUPLICADOS: ' + result.duplicateTripIds,
    'AMOSTRAS DE TELEMETRIA: ' + result.telemetrySamples,
    'ÍNDICE JSON: ' + result.jsonBytes + ' bytes',
    'DIRETÓRIO VIAGENS: ' + result.tripDirectoryBytes + ' bytes',
    'ARQUIVOS CSV: ' + result.csvBytes + ' bytes',
    'ARQUIVOS NO DIRETÓRIO VIAGENS: ' + result.historyFiles,
    '',
    '[LATÊNCIA - MILISSEGUNDOS]',
    'LEITURA + PARSE | MEDIANA: ' + result.readParseMs.median + ' | P95: ' + result.readParseMs.p95 + ' | MÍNIMO: ' + result.readParseMs.min,
    'ESCRITA TEMPORÁRIA + READ-BACK | MEDIANA: ' + result.scratchWriteReadbackMs.median + ' | P95: ' + result.scratchWriteReadbackMs.p95 + ' | MÍNIMO: ' + result.scratchWriteReadbackMs.min,
    'CÓPIA DE RESTAURAÇÃO EM TESTE | MEDIANA: ' + result.restoreDryRunMs.median + ' | P95: ' + result.restoreDryRunMs.p95 + ' | MÍNIMO: ' + result.restoreDryRunMs.min,
    'MEMÓRIA DO PROCESSO: N/D (medir externamente com ADB)',
    '',
    '[LIMIARES PARA INVESTIGAR SQLITE - NÃO SÃO RESULTADOS]',
    'LEITURA + PARSE P95: ' + result.thresholds.historyReadParseP95Ms + ' ms',
    'ESCRITA + READ-BACK P95: ' + result.thresholds.scratchWriteReadbackP95Ms + ' ms',
    'RESTAURAÇÃO EM TESTE P95: ' + result.thresholds.restoreDryRunP95Ms + ' ms',
    'ABERTURA DA TELA VIAGENS P95: ' + result.thresholds.screenOpenP95Ms + ' ms',
    'AUMENTO DE MEMÓRIA: ' + result.thresholds.processMemoryIncreaseMb + ' MB',
    'GANHO DE LATÊNCIA MÍNIMO ESPERADO DO SQLITE: ' + result.thresholds.sqliteLatencyGainPercent + '%',
    '',
    '[OBSERVAÇÕES]',
    ...result.notes.map((note) => '- ' + note),
    '',
    'RESULTADO NÃO EQUIVALE A ENSAIO FÍSICO NEM A COMPARAÇÃO JSON/SQLITE.',
  ];
  return lines.join('\n') + '\n';
}

export async function exportHistoryBenchmarkTxt(
  result: HistoryStorageMeasurement,
): Promise<HistoryBenchmarkExportResult> {
  if (Platform.OS !== 'android' || !FileSystem.StorageAccessFramework) {
    return { ok: false, reason: 'INDISPONIVEL', message: 'EXPORTAÇÃO TXT DISPONÍVEL SOMENTE NO ANDROID.' };
  }
  try {
    const permissions = await FileSystem.StorageAccessFramework.requestDirectoryPermissionsAsync();
    if (!permissions.granted) return { ok: false, reason: 'CANCELADO' };
    const stamp = result.measuredAt.replace(/[:.]/g, '-');
    const fileName = 'meriva_smart_history_benchmark_' + stamp + '.txt';
    const uri = await FileSystem.StorageAccessFramework.createFileAsync(
      permissions.directoryUri,
      fileName,
      'text/plain',
    );
    await FileSystem.writeAsStringAsync(uri, formatHistoryBenchmarkReport(result), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return { ok: true, fileName };
  } catch (cause) {
    return {
      ok: false,
      reason: 'ERRO',
      message: cause instanceof Error ? cause.message : 'ERRO DESCONHECIDO AO EXPORTAR O RELATÓRIO.',
    };
  }
}
