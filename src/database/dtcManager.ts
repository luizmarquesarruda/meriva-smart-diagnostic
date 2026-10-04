import * as FileSystem from 'expo-file-system';
import type { DataSource, DtcStatus, DtcRecord } from '../types/sourceTypes';

export type { DtcRecord } from '../types/sourceTypes';

export async function recordDtc(basePath: string, dtc: DtcRecord): Promise<void> {
  await FileSystem.makeDirectoryAsync(`${basePath}/DTC`, { intermediates: true });
  const target = `${basePath}/DTC/dtc_records.txt`;
  const line = [
    dtc.code,
    dtc.description ?? '',
    dtc.status,
    dtc.firstSeen,
    dtc.lastSeen,
    dtc.occurrences,
    dtc.source,
    dtc.historical ? 'true' : 'false',
    dtc.confirmed ? 'true' : 'false',
  ].join('|');

  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(target, `${line}\n`, { encoding: FileSystem.EncodingType.UTF8 });
    return;
  }

  const current = await FileSystem.readAsStringAsync(target);
  const lines = current.split('\n').filter((item) => item.trim());
  const filtered = lines.filter((item) => !item.startsWith(`${dtc.code}|`));
  filtered.push(line);
  await FileSystem.writeAsStringAsync(target, `${filtered.join('\n')}\n`, { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readDtcs(basePath: string): Promise<DtcRecord[]> {
  const target = `${basePath}/DTC/dtc_records.txt`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];

  const content = await FileSystem.readAsStringAsync(target);
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [
        code,
        description,
        status,
        firstSeen,
        lastSeen,
        occurrences,
        source,
        historical,
        confirmed,
      ] = line.split('|');

      return {
        code,
        description: description || undefined,
        status: (status as DtcStatus) || 'UNKNOWN',
        firstSeen,
        lastSeen,
        occurrences: Number(occurrences || 0),
        source: (source as DataSource) || 'IMPORTADO',
        historical: historical === 'true',
        confirmed: confirmed === 'true',
      };
    });
}

export async function getCurrentDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => ['CURRENT', 'CONFIRMED', 'PENDING'].includes(dtc.status));
}

export async function getHistoricalDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => dtc.historical || ['HISTORICAL', 'INACTIVE'].includes(dtc.status));
}
