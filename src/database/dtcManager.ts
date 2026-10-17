import * as FileSystem from 'expo-file-system';
import type { DataSource, DtcStatus, DtcRecord } from '../types/sourceTypes';

export type { DtcRecord } from '../types/sourceTypes';

const dtcQueues = new Map<string, Promise<void>>();

function queueDtcWrite(target: string, operation: () => Promise<void>): Promise<void> {
  const previous = dtcQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  dtcQueues.set(target, current.catch(() => undefined));
  return current.finally(() => {
    if (dtcQueues.get(target) === current) dtcQueues.delete(target);
  });
}


/**
 * DTC occurrence semantics: repeated reads of the same active code do not
 * create new fault occurrences. A new occurrence starts after the code was
 * previously absent/inactive and is detected again.
 */
export function nextDtcOccurrences(previous?: DtcRecord): number {
  // occurrences significa número de leituras em que o código apareceu,
  // não número estimado de episódios físicos de falha.
  return Math.max(0, Number(previous?.occurrences) || 0) + 1;
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
      dtc.validation ?? 'HISTORY_WITHOUT_REVALIDATION',
      dtc.validatedAt ?? '',
      dtc.sessionId ?? '',
      dtc.freezeFrame ? JSON.stringify(dtc.freezeFrame) : '',
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
        validation,
        validatedAt,
        sessionId,
        freezeFrameRaw,
      ] = line.split('|');
      let freezeFrame: DtcRecord['freezeFrame'];
      try {
        const parsed = freezeFrameRaw ? JSON.parse(freezeFrameRaw) : null;
        if (parsed && typeof parsed === 'object' && (parsed.dtc == null || typeof parsed.dtc === 'string')
          && (parsed.frame == null || (typeof parsed.frame === 'number' && Number.isFinite(parsed.frame)))
          && (parsed.rpm == null || (typeof parsed.rpm === 'number' && Number.isFinite(parsed.rpm)))
          && (parsed.coolantC == null || (typeof parsed.coolantC === 'number' && Number.isFinite(parsed.coolantC)))) {
          freezeFrame = parsed;
        }
      } catch {
        freezeFrame = undefined;
      }
      const validationValue = validation === 'REVALIDATED_IN_SESSION'
        ? 'REVALIDATED_IN_SESSION' : 'HISTORY_WITHOUT_REVALIDATION';
      const rawStatus = (status as DtcStatus) || 'UNKNOWN';
      const safeStatus = validationValue === 'HISTORY_WITHOUT_REVALIDATION' && rawStatus === 'CURRENT'
        ? 'HISTORICAL' : rawStatus;

      return {
        code,
        description: description || undefined,
        status: safeStatus,
        firstSeen,
        lastSeen,
        occurrences: Number(occurrences || 0),
        source: (source as DataSource) || 'IMPORTADO',
        historical: historical === 'true' || safeStatus === 'HISTORICAL',
        confirmed: confirmed === 'true' && validationValue === 'REVALIDATED_IN_SESSION',
        validation: validationValue,
        validatedAt: validatedAt || undefined,
        sessionId: sessionId || undefined,
        freezeFrame,
      };
    });
}

export async function getCurrentDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => dtc.validation === 'REVALIDATED_IN_SESSION' && ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(dtc.status));
}

export async function getHistoricalDtcs(basePath: string): Promise<DtcRecord[]> {
  const all = await readDtcs(basePath);
  return all.filter((dtc) => dtc.historical || ['HISTORICAL', 'INACTIVE'].includes(dtc.status));
}
