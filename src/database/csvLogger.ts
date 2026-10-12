import * as FileSystem from 'expo-file-system';
import { AppState } from 'react-native';

export type CsvValue = string | number | boolean | null | undefined;

export interface CsvRow {
  [key: string]: CsvValue;
  timestamp?: string;
  pid?: string;
  nome?: string;
  valor?: string | number | null;
  unidade?: string;
  rpm?: number | string | null;
  temperatura?: number | string | null;
  velocidade?: number | string | null;
  condicao?: string;
  maxSpeed?: number | string | null;
  telemetrySamples?: number | string | null;
}

const fileQueues = new Map<string, Promise<void>>();
const pendingRows = new Map<string, CsvRow[]>();
const BATCH_FLUSH_INTERVAL_MS = 1000;
const BATCH_FLUSH_ROW_LIMIT = 8;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return asString.includes(',') || asString.includes('"') || asString.includes('\n')
    ? `"${asString.replace(/"/g, '""')}"`
    : asString;
}

function serializeRow(row: CsvRow): string {
  return Object.keys(row).map((key) => formatCsvValue(row[key])).join(',');
}

async function enqueueFileOperation(filePath: string, operation: () => Promise<void>): Promise<void> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  fileQueues.set(filePath, current);
  try {
    await current;
  } finally {
    if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
  }
}

async function writeRowsUnsafe(filePath: string, rows: CsvRow[]): Promise<void> {
  if (!rows.length) return;
  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const info = await FileSystem.getInfoAsync(filePath);
  const lines = rows.map(serializeRow);
  if (!info.exists) {
    const header = Object.keys(rows[0]).join(',');
    await FileSystem.writeAsStringAsync(filePath, `${header}\n${lines.join('\n')}\n`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  }

  const current = await FileSystem.readAsStringAsync(filePath);
  const trimmed = current.trim();
  // One read/write per batch instead of one full-file rewrite per sensor sample.
  const content = trimmed.length > 0
    ? `${trimmed}\n${lines.join('\n')}\n`
    : `${Object.keys(rows[0]).join(',')}\n${lines.join('\n')}\n`;
  await FileSystem.writeAsStringAsync(filePath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

function scheduleBatchFlush(): void {
  if (flushTimer) return;
  flushTimer = setTimeout(() => {
    flushTimer = null;
    void flushCsvLogs().catch((cause) => {
      console.warn('[csv] falha ao descarregar lote de telemetria:', cause instanceof Error ? cause.message : cause);
      scheduleBatchFlush();
    });
  }, BATCH_FLUSH_INTERVAL_MS);
}

export function queueCsvRow(filePath: string, row: CsvRow): void {
  const queue = pendingRows.get(filePath) ?? [];
  queue.push({ ...row });
  pendingRows.set(filePath, queue);

  let totalPending = 0;
  for (const rows of pendingRows.values()) totalPending += rows.length;
  if (totalPending >= BATCH_FLUSH_ROW_LIMIT) {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void flushCsvLogs().catch((cause) => {
      console.warn('[csv] falha ao descarregar lote de telemetria:', cause instanceof Error ? cause.message : cause);
      scheduleBatchFlush();
    });
    return;
  }
  scheduleBatchFlush();
}

/**
 * Writes all queued telemetry rows. Call before export, on disconnect and when
 * the app enters background. Failed rows are restored ahead of newer rows.
 */
export async function flushCsvLogs(): Promise<void> {
  if (flushPromise) {
    await flushPromise;
    if (pendingRows.size > 0) return flushCsvLogs();
    return;
  }
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (pendingRows.size === 0) return;

  const batch = new Map(pendingRows);
  pendingRows.clear();
  flushPromise = (async () => {
    const entries = Array.from(batch.entries());
    for (let index = 0; index < entries.length; index += 1) {
      const [filePath, rows] = entries[index];
      try {
        await enqueueFileOperation(filePath, () => writeRowsUnsafe(filePath, rows));
      } catch (cause) {
        // Restore this and remaining files; already-written batches are not retried.
        for (let pendingIndex = index; pendingIndex < entries.length; pendingIndex += 1) {
          const [restorePath, restoreRows] = entries[pendingIndex];
          const newerRows = pendingRows.get(restorePath) ?? [];
          pendingRows.set(restorePath, [...restoreRows, ...newerRows]);
        }
        throw cause;
      }
    }
  })();

  try {
    await flushPromise;
  } finally {
    flushPromise = null;
  }
  if (pendingRows.size > 0) scheduleBatchFlush();
}

/** Compatibility path for non-live records, including finalized drive cycles. */
export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  await enqueueFileOperation(filePath, () => writeRowsUnsafe(filePath, [row]));
}

AppState.addEventListener('change', (state) => {
  if (state === 'background' || state === 'inactive') {
    void flushCsvLogs().catch((cause) => {
      console.warn('[csv] falha ao descarregar telemetria ao sair do primeiro plano:', cause instanceof Error ? cause.message : cause);
    });
  }
});
