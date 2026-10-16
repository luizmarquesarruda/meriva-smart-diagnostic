import * as FileSystem from 'expo-file-system';

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
const bufferedRows = new Map<string, CsvRow[]>();
const bufferedTimers = new Map<string, ReturnType<typeof setTimeout>>();
const bufferedFlushes = new Map<string, Promise<void>>();

export const CSV_BUFFER_FLUSH_INTERVAL_MS = 3_000;
export const CSV_BUFFER_BATCH_SIZE = 8;
const CSV_WRITE_BATCH_LIMIT = 64;

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return asString.includes(',') || asString.includes('"') || asString.includes('\n')
    ? `"${asString.replace(/"/g, '""')}"`
    : asString;
}

async function appendCsvRowsUnsafe(filePath: string, rows: CsvRow[]): Promise<void> {
  if (!rows.length) return;
  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const keys = Object.keys(rows[0]);
  const lines = rows.map((row) => keys.map((key) => formatCsvValue(row[key])).join(','));
  const info = await FileSystem.getInfoAsync(filePath);

  if (!info.exists) {
    await FileSystem.writeAsStringAsync(
      filePath,
      `${keys.join(',')}\n${lines.join('\n')}\n`,
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    return;
  }

  const current = await FileSystem.readAsStringAsync(filePath, { encoding: FileSystem.EncodingType.UTF8 });
  const trimmed = current.trim();
  const content = trimmed.length > 0
    ? `${trimmed}\n${lines.join('\n')}\n`
    : `${keys.join(',')}\n${lines.join('\n')}\n`;

  await FileSystem.writeAsStringAsync(filePath, content, { encoding: FileSystem.EncodingType.UTF8 });
}

function enqueueFileWrite(filePath: string, rows: CsvRow[]): Promise<void> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(() => appendCsvRowsUnsafe(filePath, rows));
  fileQueues.set(filePath, current);

  return current.finally(() => {
    if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
  });
}

/** Immediate durable append for user-triggered exports and low-frequency records. */
export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  await enqueueFileWrite(filePath, [row]);
}

function scheduleBufferedFlush(filePath: string): void {
  if (bufferedTimers.has(filePath)) return;
  const timer = setTimeout(() => {
    bufferedTimers.delete(filePath);
    void flushBufferedPath(filePath).catch((cause) => {
      console.warn('[csv] falha ao descarregar lote pendente:', cause instanceof Error ? cause.message : cause);
    });
  }, CSV_BUFFER_FLUSH_INTERVAL_MS);
  bufferedTimers.set(filePath, timer);
}

/**
 * Queue a high-frequency telemetry row without blocking the OBD polling loop.
 * Rows are written in batches so every sample does not read and rewrite the
 * full daily CSV file. Call flushBufferedCsvRows() on app background/stop.
 */
export function appendCsvRowBuffered(filePath: string, row: CsvRow): void {
  const pending = bufferedRows.get(filePath) ?? [];
  pending.push({ ...row });
  bufferedRows.set(filePath, pending);

  if (pending.length >= CSV_BUFFER_BATCH_SIZE) {
    void flushBufferedPath(filePath).catch((cause) => {
      console.warn('[csv] falha ao descarregar lote pendente:', cause instanceof Error ? cause.message : cause);
    });
    return;
  }
  scheduleBufferedFlush(filePath);
}

async function flushBufferedPath(filePath: string): Promise<void> {
  const active = bufferedFlushes.get(filePath);
  if (active) {
    await active.catch(() => undefined);
    if ((bufferedRows.get(filePath)?.length ?? 0) > 0) return flushBufferedPath(filePath);
    return;
  }

  const timer = bufferedTimers.get(filePath);
  if (timer) clearTimeout(timer);
  bufferedTimers.delete(filePath);

  const pending = bufferedRows.get(filePath) ?? [];
  if (!pending.length) return;
  const batch = pending.splice(0, CSV_WRITE_BATCH_LIMIT);
  if (pending.length === 0) bufferedRows.delete(filePath);

  const write = enqueueFileWrite(filePath, batch);
  bufferedFlushes.set(filePath, write);
  try {
    await write;
  } catch (cause) {
    // Do not drop buffered evidence on a transient storage failure.
    const remaining = bufferedRows.get(filePath) ?? [];
    bufferedRows.set(filePath, [...batch, ...remaining]);
    scheduleBufferedFlush(filePath);
    throw cause;
  } finally {
    if (bufferedFlushes.get(filePath) === write) bufferedFlushes.delete(filePath);
  }

  if ((bufferedRows.get(filePath)?.length ?? 0) > 0) {
    await flushBufferedPath(filePath);
  }
}

/** Flush pending telemetry logs; safe to call repeatedly during lifecycle transitions. */
export async function flushBufferedCsvRows(filePath?: string): Promise<void> {
  const paths = filePath
    ? [filePath]
    : Array.from(new Set([...bufferedRows.keys(), ...bufferedFlushes.keys()]));
  await Promise.all(paths.map((path) => flushBufferedPath(path)));
  await Promise.all(Array.from(fileQueues.values(), (queue) => queue.catch(() => undefined)));
}

export function getBufferedCsvRowCount(filePath?: string): number {
  if (filePath) return bufferedRows.get(filePath)?.length ?? 0;
  return Array.from(bufferedRows.values()).reduce((total, rows) => total + rows.length, 0);
}

/** Compatibility API used by exports and the Bluetooth lifecycle. */
export async function flushCsvLogs(): Promise<void> {
  await flushBufferedCsvRows();
}
