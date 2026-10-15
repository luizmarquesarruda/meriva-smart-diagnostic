import * as FileSystem from 'expo-file-system';
import type { DataSource, DtcStatus, DtcRecord } from '../types/sourceTypes';

export type { DtcRecord } from '../types/sourceTypes';

const dtcQueues = new Map<string, Promise<unknown>>();

function queueDtcWrite<T>(target: string, operation: () => Promise<T>): Promise<T> {
  const previous = dtcQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  dtcQueues.set(target, current);
  void current.finally(() => {
    if (dtcQueues.get(target) === current) dtcQueues.delete(target);
  }).catch(() => undefined);
  return current;
}


/**
 * DTC occurrence semantics: repeated reads of the same active code do not
 * create new fault occurrences. A new occurrence starts after the code was
 * previously absent/inactive and is detected again.
 */
export function nextDtcOccurrences(previous?: DtcRecord): number {
  if (!previous) return 1;
  const active = ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(previous.status);
  return active ? Math.max(1, previous.occurrences || 1) : Math.max(1, previous.occurrences || 0) + 1;
}

export async function recordDtc(basePath: string, dtc: DtcRecord): Promise<void> {
  // This file is the operational history, not a staging area for imported or
  // simulated events. Reject them at the write boundary, not just at read time.
  if (dtc.source !== 'REAL_OBD') {
    throw new Error('NON_REAL_DTC_NOT_ALLOWED_IN_OPERATIONAL_HISTORY');
  }
  if (!/^[PCBU][0-9A-F]{4}$/i.test(dtc.code)) {
    throw new Error('INVALID_DTC_CODE');
  }
  if (!VALID_DTC_STATUSES.has(dtc.status)) {
    throw new Error('INVALID_DTC_STATUS');
  }
  if (!Number.isFinite(dtc.occurrences) || dtc.occurrences < 0) {
    throw new Error('INVALID_DTC_OCCURRENCE_COUNT');
  }

  const target = `${basePath}/DTC/dtc_records.txt`;
  await queueDtcWrite(target, async () => {
    await FileSystem.makeDirectoryAsync(`${basePath}/DTC`, { intermediates: true });

    const line = [
      dtc.code.toUpperCase(),
      (dtc.description ?? '').replace(/[|\r\n]/g, ' '),
      dtc.status,
      dtc.firstSeen ?? '',
      dtc.lastSeen ?? '',
      Math.max(1, Math.floor(dtc.occurrences)),
      'REAL_OBD',
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

const VALID_DTC_STATUSES = new Set<DtcStatus>([
  'CONFIRMED', 'PENDING', 'PERMANENT', 'INACTIVE', 'HISTORICAL', 'CURRENT', 'UNKNOWN',
]);

function parseStoredDtcLine(line: string): DtcRecord | null {
  const [rawCode, description, rawStatus, firstSeen, lastSeen, rawOccurrences, rawSource, historical, confirmed] = line.split('|');
  const code = typeof rawCode === 'string' ? rawCode.trim().toUpperCase() : '';
  const status = typeof rawStatus === 'string' ? rawStatus.trim().toUpperCase() as DtcStatus : 'UNKNOWN';
  const source = typeof rawSource === 'string' ? rawSource.trim() as DataSource : 'IMPORTADO';
  const occurrences = Number(rawOccurrences);
  if (!/^[PCBU][0-9A-F]{4}$/.test(code) || !VALID_DTC_STATUSES.has(status) ||
      source !== 'REAL_OBD' || !Number.isFinite(occurrences) || occurrences < 0) return null;
  return {
    code,
    description: description || undefined,
    status,
    firstSeen: firstSeen || '',
    lastSeen: lastSeen || '',
    occurrences: Math.max(1, Math.floor(occurrences)),
    source: 'REAL_OBD',
    historical: historical === 'true' || status === 'HISTORICAL' || status === 'INACTIVE',
    confirmed: confirmed === 'true',
  };
}

/**
 * Remove imported/seed/simulation and malformed rows from the legacy DTC text
 * file. A backup is kept and a staged read-back is validated before replacing
 * the original, so a failed purge never turns the existing file into empty data.
 */
export async function purgeLegacyNonRealDtcs(basePath: string): Promise<void> {
  const target = `${basePath}/DTC/dtc_records.txt`;
  await queueDtcWrite(target, async () => {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists) return;
    if (info.isDirectory) throw new Error('DTC_HISTORY_IS_DIRECTORY');
    const content = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
    const lines = content.split(/\r?\n/).filter((line) => line.trim());
    const cleanLines = lines.filter((line) => parseStoredDtcLine(line) !== null);
    if (cleanLines.length === lines.length) return;

    const temp = target + '.tmp';
    const backup = target + '.previous';
    const output = cleanLines.length ? cleanLines.join('\n') + '\n' : '';
    await FileSystem.writeAsStringAsync(temp, output, { encoding: FileSystem.EncodingType.UTF8 });
    const staged = await FileSystem.readAsStringAsync(temp, { encoding: FileSystem.EncodingType.UTF8 });
    if (staged !== output || staged.split(/\r?\n/).filter(Boolean).some((line) => parseStoredDtcLine(line) === null)) {
      throw new Error('DTC_HISTORY_PURGE_STAGING_FAILED');
    }
    await FileSystem.copyAsync({ from: target, to: backup });
    let committed = false;
    try {
      await FileSystem.copyAsync({ from: temp, to: target });
      const readBack = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
      if (readBack !== output) throw new Error('DTC_HISTORY_PURGE_COMMIT_FAILED');
      committed = true;
    } catch (cause) {
      try { await FileSystem.copyAsync({ from: backup, to: target }); } catch { /* preserve backup */ }
      throw cause;
    } finally {
      if (committed) {
        try { await FileSystem.deleteAsync(temp, { idempotent: true }); } catch { /* clean next time */ }
      }
    }
    try { await FileSystem.copyAsync({ from: target, to: backup }); } catch {
      // Main DTC file has been verified; previous backup remains recoverable.
    }
  });
}

export async function readDtcs(basePath: string): Promise<DtcRecord[]> {
  const target = `${basePath}/DTC/dtc_records.txt`;
  await (dtcQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];
  if (info.isDirectory) throw new Error('DTC_HISTORY_IS_DIRECTORY');
  const content = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
  return content.split(/\r?\n/).filter((line) => line.trim())
    .map(parseStoredDtcLine).filter((dtc): dtc is DtcRecord => dtc !== null);
}

export async function getCurrentDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(dtc.status));
}

export async function getHistoricalDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => dtc.historical || ['HISTORICAL', 'INACTIVE'].includes(dtc.status));
}
