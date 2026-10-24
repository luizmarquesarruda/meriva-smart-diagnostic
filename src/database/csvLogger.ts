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
const MAX_PENDING_CSV_ROWS = 10_000;
let droppedPendingRows = 0;
let flushTimer: ReturnType<typeof setTimeout> | null = null;
let flushPromise: Promise<void> | null = null;

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return asString.includes(',') || asString.includes('"') || asString.includes('\n')
    ? `"${asString.replace(/"/g, '""')}"`
    : asString;
}

function serializeRow(row: CsvRow, headers: string[] = Object.keys(row)): string {
  const unknownKeys = Object.keys(row).filter((key) => !headers.includes(key));
  if (unknownKeys.length) {
    throw new Error('CSV_SCHEMA_MISMATCH: colunas novas não podem ser gravadas sob cabeçalho antigo: ' + unknownKeys.join(','));
  }
  return headers.map((key) => formatCsvValue(row[key])).join(',');
}

export function getCsvQueueStatus(): { pendingRows: number; droppedRows: number; maxPendingRows: number } {
  let pendingRows = 0;
  for (const rows of pendingRowsMapValues()) pendingRows += rows.length;
  return { pendingRows, droppedRows: droppedPendingRows, maxPendingRows: MAX_PENDING_CSV_ROWS };
}

function* pendingRowsMapValues(): IterableIterator<CsvRow[]> {
  yield* pendingRows.values();
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
  if (!info.exists) {
    const headers = Object.keys(rows[0]);
    const lines = rows.map((row) => serializeRow(row, headers));
    const header = headers.join(',');
    await FileSystem.writeAsStringAsync(filePath, `${header}\n${lines.join('\n')}\n`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  }

  const current = await FileSystem.readAsStringAsync(filePath);
  const trimmed = current.trimEnd();
  const headers = (trimmed.split(/\r?\n/, 1)[0] ?? '').split(',');
  if (!headers.length || headers.some((header) => !header)) {
    throw new Error('CSV_HEADER_INVALIDO: ' + filePath);
  }
  // Stable header mapping prevents a later object with a different insertion
  // order from silently writing values into the wrong CSV columns.
  const lines = rows.map((row) => serializeRow(row, headers));
  // One read/write per batch instead of one full-file rewrite per sensor sample.
  const content = trimmed.length > 0
    ? `${trimmed}\n${lines.join('\n')}\n`
    : `${headers.join(',')}\n${lines.join('\n')}\n`;
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
  let totalPending = 0;
  for (const rows of pendingRows.values()) totalPending += rows.length;
  if (totalPending >= MAX_PENDING_CSV_ROWS) {
    droppedPendingRows += 1;
    if (droppedPendingRows === 1 || droppedPendingRows % 100 === 0) {
      console.warn(`[csv] fila limitada a ${MAX_PENDING_CSV_ROWS}; registros entrantes descartados: ${droppedPendingRows}`);
    }
    return;
  }

  const queue = pendingRows.get(filePath) ?? [];
  queue.push({ ...row });
  pendingRows.set(filePath, queue);
  totalPending += 1;
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
  } catch (cause) {
    // Keep retrying after export/disconnect-triggered flushes too, not only
    // after the timer-driven flush path. Rows were restored to pendingRows.
    if (pendingRows.size > 0) scheduleBatchFlush();
    throw cause;
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
