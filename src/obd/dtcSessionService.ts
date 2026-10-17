import type { Elm327Session } from './elm327';
import { readFreezeFrame, scanDtcServices, type DtcServiceScan, type FreezeFrameSnapshot } from './dtcScanner';
import { getDtcDefinition } from './dtcDefinition';
import { nextDtcOccurrences, readDtcs, recordDtc } from '../database/dtcManager';
import { getAutoSaveState, updateAutoSaveState } from '../meriva/autosaveManager';
import { forceSaveOnObdEvent } from '../meriva/autosaveIntegration';
import type { DtcRecord } from '../types/sourceTypes';

export interface DtcSessionRefreshResult {
  sessionId: string;
  scans: DtcServiceScan[];
  freezeFrame: FreezeFrameSnapshot;
  records: DtcRecord[];
  inactive: DtcRecord[];
}

const UNAVAILABLE_FRAME: FreezeFrameSnapshot = {
  frame: null, dtc: null, rpm: null, coolantC: null, available: false, responses: {},
};

/** Releitura por sessão: códigos CURRENT só são publicados após resposta real da ECU. */
export async function refreshDtcSession(
  basePath: string,
  session: Elm327Session,
  sessionId = `ecu-session-${Date.now()}`,
): Promise<DtcSessionRefreshResult> {
  const execute = (command: string) => session.executeCommand(command, 2500);
  const scans = await scanDtcServices(session, execute);
  const stored = scans.find((item) => item.kind === 'STORED');
  const pending = scans.find((item) => item.kind === 'PENDING');
  const permanent = scans.find((item) => item.kind === 'PERMANENT');
  const freezeFrame = stored?.available && stored.codes.length > 0
    ? await readFreezeFrame(session, execute)
    : UNAVAILABLE_FRAME;
  const fileRecords = await readDtcs(basePath);
  const mergedExisting = new Map(getAutoSaveState().dtcs.map((item) => [item.code, item]));
  for (const item of fileRecords) mergedExisting.set(item.code, item);
  const existing = [...mergedExisting.values()];
  const existingByCode = new Map(existing.map((item) => [item.code, item]));
  const now = new Date().toISOString();
  const priorities: Record<DtcServiceScan['kind'], number> = { PENDING: 1, PERMANENT: 2, STORED: 3 };
  const bestByCode = new Map<string, DtcServiceScan['kind']>();

  for (const scan of scans) {
    if (!scan.available) continue;
    for (const code of scan.codes) {
      const previousKind = bestByCode.get(code);
      if (!previousKind || priorities[scan.kind] > priorities[previousKind]) bestByCode.set(code, scan.kind);
    }
  }

  const records: DtcRecord[] = [];
  for (const [code, kind] of bestByCode) {
    const previous = existingByCode.get(code);
    const status = kind === 'PENDING' ? 'PENDING' : kind === 'PERMANENT' ? 'PERMANENT' : 'CURRENT';
    const ownedFrame = freezeFrame.available && freezeFrame.dtc === code && freezeFrame.frame != null
      ? {
          frame: freezeFrame.frame,
          dtc: code,
          rpm: freezeFrame.rpm,
          coolantC: freezeFrame.coolantC,
          capturedAt: now,
        }
      : undefined;
    const record: DtcRecord = {
      code,
      description: getDtcDefinition(code)?.description,
      status,
      firstSeen: previous?.firstSeen ?? now,
      lastSeen: now,
      occurrences: nextDtcOccurrences(previous),
      source: 'REAL_OBD',
      historical: false,
      confirmed: status === 'CURRENT',
      validation: 'REVALIDATED_IN_SESSION',
      validatedAt: now,
      sessionId,
      ...(ownedFrame ? { freezeFrame: ownedFrame } : {}),
    };
    records.push(record);
    await recordDtc(basePath, record);
  }

  const detectedCodes = new Set(records.map((item) => item.code));
  const inactive: DtcRecord[] = [];
  for (const previous of existing) {
    if (detectedCodes.has(previous.code)) continue;
    const relevantScan = ['CURRENT', 'CONFIRMED', 'HISTORICAL', 'INACTIVE'].includes(previous.status)
      ? stored
      : previous.status === 'PENDING' ? pending
      : previous.status === 'PERMANENT' ? permanent
      : undefined;
    if (!relevantScan || !relevantScan.available) {
      const record: DtcRecord = {
        ...previous,
        status: previous.status === 'CURRENT' || previous.status === 'CONFIRMED' ? 'HISTORICAL' : previous.status,
        historical: true,
        confirmed: false,
        validation: 'HISTORY_WITHOUT_REVALIDATION',
      };
      inactive.push(record);
      await recordDtc(basePath, record);
      continue;
    }
    if (['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(previous.status)) {
      const record: DtcRecord = {
        ...previous,
        status: 'INACTIVE',
        historical: true,
        confirmed: false,
        validation: 'REVALIDATED_IN_SESSION',
        validatedAt: now,
        sessionId,
      };
      inactive.push(record);
      await recordDtc(basePath, record);
    }
  }

  const changed = new Set([...records, ...inactive].map((item) => item.code));
  updateAutoSaveState((state) => {
    state.dtcs = [
      ...records,
      ...inactive,
      ...state.dtcs.filter((item) => !changed.has(item.code)),
    ];
  });
  await forceSaveOnObdEvent();
  return { sessionId, scans, freezeFrame, records, inactive };
}
