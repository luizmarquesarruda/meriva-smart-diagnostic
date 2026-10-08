import * as FileSystem from 'expo-file-system';

export type CsvValue = string | number | boolean | null | undefined;
export interface CsvRow {
  [key: string]: CsvValue;
  timestamp?: string; pid?: string; nome?: string; valor?: string | number | null;
  unidade?: string; rpm?: number | string | null; temperatura?: number | string | null;
  velocidade?: number | string | null; condicao?: string;
}

const FLUSH_INTERVAL_MS = 3000;
const FLUSH_ROW_LIMIT = 20;
interface PendingBatch { rows: CsvRow[]; timer: ReturnType<typeof setTimeout> | null; flushing: Promise<void>; }
const pending = new Map<string, PendingBatch>();

function formatCsvValue(value: CsvValue): string {
  if (value === null || value === undefined) return '';
  const asString = String(value);
  return asString.includes(',') || asString.includes('"') || asString.includes('\n')
    ? '"' + asString.replace(/"/g, '""') + '"' : asString;
}
function hourSegmentPath(filePath: string, date = new Date()): string {
  const suffix = date.toISOString().slice(0, 13).replace(/:/g, '-');
  const dot = filePath.lastIndexOf('.');
  return dot > filePath.lastIndexOf('/') ? filePath.slice(0, dot) + '-' + suffix + filePath.slice(dot) : filePath + '-' + suffix + '.csv';
}
async function writeBatch(filePath: string, rows: CsvRow[]): Promise<void> {
  if (!rows.length) return;
  const target = hourSegmentPath(filePath);
  const directory = target.includes('/') ? target.substring(0, target.lastIndexOf('/')) : '.';
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const keys = Object.keys(rows[0]);
  const lines = rows.map((row) => keys.map((key) => formatCsvValue(row[key])).join(','));
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(target, keys.join(',') + '\n' + lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
    return;
  }
  // Expo SDK 51 não oferece append portátil nesta API: grava em segmentos horários
  // e reescreve apenas o segmento atual, em lotes, nunca no caminho de cada PID.
  const current = await FileSystem.readAsStringAsync(target);
  await FileSystem.writeAsStringAsync(target, current.replace(/\s*$/, '\n') + lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
}
async function flush(filePath: string): Promise<void> {
  const batch = pending.get(filePath);
  if (!batch || !batch.rows.length) return;
  if (batch.timer) clearTimeout(batch.timer);
  batch.timer = null;
  const rows = batch.rows.splice(0, batch.rows.length);
  batch.flushing = batch.flushing.catch(() => undefined).then(() => writeBatch(filePath, rows));
  await batch.flushing;
}
export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  let batch = pending.get(filePath);
  if (!batch) {
    batch = { rows: [], timer: null, flushing: Promise.resolve() };
    pending.set(filePath, batch);
  }
  batch.rows.push({ ...row });
  if (batch.rows.length >= FLUSH_ROW_LIMIT) {
    await flush(filePath);
  } else if (!batch.timer) {
    batch.timer = setTimeout(() => { void flush(filePath).catch((error) => console.warn('[csv] batch flush failed', error)); }, FLUSH_INTERVAL_MS);
  }
}
export async function flushCsvLogger(): Promise<void> {
  await Promise.all([...pending.keys()].map((path) => flush(path)));
  await Promise.all([...pending.values()].map((batch) => batch.flushing));
}
