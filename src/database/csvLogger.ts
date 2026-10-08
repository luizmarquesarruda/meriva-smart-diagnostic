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
}

const fileQueues = new Map<string, Promise<void>>();

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return asString.includes(',') || asString.includes('"') || asString.includes('\n')
    ? `"${asString.replace(/"/g, '""')}"`
    : asString;
}

async function appendCsvRowUnsafe(filePath: string, row: CsvRow): Promise<void> {
  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

  const keys = Object.keys(row);
  const line = keys.map((key) => formatCsvValue(row[key])).join(',');

  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(
      filePath,
      `${keys.join(',')}\n${line}\n`,
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    return;
  }

  const current = await FileSystem.readAsStringAsync(filePath);
  const trimmed = current.trim();
  const content = trimmed.length > 0
    ? `${trimmed}\n${line}`
    : `${keys.join(',')}\n${line}`;

  await FileSystem.writeAsStringAsync(filePath, content, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}


const bufferedRows = new Map<string, CsvRow[]>();
const flushTimers = new Map<string, ReturnType<typeof setTimeout>>();
const BUFFER_LIMIT = 12;
const BUFFER_INTERVAL_MS = 3000;

async function flushBufferedCsv(filePath: string): Promise<void> {
  const rows = bufferedRows.get(filePath) ?? [];
  if (!rows.length) return;
  bufferedRows.set(filePath, []);
  const directory = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const keys = Object.keys(rows[0]);
  const lines = rows.map((row) => keys.map((key) => formatCsvValue(row[key])).join(','));
  const target = filePath.replace(/\.csv$/i, '_' + new Date().toISOString().slice(0, 13).replace(/:/g, '-') + '.csv');
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(target, keys.join(',') + '\\n' + lines.join('\\n') + '\\n', { encoding: FileSystem.EncodingType.UTF8 });
  } else {
    const current = await FileSystem.readAsStringAsync(target);
    await FileSystem.writeAsStringAsync(target, current.replace(/\\s*$/, '\\n') + lines.join('\\n') + '\\n', { encoding: FileSystem.EncodingType.UTF8 });
  }
}

export function appendCsvRowBuffered(filePath: string, row: CsvRow): void {
  const rows = bufferedRows.get(filePath) ?? [];
  rows.push({ ...row });
  bufferedRows.set(filePath, rows);
  if (rows.length >= BUFFER_LIMIT) {
    void flushBufferedCsv(filePath).catch((error) => console.warn('[csv] buffered flush failed', error));
  } else if (!flushTimers.has(filePath)) {
    flushTimers.set(filePath, setTimeout(() => {
      flushTimers.delete(filePath);
      void flushBufferedCsv(filePath).catch((error) => console.warn('[csv] buffered flush failed', error));
    }, BUFFER_INTERVAL_MS));
  }
}

export async function flushCsvLogger(): Promise<void> {
  for (const [filePath, timer] of flushTimers) clearTimeout(timer);
  flushTimers.clear();
  await Promise.all([...bufferedRows.keys()].map((filePath) => flushBufferedCsv(filePath)));
}
export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => appendCsvRowUnsafe(filePath, row));

  fileQueues.set(filePath, current.catch(() => undefined));

  try {
    await current;
  } finally {
    if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
  }
}
