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

export async function appendCsvRow(filePath: string, row: CsvRow): Promise<void> {
  const previous = fileQueues.get(filePath) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => appendCsvRowUnsafe(filePath, row));

  fileQueues.set(filePath, current);

  try {
    await current;
  } finally {
    if (fileQueues.get(filePath) === current) fileQueues.delete(filePath);
  }
}
