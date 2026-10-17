import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';
import { sha256Hex, utf8ByteLength } from './sha256';

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
  const withoutFooter = content.replace(/\nBLOCKS:\s*\d+\nBYTES:\s*\d+\nSHA256:\s*[a-f0-9]{64}\s*$/i, '\n');
  return withoutFooter
    .split(ENTRY_BEGIN)
    .slice(1)
    .map((part) => {
      const raw = ENTRY_BEGIN + part;
      const endAt = raw.indexOf(ENTRY_END);
      return endAt < 0 ? '' : raw.slice(0, endAt + ENTRY_END.length).trim();
    })
    .filter((entry) => entry.length > 0);
}

function normalizeEntryNumbers(entries: string[]): string[] {
  const lastNumber = entries.reduce((max, entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const firstNumber = Math.max(1, lastNumber - entries.length + 1);
  return entries.map((entry, index) =>
    /NÚMERO:\s*\d+/.test(entry)
      ? entry.replace(/NÚMERO:\s*\d+/, 'NÚMERO: ' + (firstNumber + index))
      : entry.replace(ENTRY_BEGIN, ENTRY_BEGIN + '\nNÚMERO: ' + (firstNumber + index)),
  );
}

function buildIntegrityFooter(body: string, blockCount: number): string {
  return 'BLOCKS: ' + blockCount + '\nBYTES: ' + utf8ByteLength(body) + '\nSHA256: ' + sha256Hex(body) + '\n';
}

function verifyIntegrityFooter(content: string): boolean {
  const match = content.match(/\nBLOCKS:\s*(\d+)\nBYTES:\s*(\d+)\nSHA256:\s*([a-f0-9]{64})\n?$/i);
  if (!match) return false;
  const body = content.slice(0, match.index);
  return Number(match[2]) === utf8ByteLength(body) && match[3].toLowerCase() === sha256Hex(body);
}
/**
 * A manual export and an automatic autosave can overlap on older app versions.
 * Keep the last snapshot for each sequence number and restore numeric order.
 */
function deduplicateEntries(entries: string[]): string[] {
  const numbered = new Map<number, string>();
  const unnumbered: string[] = [];
  for (const entry of entries) {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    if (!match) {
      unnumbered.push(entry);
      continue;
    }
    numbered.set(Number(match[1]), entry);
  }
  const ordered = Array.from(numbered.entries())
    .sort((a, b) => a[0] - b[0])
    .map(([, entry]) => entry);
  return [...ordered, ...unnumbered];
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

async function readAutoSaveHistoryUnsafe(basePath: string): Promise<string> {
  const path = historyPath(basePath);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return HISTORY_HEADER;
  if (info.isDirectory) {
    throw new Error('O caminho do histórico de autosave aponta para um diretório; arquivo existente preservado.');
  }
  const content = await FileSystem.readAsStringAsync(path, {
    encoding: FileSystem.EncodingType.UTF8,
  });
  const entries = deduplicateEntries(splitEntries(content))
    .slice(-AUTOSAVE_HISTORY_MAX_ENTRIES)
    .map(removeCarScannerTripsFromSnapshot);
  return entries.length ? `${HISTORY_HEADER}${entries.join('\n\n')}\n` : HISTORY_HEADER;
}

export async function readAutoSaveHistory(basePath: string): Promise<string> {
  try {
    return await readAutoSaveHistoryUnsafe(basePath);
  } catch {
    // The read-only UI may show an empty-state header, but append operations
    // use the strict reader below and never replace an unreadable existing file.
    return HISTORY_HEADER;
  }
}

async function appendAutoSaveHistoryUnsafe(
  basePath: string,
  state: MerivaPersistedState,
  appVersion: string,
  reason: string,
): Promise<{ count: number }> {
  const path = historyPath(basePath);
  const current = await readAutoSaveHistoryUnsafe(basePath);
  const entries = normalizeEntryNumbers(deduplicateEntries(splitEntries(current)));
  const lastNumber = entries.reduce((max, entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = lastNumber + 1;
  const exportedAt = new Date().toISOString();
  // The JSON autosave remains the complete source of truth. Repeating every
  // trip in each of 200 TXT snapshots caused quadratic file growth; keep only
  // the ten most recent REAL_OBD trips in this diagnostic snapshot history.
  const snapshot = formatAutoSaveTxt(state, { appVersion, exportedAt, historyLimit: 10 });
  const entry = [
    ENTRY_BEGIN,
    `NÚMERO: ${nextNumber}`,
    `MOTIVO: ${reason}`,
    snapshot.trim(),
    ENTRY_END,
  ].join('\n');
  const kept = normalizeEntryNumbers([...entries, entry].slice(-AUTOSAVE_HISTORY_MAX_ENTRIES));
  const body = HISTORY_HEADER + kept.join('\n\n') + '\n';
  const output = body + buildIntegrityFooter(body, kept.length);
  const tmpPath = path + '.tmp';
  const previousPath = path + '.previous';
  await FileSystem.writeAsStringAsync(tmpPath, output, { encoding: FileSystem.EncodingType.UTF8 });
  const readBack = await FileSystem.readAsStringAsync(tmpPath, { encoding: FileSystem.EncodingType.UTF8 });
  if (readBack !== output || !verifyIntegrityFooter(readBack)) throw new Error('AUTOSAVE_HISTORY_INTEGRITY_FAILED');
  const currentInfo = await FileSystem.getInfoAsync(path);
  if (currentInfo.exists) await FileSystem.copyAsync({ from: path, to: previousPath });
  try {
    if (currentInfo.exists) await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: tmpPath, to: path });
  } catch (error) {
    const targetInfo = await FileSystem.getInfoAsync(path);
    const backupInfo = await FileSystem.getInfoAsync(previousPath);
    if (!targetInfo.exists && backupInfo.exists) await FileSystem.copyAsync({ from: previousPath, to: path });
    throw error;
  }
  return { count: kept.length };
}

// Serialize every read-modify-write to avoid duplicate sequence numbers or lost
// snapshots when background autosave and manual export initialize concurrently.
const historyQueues = new Map<string, Promise<unknown>>();

export function appendAutoSaveHistory(
  basePath: string,
  state: MerivaPersistedState,
  appVersion: string,
  reason: string,
): Promise<{ count: number }> {
  const path = historyPath(basePath);
  const previous = historyQueues.get(path) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => appendAutoSaveHistoryUnsafe(basePath, state, appVersion, reason));
  historyQueues.set(path, current);
  void current.finally(() => {
    if (historyQueues.get(path) === current) historyQueues.delete(path);
  }).catch(() => undefined);
  return current;
}

export async function getAutoSaveHistoryCount(basePath: string): Promise<number> {
  const content = await readAutoSaveHistory(basePath);
  return splitEntries(content).length;
}
