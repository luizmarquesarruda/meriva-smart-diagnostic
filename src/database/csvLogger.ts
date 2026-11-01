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
const knownCsvPaths = new Set<string>();
const writingCsvPaths = new Set<string>();
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

/** Caminhos CSV do dia local atual e arquivos que estão em escrita. */
export function getActiveCsvLogPaths(now = new Date()): string[] {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  const date = `${year}-${month}-${day}`;
  const currentDayPattern = new RegExp(`obd_(?:raw|interpreted)_${date}(?:\\.part-\\d{4})?\\.csv`);
  const paths = new Set<string>(writingCsvPaths);
  for (const filePath of knownCsvPaths) {
    if (currentDayPattern.test(filePath)) paths.add(filePath);
  }
  return Array.from(paths);
}

/** Returns every committed part of a daily CSV log in chronological part order. */
export async function getCsvLogSegments(filePath: string): Promise<string[]> {
  const segments = await listCsvSegments(filePath);
  const existing: string[] = [];
  for (const segment of segments) {
    const info = await FileSystem.getInfoAsync(segment.path);
    if (info.exists && !info.isDirectory) existing.push(segment.path);
  }
  return existing;
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

async function listCsvSegments(filePath: string, requireDirectory = false): Promise<Array<{ part: number; path: string }>> {
  const { directory, stem, extension } = splitCsvPath(filePath);
  const output: Array<{ part: number; path: string }> = [{ part: 1, path: filePath }];
  const marker = `${stem}.part-`;
  const names = requireDirectory
    ? await FileSystem.readDirectoryAsync(directory)
    : await FileSystem.readDirectoryAsync(directory).catch(() => []);
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
  knownCsvPaths.add(filePath);
  knownCsvPaths.add(targetPath);
  writingCsvPaths.add(targetPath);

  try {
    const info = await FileSystem.getInfoAsync(targetPath, { size: true });
    if (!info.exists) {
      const chunks = buildCsvSpoolChunks(rows);
      for (const chunk of chunks) await writeCsvSpoolSegmentUnsafe(filePath, chunk);
      return;
    }

    const headerPreview = await FileSystem.readAsStringAsync(targetPath, {
      encoding: FileSystem.EncodingType.UTF8,
      position: 0,
      length: 8192,
    });
    const firstNewline = headerPreview.indexOf('\\n');
    if (firstNewline < 0 && (info.size ?? 0) > headerPreview.length) {
      throw new Error('CSV_HEADER_EXCEEDS_READ_WINDOW: ' + targetPath);
    }
    const headerLine = (firstNewline >= 0
      ? headerPreview.slice(0, firstNewline)
      : headerPreview).replace(/\\r$/, '');
    if (!headerLine.trim()) {
      if (info.size !== 0) throw new Error('CSV_HEADER_INVALIDO: ' + targetPath);
      const chunks = buildCsvSpoolChunks(rows);
      for (const chunk of chunks) await writeCsvSpoolSegmentUnsafe(filePath, chunk);
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
      const updatedContent = `${headers.join(',')}\\n${[...existingLines, ...newLines].join('\\n')}\\n`;
      if (utf8ByteLength(updatedContent) > MAX_CSV_SEGMENT_BYTES) {
        const chunks = buildCsvSpoolChunks(rows, headers);
        for (const chunk of chunks) await writeCsvSpoolSegmentUnsafe(filePath, chunk);
        return;
      }
      await FileSystem.writeAsStringAsync(targetPath, updatedContent, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      return;
    }

    const lines = rows.map((row) => serializeRow(row, oldHeaders));
    const current = await FileSystem.readAsStringAsync(targetPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const separator = current.length > 0 && !current.endsWith('\\n') ? '\\n' : '';
    const updatedContent = `${current}${separator}${lines.join('\\n')}\\n`;
    if (utf8ByteLength(updatedContent) > MAX_CSV_SEGMENT_BYTES) {
      const chunks = buildCsvSpoolChunks(rows, oldHeaders);
      for (const chunk of chunks) await writeCsvSpoolSegmentUnsafe(filePath, chunk);
      return;
    }
    await FileSystem.writeAsStringAsync(targetPath, updatedContent, {
      encoding: FileSystem.EncodingType.UTF8,
    });
  } finally {
    writingCsvPaths.delete(targetPath);
  }
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

function utf8ByteLength(value: string): number {
  let bytes = 0;
  for (let index = 0; index < value.length; index += 1) {
    const code = value.charCodeAt(index);
    if (code <= 0x7f) bytes += 1;
    else if (code <= 0x7ff) bytes += 2;
    else if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length
      && value.charCodeAt(index + 1) >= 0xdc00 && value.charCodeAt(index + 1) <= 0xdfff) {
      bytes += 4;
      index += 1;
    } else bytes += 3;
  }
  return bytes;
}

interface CsvSpoolChunk {
  rows: CsvRow[];
  headers: string[];
  content: string;
}

/** Keep each immutable overflow segment under the configured byte limit. */
function buildCsvSpoolChunks(rows: CsvRow[], headersOverride?: string[]): CsvSpoolChunk[] {
  if (rows.length === 0) return [];
  const headers = headersOverride ? [...headersOverride] : Array.from(new Set(rows.flatMap((row) => Object.keys(row))));
  const headerLine = `${headers.join(',')}\n`;
  const chunks: CsvSpoolChunk[] = [];
  let chunkRows: CsvRow[] = [];
  let content = headerLine;

  for (const row of rows) {
    const serialized = `${serializeRow(row, headers)}\n`;
    if (chunkRows.length > 0 && (
      chunkRows.length >= SPILL_CHUNK_ROWS
      || utf8ByteLength(content + serialized) > MAX_CSV_SEGMENT_BYTES
    )) {
      chunks.push({ rows: chunkRows, headers, content });
      chunkRows = [];
      content = headerLine;
    }

    if (utf8ByteLength(content + serialized) > MAX_CSV_SEGMENT_BYTES) {
      throw new Error('CSV_QUEUE_ROW_EXCEEDS_SEGMENT_LIMIT');
    }
    chunkRows.push(row);
    content += serialized;
  }

  if (chunkRows.length > 0) chunks.push({ rows: chunkRows, headers, content });
  return chunks;
}

/**
 * Commit one immutable CSV segment. The temporary file is read back and
 * validated before the final .csv/.part-NNNN.csv name becomes visible.
 */
async function writeCsvSpoolSegmentUnsafe(
  filePath: string,
  chunk: CsvSpoolChunk,
): Promise<void> {
  const { directory, stem, extension } = splitCsvPath(filePath);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const existingSegments = await listCsvSegments(filePath, true);
  let nextPart = 1;
  for (const segment of existingSegments) {
    const info = await FileSystem.getInfoAsync(segment.path, { size: true });
    if (info.exists) nextPart = Math.max(nextPart, segment.part + 1);
  }

  let targetPath = nextPart === 1
    ? filePath
    : `${directory}/${stem}.part-${String(nextPart).padStart(4, '0')}${extension}`;
  let targetInfo = await FileSystem.getInfoAsync(targetPath);
  while (targetInfo.exists) {
    nextPart += 1;
    targetPath = `${directory}/${stem}.part-${String(nextPart).padStart(4, '0')}${extension}`;
    targetInfo = await FileSystem.getInfoAsync(targetPath);
  }

  spillSequence += 1;
  let temporaryPath = `${targetPath}.tmp-${Date.now()}-${String(spillSequence).padStart(6, '0')}`;
  while ((await FileSystem.getInfoAsync(temporaryPath)).exists) {
    spillSequence += 1;
    temporaryPath = `${targetPath}.tmp-${Date.now()}-${String(spillSequence).padStart(6, '0')}`;
  }

  writingCsvPaths.add(targetPath);
  try {
    await FileSystem.writeAsStringAsync(temporaryPath, chunk.content, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const persisted = await FileSystem.readAsStringAsync(temporaryPath, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const records = parseCsvRecords(persisted);
    const temporaryInfo = await FileSystem.getInfoAsync(temporaryPath, { size: true });
    if (
      persisted !== chunk.content
      || records.length !== chunk.rows.length + 1
      || records[0]?.join(',') !== chunk.headers.join(',')
      || !temporaryInfo.exists
      || utf8ByteLength(persisted) > MAX_CSV_SEGMENT_BYTES
      || (typeof temporaryInfo.size === 'number' && temporaryInfo.size > MAX_CSV_SEGMENT_BYTES)
    ) {
      throw new Error('CSV_QUEUE_SPOOL_VALIDATION_FAILED: ' + temporaryPath);
    }

    await FileSystem.moveAsync({ from: temporaryPath, to: targetPath });
    knownCsvPaths.add(filePath);
    knownCsvPaths.add(targetPath);
  } catch (cause) {
    try { await FileSystem.deleteAsync(temporaryPath, { idempotent: true }); } catch { /* preserve original error */ }
    throw cause;
  } finally {
    writingCsvPaths.delete(targetPath);
  }
}

/**
 * Persist immutable chunks as canonical daily CSV segments. These files are
 * enumerated with the normal .part-NNNN.csv history after process restart.
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
        const chunks = buildCsvSpoolChunks(rows);
        for (const chunk of chunks) {
          await enqueueFileOperation(filePath, () => writeCsvSpoolSegmentUnsafe(filePath, chunk));
          offset += chunk.rows.length;
          durablySpooledRows += chunk.rows.length;
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

  if (succeeded) {
    const remainingRows = countPendingRows();
    if (remainingRows >= MAX_PENDING_CSV_ROWS) {
      await spillPendingCsvRows();
    } else if (remainingRows >= BATCH_FLUSH_ROW_LIMIT) {
      await flushCsvLogs();
    } else if (remainingRows > 0) {
      scheduleBatchFlush();
    }
  }
}


export function queueCsvRow(filePath: string, row: CsvRow): void {
  knownCsvPaths.add(filePath);
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
  knownCsvPaths.add(filePath);
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
