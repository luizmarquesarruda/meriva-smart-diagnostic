import * as FileSystem from 'expo-file-system';

export interface TxtEntry {
  section: string;
  values: Record<string, string>;
}

export function formatTxtEntry(entry: TxtEntry): string {
  const lines = [`[${entry.section}]`];
  for (const [key, value] of Object.entries(entry.values)) {
    lines.push(`${key}=${value}`);
  }
  return `${lines.join('\n')}\n`;
}

export function parseTxtEntries(content: string): TxtEntry[] {
  const entries: TxtEntry[] = [];
  let current: TxtEntry | null = null;

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#') || line.startsWith(';')) continue;

    const sectionMatch = line.match(/^\[([^\]]+)\]$/);
    if (sectionMatch) {
      current = { section: sectionMatch[1], values: {} };
      entries.push(current);
      continue;
    }

    if (!current) continue;
    const separatorIndex = line.indexOf('=');
    if (separatorIndex > 0) {
      const key = line.slice(0, separatorIndex).trim();
      const value = line.slice(separatorIndex + 1).trim();
      current.values[key] = value;
    }
  }

  return entries;
}

export async function appendTxtEntry(basePath: string, fileName: string, entry: TxtEntry): Promise<void> {
  const target = `${basePath}/BANCO/${fileName}`;
  await FileSystem.makeDirectoryAsync(`${basePath}/BANCO`, { intermediates: true });
  const info = await FileSystem.getInfoAsync(target);
  const current = info.exists ? await FileSystem.readAsStringAsync(target) : '';
  await FileSystem.writeAsStringAsync(target, `${current}${formatTxtEntry(entry)}`, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readTxtEntries(basePath: string, fileName: string): Promise<TxtEntry[]> {
  const target = `${basePath}/BANCO/${fileName}`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];
  return parseTxtEntries(await FileSystem.readAsStringAsync(target));
}
