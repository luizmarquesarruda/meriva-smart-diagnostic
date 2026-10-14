import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';
import autosavePolicy from '../knowledge/autosave_policy.json';

export const AUTOSAVE_HISTORY_MAX_ENTRIES = autosavePolicy.history.maxSnapshots;
export const AUTOSAVE_HISTORY_FILE = 'meriva_smart_autosave_history.txt';
const ENTRY_BEGIN = '=== SALVAMENTO_BEGIN ===';
const ENTRY_END = '=== SALVAMENTO_END ===';
const HISTORY_HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO DE SALVAMENTOS AUTOMÁTICOS',
  `LIMITE: ${AUTOSAVE_HISTORY_MAX_ENTRIES} SALVAMENTOS`,
  'ORGANIZAÇÃO: agrupado por data local; eventos de sessão ficam no diário de sessões independente.',
  'REGRA: quando ultrapassar o limite, o salvamento mais antigo é removido.',
  '',
].join('\n');

function historyPath(basePath: string): string {
  return `${basePath}/CONFIG/${AUTOSAVE_HISTORY_FILE}`;
}

function entryLocalDate(entry: string): string {
  const explicit = entry.match(/DATA LOCAL:\s*(\d{4}-\d{2}-\d{2})/);
  if (explicit) return explicit[1];

  // Legacy snapshots have only "Exported At" (usually a UTC ISO timestamp).
  // Convert those timestamps using the device's local timezone instead of
  // grouping by the UTC calendar date. Preserve date-only legacy values as-is.
  const exportedAt = entry.match(/Exported At:\s*([^\r\n]+)/);
  if (!exportedAt) return 'DATA DESCONHECIDA';
  const rawTimestamp = exportedAt[1].trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(rawTimestamp)) return rawTimestamp;

  const date = new Date(rawTimestamp);
  if (!Number.isFinite(date.getTime())) return 'DATA DESCONHECIDA';
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function renderHistory(entries: string[]): string {
  const groups = new Map<string, string[]>();
  for (const entry of entries) {
    const date = entryLocalDate(entry);
    const group = groups.get(date) ?? [];
    group.push(entry);
    groups.set(date, group);
  }
  // Keep day blocks in the order their first snapshot appeared. Sorting date
  // labels alphabetically moves legacy "DATA DESCONHECIDA" entries after newer
  // snapshots and makes the global sequence look corrupted.
  const firstSequence = (items: string[]) => Math.min(...items.map((entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
  }));
  const orderedDates = Array.from(groups.keys()).sort((a, b) => {
    const sequenceDelta = firstSequence(groups.get(a) ?? []) - firstSequence(groups.get(b) ?? []);
    return sequenceDelta || a.localeCompare(b);
  });
  const output = [HISTORY_HEADER.trimEnd()];
  for (const date of orderedDates) {
    output.push('', `========== DIA: ${date} ==========`, '');
    for (const entry of groups.get(date) ?? []) output.push(entry, '');
    output.push('========== FIM DO DIA ==========');
  }
  // Um único separador em branco entre snapshots deixa o arquivo mais escaneável
  // no celular, sem acrescentar páginas vazias a cada seção.
  return `${output.join('\n').replace(/\n{3,}/g, '\n\n')}\n`;
}

function splitEntries(content: string): string[] {
  return content
    .split(ENTRY_BEGIN)
    .slice(1)
    .map((part) => `${ENTRY_BEGIN}${part}`.trim())
    .filter((entry) => entry.includes(ENTRY_END));
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
  return entries.length ? renderHistory(entries) : HISTORY_HEADER;
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
  const entries = deduplicateEntries(splitEntries(current));
  const lastNumber = entries.reduce((max, entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = lastNumber + 1;
  const exportedAt = new Date().toISOString();
  // autosave.json remains the complete source of truth. A 1,000-entry history
  // should summarize the state, not duplicate full learning tables and trip lists
  // in every snapshot. Full TXT export remains available from the regular exporter.
  const snapshot = formatAutoSaveTxt(state, {
    appVersion,
    exportedAt,
    historyLimit: autosavePolicy.history.compactLatestTrips,
    compact: true,
  });
  const exportedDate = new Date(exportedAt);
  const localDate = `${exportedDate.getFullYear()}-${String(exportedDate.getMonth() + 1).padStart(2, '0')}-${String(exportedDate.getDate()).padStart(2, '0')}`;
  const entry = [
    ENTRY_BEGIN,
    `DATA LOCAL: ${localDate}`,
    `NÚMERO: ${nextNumber}`,
    `MOTIVO: ${reason}`,
    snapshot.trim(),
    ENTRY_END,
  ].join('\n');
  const kept = [...entries, entry].slice(-AUTOSAVE_HISTORY_MAX_ENTRIES);
  await FileSystem.writeAsStringAsync(path, renderHistory(kept), {
    encoding: FileSystem.EncodingType.UTF8,
  });
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
