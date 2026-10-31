import * as FileSystem from 'expo-file-system';
import { AppState } from 'react-native';
import { BATCH_FLUSH_ROW_LIMIT, HARD_MAX_PENDING_CSV_ROWS, MAX_PENDING_CSV_ROWS, SPILL_CHUNK_ROWS, getCsvQueueAction } from './csvQueuePolicy';

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
export const MAX_CSV_SEGMENT_BYTES = 512 * 1024;
let droppedPendingRows = 0;
let durablySpooledRows = 0;
let peakObservedPendingRows = 0;
let totalFlushes = 0;
let lastFlushDurationMs = 0;
let maxFlushDurationMs = 0;
let flushFailures = 0;
let spillSequence = 0;
let spillPromise: Promise<void> | null = null;
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
  return headers.map((key) => formatCsvValue(row[key])).join(',');
}

function parseCsvRecords(content: string): string[][] {
  const records: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let index = 0; index < content.length; index += 1) {
    const character = content[index];
    if (inQuotes) {
      if (character === '"' && content[index + 1] === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        inQuotes = false;
      } else {
        field += character;
      }
      continue;
    }
    if (character === '"' && field.length === 0) {
      inQuotes = true;
    } else if (character === ',') {
      row.push(field);
      field = '';
    } else if (character === '\n') {
      row.push(field.replace(/\r$/, ''));
      if (row.some((value) => value.length > 0)) records.push(row);
      row = [];
      field = '';
    } else {
      field += character;
    }
  }
  if (inQuotes) throw new Error('CSV_PARSE_FAILED: aspas não fechadas no arquivo existente');
  if (field.length > 0 || row.length > 0) {
    row.push(field.replace(/\r$/, ''));
    if (row.some((value) => value.length > 0)) records.push(row);
  }
  return records;
}

function countPendingRows(): number {
  let total = 0;
  for (const rows of pendingRows.values()) total += rows.length;
  return total;
}

export function getCsvQueueStatus(): {
  pendingRows: number;
  droppedRows: number;
  maxPendingRows: number;
  durablySpooledRows: number;
  peakObservedPendingRows: number;
  totalFlushes: number;
  lastFlushDurationMs: number;
  maxFlushDurationMs: number;
  flushFailures: number;
} {
  return {
    pendingRows: countPendingRows(),
    droppedRows: droppedPendingRows,
    maxPendingRows: MAX_PENDING_CSV_ROWS,
    durablySpooledRows,
    peakObservedPendingRows,
    totalFlushes,
    lastFlushDurationMs,
    maxFlushDurationMs,
    flushFailures,
  };
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

function splitCsvPath(filePath: string): { directory: string; stem: string; extension: string } {
  const slash = filePath.lastIndexOf('/');
  const directory = slash >= 0 ? filePath.substring(0, slash) : '.';
  const fileName = slash >= 0 ? filePath.substring(slash + 1) : filePath;
  const dot = fileName.lastIndexOf('.');
  return {
    directory,
    stem: dot > 0 ? fileName.substring(0, dot) : fileName,
    extension: dot > 0 ? fileName.substring(dot) : '',
  };
}

async function listCsvSegments(filePath: string): Promise<Array<{ part: number; path: string }>> {
  const { directory, stem, extension } = splitCsvPath(filePath);
  const output: Array<{ part: number; path: string }> = [{ part: 1, path: filePath }];
  const marker = `${stem}.part-`;
  const names = await FileSystem.readDirectoryAsync(directory).catch(() => []);
  for (const name of names) {
    if (!name.startsWith(marker) || !name.endsWith(extension)) continue;
    const part = Number(name.slice(marker.length, name.length - extension.length));
    if (Number.isInteger(part) && part >= 2) output.push({ part, path: `${directory}/${name}` });
  }
  return output.sort((a, b) => a.part - b.part);
}

/**
 * SDK 51's legacy FileSystem API has no append option. Keep the original daily
 * filename as part 1 and rotate later writes into bounded segments.
 */
async function resolveWritableSegment(filePath: string): Promise<string> {
  const segments = await listCsvSegments(filePath);
  const latest = segments[segments.length - 1];
  if (!latest) return filePath;
  const info = await FileSystem.getInfoAsync(latest.path, { size: true });
  if (!info.exists) return latest.path;
  if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
    throw new Error('CSV_SEGMENT_SIZE_UNAVAILABLE: ' + latest.path);
  }
  if (info.size < MAX_CSV_SEGMENT_BYTES) return latest.path;
  const nextPart = latest.part + 1;
  const { directory, stem, extension } = splitCsvPath(filePath);
  return `${directory}/${stem}.part-${String(nextPart).padStart(4, '0')}${extension}`;
}

async function writeRowsUnsafe(filePath: string, rows: CsvRow[]): Promise<void> {
  if (!rows.length) return;
  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const targetPath = await resolveWritableSegment(filePath);

  const info = await FileSystem.getInfoAsync(targetPath, { size: true });
  if (!info.exists) {
    const headers = Object.keys(rows[0]);
    const lines = rows.map((row) => serializeRow(row, headers));
    await FileSystem.writeAsStringAsync(targetPath, `${headers.join(',')}\n${lines.join('\n')}\n`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  }

  const headerPreview = await FileSystem.readAsStringAsync(targetPath, {
    encoding: FileSystem.EncodingType.UTF8,
    position: 0,
    length: 8192,
  });
  const firstNewline = headerPreview.indexOf('\n');
  if (firstNewline < 0 && (info.size ?? 0) > headerPreview.length) {
    throw new Error('CSV_HEADER_EXCEEDS_READ_WINDOW: ' + targetPath);
  }
  const headerLine = (firstNewline >= 0
    ? headerPreview.slice(0, firstNewline)
    : headerPreview).replace(/\r$/, '');
  if (!headerLine.trim()) {
    const headers = Object.keys(rows[0]);
    const lines = rows.map((row) => serializeRow(row, headers));
    await FileSystem.writeAsStringAsync(targetPath, `${headers.join(',')}\n${lines.join('\n')}\n`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  }
  const oldHeaders = headerLine.split(',');
  if (!oldHeaders.length || oldHeaders.some((header) => !header)) {
    throw new Error('CSV_HEADER_INVALIDO: ' + targetPath);
  }

  const addedHeaders = Array.from(new Set(rows.flatMap((row) =>
    Object.keys(row).filter((key) => !oldHeaders.includes(key)),
  )));
  if (addedHeaders.length > 0) {
    const current = await FileSystem.readAsStringAsync(targetPath);
    const records = parseCsvRecords(current);
    if (!records.length || records[0].join(',') !== oldHeaders.join(',')) {
      throw new Error('CSV_HEADER_CHANGED_DURING_SCHEMA_MIGRATION: ' + targetPath);
    }
    const headers = [...oldHeaders, ...addedHeaders];
    const existingLines = records.slice(1).map((oldRow) =>
      headers.map((_, index) => formatCsvValue(oldRow[index] ?? '')).join(','),
    );
    const newLines = rows.map((row) => serializeRow(row, headers));
    await FileSystem.writeAsStringAsync(targetPath, `${headers.join(',')}\n${[...existingLines, ...newLines].join('\n')}\n`, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return;
  }

  const lines = rows.map((row) => serializeRow(row, oldHeaders));
  // The compatibility rewrite is now bounded by MAX_CSV_SEGMENT_BYTES.
  const current = await FileSystem.readAsStringAsync(targetPath, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const separator = current.length > 0 && !current.endsWith('\n') ? '\n' : '';
  await FileSystem.writeAsStringAsync(targetPath, `${current}${separator}${lines.join('\n')}\n`, {
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

function queuedCsvPath(filePath: string): string {
  const { directory, stem, extension } = splitCsvPath(filePath);
  spillSequence += 1;
  return `${directory}/${stem}.queue-${Date.now()}-${String(spillSequence).padStart(6, '0')}${extension || '.csv'}`;
}

/**
 * Persist immutable chunks when the in-memory queue reaches its watermark.
 * A failed chunk restores only the unwritten suffix; committed chunks remain
 * valid CSV files and are included in normal backups/cleanup.
 */
async function spillPendingCsvRows(): Promise<void> {
  if (spillPromise) return spillPromise;
  if (pendingRows.size === 0) return;

  const batch = new Map(pendingRows);
  pendingRows.clear();
  const current = (async () => {
    const entries = Array.from(batch.entries());
    for (let entryIndex = 0; entryIndex < entries.length; entryIndex += 1) {
      const [filePath, rows] = entries[entryIndex];
      let offset = 0;
      try {
        while (offset < rows.length) {
          const chunk = rows.slice(offset, offset + SPILL_CHUNK_ROWS);
          const headers = Object.keys(chunk[0]);
          const content = `${headers.join(',')}\n${chunk.map((row) => serializeRow(row, headers)).join('\n')}\n`;
          const target = queuedCsvPath(filePath);
          await FileSystem.writeAsStringAsync(target, content, { encoding: FileSystem.EncodingType.UTF8 });
          const records = parseCsvRecords(await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 }));
          if (records.length !== chunk.length + 1 || records[0]?.join(',') !== headers.join(',')) {
            await FileSystem.deleteAsync(target, { idempotent: true });
            throw new Error('CSV_QUEUE_SPOOL_VALIDATION_FAILED: ' + target);
          }
          offset += chunk.length;
          durablySpooledRows += chunk.length;
        }
      } catch (cause) {
        const restore = rows.slice(offset);
        for (let pendingIndex = entryIndex + 1; pendingIndex < entries.length; pendingIndex += 1) {
          const [restorePath, restoreRows] = entries[pendingIndex];
          const newerRows = pendingRows.get(restorePath) ?? [];
          pendingRows.set(restorePath, [...restoreRows, ...newerRows]);
        }
        if (restore.length) {
          const newerRows = pendingRows.get(filePath) ?? [];
          pendingRows.set(filePath, [...restore, ...newerRows]);
        }
        throw cause;
      }
    }
  })();
  spillPromise = current;
  let succeeded = false;
  try {
    await current;
    succeeded = true;
  } finally {
    if (spillPromise === current) spillPromise = null;
  }
  if (succeeded && countPendingRows() >= MAX_PENDING_CSV_ROWS) {
    await spillPendingCsvRows();
  }
}

export function queueCsvRow(filePath: string, row: CsvRow): void {
  const totalBefore = countPendingRows();
  if (getCsvQueueAction(totalBefore) === 'drop') {
    droppedPendingRows += 1;
    if (droppedPendingRows === 1 || droppedPendingRows % 100 === 0) {
      console.warn(`[csv] spool indisponível; fila atingiu ${HARD_MAX_PENDING_CSV_ROWS}; linhas descartadas: ${droppedPendingRows}`);
    }
    return;
  }

  const queue = pendingRows.get(filePath) ?? [];
  queue.push({ ...row });
  pendingRows.set(filePath, queue);
  const totalPending = totalBefore + 1;
  peakObservedPendingRows = Math.max(peakObservedPendingRows, totalPending);

  if (getCsvQueueAction(totalPending) === 'spill') {
    if (flushTimer) {
      clearTimeout(flushTimer);
      flushTimer = null;
    }
    void spillPendingCsvRows().catch((cause) => {
      console.warn('[csv] falha ao persistir fila de segurança:', cause instanceof Error ? cause.message : cause);
      scheduleBatchFlush();
    });
    return;
  }

  if (getCsvQueueAction(totalPending) === 'flush') {
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
  if (spillPromise) await spillPromise.catch(() => undefined);
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
  const flushStartedAt = Date.now();
  totalFlushes += 1;
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
    flushFailures += 1;
    // Keep retrying after export/disconnect-triggered flushes too, not only
    // after the timer-driven flush path. Rows were restored to pendingRows.
    if (pendingRows.size > 0) scheduleBatchFlush();
    throw cause;
  } finally {
    lastFlushDurationMs = Date.now() - flushStartedAt;
    maxFlushDurationMs = Math.max(maxFlushDurationMs, lastFlushDurationMs);
    flushPromise = null;
  }
  if (countPendingRows() >= MAX_PENDING_CSV_ROWS) {
    void spillPendingCsvRows().catch((cause) => {
      console.warn('[csv] falha ao persistir fila após flush:', cause instanceof Error ? cause.message : cause);
    });
  } else if (pendingRows.size > 0) {
    scheduleBatchFlush();
  }
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

/** Append a summary row only once, even when trip finalization is retried. */
export async function appendCsvRowIfMissing(
  filePath: string,
  row: CsvRow,
  uniqueKey: string,
): Promise<void> {
  const uniqueValue = row[uniqueKey];
  if (uniqueValue === null || uniqueValue === undefined || String(uniqueValue) === '') {
    throw new Error('CSV_UNIQUE_KEY_MISSING: ' + uniqueKey);
  }
  await enqueueFileOperation(filePath, async () => {
    const segments = await listCsvSegments(filePath);
    for (const segment of segments) {
      const info = await FileSystem.getInfoAsync(segment.path);
      if (!info.exists || info.isDirectory) continue;
      const content = await FileSystem.readAsStringAsync(segment.path, { encoding: FileSystem.EncodingType.UTF8 });
      const records = parseCsvRecords(content);
      const headers = records[0] ?? [];
      const column = headers.indexOf(uniqueKey);
      if (column >= 0 && records.slice(1).some((record) => record[column] === String(uniqueValue))) return;
    }
    await writeRowsUnsafe(filePath, [row]);
  });
}
