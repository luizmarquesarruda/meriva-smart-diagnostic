import * as FileSystem from 'expo-file-system';
import type { DataSource, DtcStatus, DtcRecord } from '../types/sourceTypes';

export type { DtcRecord } from '../types/sourceTypes';

const dtcQueues = new Map<string, Promise<void>>();

function queueDtcWrite(target: string, operation: () => Promise<void>): Promise<void> {
  const previous = dtcQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tail = current.catch(() => undefined);
  dtcQueues.set(target, tail);
  return current.finally(() => {
    if (dtcQueues.get(target) === tail) dtcQueues.delete(target);
  });
}


/**
 * DTC occurrence semantics: repeated reads of the same active code do not
 * create new fault occurrences. A new occurrence starts after the code was
 * previously absent/inactive and is detected again.
 */
export function nextDtcOccurrences(previous?: DtcRecord): number {
  if (!previous) return 1;
  const active = !previous.historical && ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(previous.status);
  return active ? Math.max(1, previous.occurrences || 1) : Math.max(1, previous.occurrences || 0) + 1;
}

/** Mode 03 reconciliation helper; call only after a complete, valid positive response. */
export function markMissingStoredDtcsInactive(existing: DtcRecord[], detectedCodes: string[], _now: string): DtcRecord[] {
  const detected = new Set(detectedCodes.map((code) => String(code).trim().toUpperCase()));
  return existing
    .filter((item) => item.source === 'REAL_OBD' && item.historical !== true
      && ['CURRENT', 'CONFIRMED'].includes(String(item.status ?? '').trim().toUpperCase())
      && !detected.has(String(item.code ?? '').trim().toUpperCase()))
    .map((item) => ({ ...item, status: 'INACTIVE' as const, historical: true }));
}

export async function recordDtc(basePath: string, dtc: DtcRecord): Promise<void> {
  const target = `${basePath}/DTC/dtc_records.txt`;
  await queueDtcWrite(target, async () => {
    await FileSystem.makeDirectoryAsync(`${basePath}/DTC`, { intermediates: true });

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
  });
}

export async function readDtcs(basePath: string): Promise<DtcRecord[]> {
  const target = `${basePath}/DTC/dtc_records.txt`;
  await (dtcQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
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
  return all.filter((dtc) => !dtc.historical && ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(dtc.status));
}

export async function getHistoricalDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => dtc.historical || ['HISTORICAL', 'INACTIVE'].includes(dtc.status));
}
