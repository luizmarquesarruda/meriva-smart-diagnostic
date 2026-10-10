import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';

export const AUTOSAVE_HISTORY_MAX_ENTRIES = 200;
export const AUTOSAVE_HISTORY_FILE = 'meriva_smart_autosave_history.txt';
const ENTRY_BEGIN = '=== SALVAMENTO_BEGIN ===';
const ENTRY_END = '=== SALVAMENTO_END ===';
const HISTORY_HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO DE SALVAMENTOS AUTOMÁTICOS',
  'LIMITE: 200 SALVAMENTOS',
  'REGRA: quando ultrapassar o limite, o salvamento mais antigo é removido.',
  '',
].join('\n');

function historyPath(basePath: string): string {
  return `${basePath}/CONFIG/${AUTOSAVE_HISTORY_FILE}`;
}

function splitEntries(content: string): string[] {
  return content
    .split(ENTRY_BEGIN)
    .slice(1)
    .map((part) => `${ENTRY_BEGIN}${part}`.trim())
    .filter((entry) => entry.includes(ENTRY_END));
}

/** Remove imported seed trips from old snapshots before displaying/exporting them. */
function removeCarScannerTripsFromSnapshot(entry: string): string {
  const match = entry.match(/(\[HISTORY\]\r?\n)([\s\S]*?)(?=\r?\n\[[^\]\r\n]+\]|$)/);
  if (!match) return entry;

  const rows = match[2]
    .split(/\r?\n/)
    .filter((line) => line.trim() && !/fonte=CARSCANNER_SEED|seed_cycle_/i.test(line));
  const historyBody = rows.length ? rows.join('\n') : 'N/D';
  return entry.replace(match[0], match[1] + historyBody);
}

export async function readAutoSaveHistory(basePath: string): Promise<string> {
  try {
    const info = await FileSystem.getInfoAsync(historyPath(basePath));
    if (!info.exists || info.isDirectory) return HISTORY_HEADER;
    const content = await FileSystem.readAsStringAsync(historyPath(basePath), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const entries = splitEntries(content)
      .slice(-AUTOSAVE_HISTORY_MAX_ENTRIES)
      .map(removeCarScannerTripsFromSnapshot);
    return entries.length ? `${HISTORY_HEADER}${entries.join('\n\n')}\n` : HISTORY_HEADER;  } catch {
    return HISTORY_HEADER;
  }
}

export async function appendAutoSaveHistory(
  basePath: string,
  state: MerivaPersistedState,
  appVersion: string,
  reason: string,
): Promise<{ count: number }> {
  const path = historyPath(basePath);
  const current = await readAutoSaveHistory(basePath);
  const entries = splitEntries(current);
  const lastNumber = entries.reduce((max, entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = lastNumber + 1;
  const exportedAt = new Date().toISOString();
  const snapshot = formatAutoSaveTxt(state, { appVersion, exportedAt });
  const entry = [
    ENTRY_BEGIN,
    `NÚMERO: ${nextNumber}`,
    `MOTIVO: ${reason}`,
    snapshot.trim(),
    ENTRY_END,
  ].join('\n');
  const kept = [...entries, entry].slice(-AUTOSAVE_HISTORY_MAX_ENTRIES);
  await FileSystem.writeAsStringAsync(path, `${HISTORY_HEADER}${kept.join('\n\n')}\n`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { count: kept.length };
}

export async function getAutoSaveHistoryCount(basePath: string): Promise<number> {
  const content = await readAutoSaveHistory(basePath);
  return splitEntries(content).length;
}
