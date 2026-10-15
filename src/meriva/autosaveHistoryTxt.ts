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

function isValidHistoryContent(content: string): boolean {
  // Accept the two-line header used by older app builds, then normalize it to
  // the current header on the next safe write.
  const legacyHeader = 'MERIVA SMART DIAGNOSTIC\nHISTÓRICO DE SALVAMENTOS AUTOMÁTICOS';
  if (!content.startsWith(HISTORY_HEADER.trimEnd()) && !content.startsWith(legacyHeader)) return false;
  const begins = content.split(ENTRY_BEGIN).length - 1;
  const ends = content.split(ENTRY_END).length - 1;
  const entries = splitEntries(content);
  return begins === ends && entries.length === begins;
}

async function recoverPendingAutoSaveHistoryWrite(path: string): Promise<void> {
  const tempPath = path + '.tmp';
  const backupPath = path + '.previous';
  const tempInfo = await FileSystem.getInfoAsync(tempPath);
  if (!tempInfo.exists || tempInfo.isDirectory) return;

  const staged = await FileSystem.readAsStringAsync(tempPath, { encoding: FileSystem.EncodingType.UTF8 });
  if (!isValidHistoryContent(staged)) return;

  const primaryInfo = await FileSystem.getInfoAsync(path);
  if (primaryInfo.exists && !primaryInfo.isDirectory) {
    await FileSystem.copyAsync({ from: path, to: backupPath });
  }
  try {
    await FileSystem.copyAsync({ from: tempPath, to: path });
    const readBack = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    if (readBack !== staged) throw new Error('AUTOSAVE_HISTORY_RECOVERY_VALIDATION_FAILED');
    await FileSystem.deleteAsync(tempPath, { idempotent: true });
  } catch (cause) {
    const backupInfo = await FileSystem.getInfoAsync(backupPath).catch(() => ({ exists: false, isDirectory: false }));
    if (backupInfo.exists && !backupInfo.isDirectory) {
      try { await FileSystem.copyAsync({ from: backupPath, to: path }); } catch { /* backup remains recoverable */ }
    }
    throw cause;
  }
}

async function writeAutoSaveHistorySafely(path: string, content: string): Promise<void> {
  const tempPath = path + '.tmp';
  const backupPath = path + '.previous';
  await FileSystem.writeAsStringAsync(tempPath, content, { encoding: FileSystem.EncodingType.UTF8 });
  const staged = await FileSystem.readAsStringAsync(tempPath, { encoding: FileSystem.EncodingType.UTF8 });
  if (staged !== content || !isValidHistoryContent(staged)) {
    throw new Error('AUTOSAVE_HISTORY_STAGING_VALIDATION_FAILED');
  }

  const targetInfo = await FileSystem.getInfoAsync(path);
  if (targetInfo.exists && !targetInfo.isDirectory) {
    await FileSystem.copyAsync({ from: path, to: backupPath });
  }
  let committed = false;
  try {
    await FileSystem.copyAsync({ from: tempPath, to: path });
    const readBack = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    if (readBack !== content || !isValidHistoryContent(readBack)) {
      throw new Error('AUTOSAVE_HISTORY_COMMIT_VALIDATION_FAILED');
    }
    committed = true;
  } catch (cause) {
    const backupInfo = await FileSystem.getInfoAsync(backupPath).catch(() => ({ exists: false, isDirectory: false }));
    if (backupInfo.exists && !backupInfo.isDirectory) {
      try { await FileSystem.copyAsync({ from: backupPath, to: path }); } catch { /* backup remains recoverable */ }
    }
    throw cause;
  } finally {
    if (committed) {
      try { await FileSystem.deleteAsync(tempPath, { idempotent: true }); } catch { /* cleaned on next write */ }
    }
  }
  try { await FileSystem.copyAsync({ from: path, to: backupPath }); } catch {
    // The primary history was verified; any earlier backup is still recoverable.
  }
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
  const hadImportedLearning = /CARSCANNER|seed_cycle_|seedSamples|seedVersion|seedWeight|fonte=HYBRID/i.test(entry);
  // Remove proveniência e amostras seed em snapshots antigos.
  let cleaned = entry
    .split(/\r?\n/)
    .filter((line) => !/CARSCANNER|seed_cycle_|seedSamples|seedVersion|seedWeight|fonte=HYBRID/i.test(line))
    .join('\n');

  if (hadImportedLearning) {
    // Médias antigas podem misturar seed + leituras reais e não são separáveis
    // com segurança. Remover o bloco inteiro evita apresentar números contaminados.
    cleaned = cleaned.replace(
      /\[LEARNING\]\r?\n[\s\S]*?(?=\r?\n\[[^\]\r\n]+\]|$)/,
      '[LEARNING]\nHistórico legado removido: estatísticas importadas não são evidência real.',
    );
  }

  const match = cleaned.match(/(\[HISTORY\]\r?\n)([\s\S]*?)(?=\r?\n\[[^\]\r\n]+\]|$)/);
  if (!match) return cleaned;
  const rows = match[2].split(/\r?\n/).filter((line) => line.trim() && !/seed|CARSCANNER/i.test(line));
  return cleaned.replace(match[0], match[1] + (rows.length ? rows.join('\n') : 'N/D'));
}

async function readAutoSaveHistoryUnsafe(basePath: string): Promise<string> {
  const path = historyPath(basePath);
  await recoverPendingAutoSaveHistoryWrite(path);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return HISTORY_HEADER;
  if (info.isDirectory) {
    throw new Error('O caminho do histórico de autosave aponta para um diretório; arquivo existente preservado.');
  }
  let content: string;
  try {
    content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    if (!isValidHistoryContent(content)) throw new Error('AUTOSAVE_HISTORY_INVALID_CONTENT');
  } catch (primaryCause) {
    const backupPath = path + '.previous';
    const backupInfo = await FileSystem.getInfoAsync(backupPath).catch(() => ({ exists: false, isDirectory: false }));
    if (!backupInfo.exists || backupInfo.isDirectory) {
      throw new Error('AUTOSAVE_HISTORY_UNREADABLE: histórico preservado. ' + (primaryCause instanceof Error ? primaryCause.message : String(primaryCause)));
    }
    const backup = await FileSystem.readAsStringAsync(backupPath, { encoding: FileSystem.EncodingType.UTF8 });
    if (!isValidHistoryContent(backup)) {
      throw new Error('AUTOSAVE_HISTORY_AND_BACKUP_INVALID: histórico original preservado.');
    }
    await FileSystem.copyAsync({ from: backupPath, to: path });
    content = backup;
  }
  const entries = deduplicateEntries(splitEntries(content))
    .slice(-AUTOSAVE_HISTORY_MAX_ENTRIES)
    .map(removeCarScannerTripsFromSnapshot);
  return entries.length ? `${HISTORY_HEADER}${entries.join('\n\n')}\n` : HISTORY_HEADER;
}

/** Reescreve o histórico legado já sanitizado; se a leitura falhar, não toca no arquivo original. */
export async function purgeLegacyCarScannerHistoryTxt(basePath: string): Promise<void> {
  const path = historyPath(basePath);
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return;
  if (info.isDirectory) throw new Error('O caminho do histórico TXT aponta para um diretório.');
  const sanitized = await readAutoSaveHistoryUnsafe(basePath);
  await writeAutoSaveHistorySafely(path, sanitized);
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
  const kept = [...entries, entry].slice(-AUTOSAVE_HISTORY_MAX_ENTRIES);
  await writeAutoSaveHistorySafely(path, `${HISTORY_HEADER}${kept.join('\n\n')}\n`);
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
