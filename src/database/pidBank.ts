import * as FileSystem from 'expo-file-system';
import type { PidClassification } from '../obd/pidDefinition';
import type { DataSource } from '../types/sourceTypes';

export interface PidConfirmationEntry {
  pid: string;
  name: string;
  classification: PidClassification;
  status: 'CONFIRMADO' | 'RESPONDEU' | 'NAO_RESPONDEU' | 'DESCOBERTO';
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  protocol: string;
  responseTime: number;
  source: DataSource;
  confidence: number;
  unit?: string;
  formulaId?: string;
  bytes?: number;
  description?: string;
}

const fileQueues = new Map<string, Promise<void>>();

function compactLine(entry: PidConfirmationEntry): string {
  return [
    entry.pid, entry.name, entry.classification, entry.status,
    entry.firstSeen, entry.lastSeen, entry.occurrences,
    entry.protocol, entry.responseTime, entry.source, entry.confidence,
  ].join('|');
}

function parsePidConfirmationLine(line: string): PidConfirmationEntry | null {
  const [
    rawPid, name, classification, status, firstSeen, lastSeen,
    occurrences, protocol, responseTime, source, confidence,
  ] = line.split('|');
  const pid = typeof rawPid === 'string' ? rawPid.replace(/\s/g, '').toUpperCase() : '';
  if (!/^[0-9A-F]{4}$/.test(pid)) return null;

  const parsedClassification: PidClassification =
    classification === 'PADRAO_OBD' ||
    classification === 'MERIVA_CONFIRMADO' ||
    classification === 'MERIVA_NAO_CONFIRMADO' ||
    classification === 'DESCONHECIDO'
      ? classification
      : 'DESCONHECIDO';
  const parsedStatus: PidConfirmationEntry['status'] =
    status === 'CONFIRMADO' ||
    status === 'RESPONDEU' ||
    status === 'NAO_RESPONDEU' ||
    status === 'DESCOBERTO'
      ? status
      : 'NAO_RESPONDEU';
  const parsedSource: DataSource =
    source === 'REAL_OBD' ||
    source === 'CARSCANNER_BASELINE' ||
    source === 'USER_REAL_OBSERVATION' ||
    source === 'SIMULACAO' ||
    source === 'IMPORTADO'
      ? source
      : 'IMPORTADO';
  const parsedOccurrences = Number(occurrences);
  const parsedResponseTime = Number(responseTime);
  const parsedConfidence = Number(confidence);

  return {
    pid,
    name: name ?? '',
    classification: parsedClassification,
    status: parsedStatus,
    firstSeen: firstSeen ?? '',
    lastSeen: lastSeen ?? '',
    occurrences: Number.isFinite(parsedOccurrences) && parsedOccurrences >= 0 ? parsedOccurrences : 0,
    protocol: protocol ?? 'N/D',
    responseTime: Number.isFinite(parsedResponseTime) && parsedResponseTime >= 0 ? parsedResponseTime : 0,
    source: parsedSource,
    confidence: Number.isFinite(parsedConfidence) && parsedConfidence >= 0 ? parsedConfidence : 0,
  };
}

/** The operational PID bank contains only evidence discovered/confirmed from a live ECU. */
async function readPidConfirmationsUnlocked(basePath: string): Promise<PidConfirmationEntry[]> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];
  if (info.isDirectory) throw new Error('PID_BANK_IS_DIRECTORY');

  const content = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
  return content.split(/\r?\n/)
    .filter((line) => line.trim())
    .map(parsePidConfirmationLine)
    .filter((entry): entry is PidConfirmationEntry => entry !== null && entry.source === 'REAL_OBD');
}

async function writeCompactFile(target: string, entries: PidConfirmationEntry[]): Promise<void> {
  const compact = entries
    .filter((entry) => entry.pid)
    .sort((a, b) => a.pid.localeCompare(b.pid))
    .map(compactLine)
    .join('\n');
  await FileSystem.writeAsStringAsync(target, compact ? compact + '\n' : '', {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function recordPidConfirmation(
  basePath: string,
  entry: PidConfirmationEntry,
): Promise<void> {
  if (entry.source !== 'REAL_OBD') throw new Error('NON_REAL_PID_NOT_ALLOWED_IN_OPERATIONAL_BANK');
  if (!/^[0-9A-F]{4}$/i.test(entry.pid)) throw new Error('INVALID_PID_CONFIRMATION_ID');
  if (!Number.isFinite(entry.occurrences) || entry.occurrences < 0 ||
      !Number.isFinite(entry.responseTime) || entry.responseTime < 0 ||
      !Number.isFinite(entry.confidence) || entry.confidence < 0) {
    throw new Error('INVALID_PID_CONFIRMATION_METRICS');
  }
  entry = { ...entry, pid: entry.pid.toUpperCase(), source: 'REAL_OBD' };
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  const previous = fileQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    await FileSystem.makeDirectoryAsync(basePath + '/BANCO', { intermediates: true });
    const existing = await readPidConfirmationsUnlocked(basePath);
    const byPid = new Map(existing.map((item) => [item.pid, item]));
    byPid.set(entry.pid, entry);
    await writeCompactFile(target, Array.from(byPid.values()));
  });

  fileQueues.set(target, current);
  try {
    await current;
  } finally {
    if (fileQueues.get(target) === current) fileQueues.delete(target);
  }
}

/**
 * Salva PIDs anunciados pela bitmap OBD.
 * DESCOBERTO não significa CONFIRMADO: é apenas suporte anunciado pela ECU.
 */
export async function recordDiscoveredPids(
  basePath: string,
  pids: string[],
  protocol: string,
): Promise<void> {
  const unique = Array.from(new Set(pids.map((value) => value.replace(/\s/g, '').toUpperCase()).filter((value) => /^[0-9A-F]{4}$/.test(value)))).sort();
  if (!unique.length) return;

  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  const previous = fileQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    await FileSystem.makeDirectoryAsync(basePath + '/BANCO', { intermediates: true });
    const existing = await readPidConfirmationsUnlocked(basePath);
    const byPid = new Map(existing.map((item) => [item.pid, item]));
    const now = new Date().toISOString();

    for (const pid of unique) {
      const prior = byPid.get(pid);
      if (prior?.status === 'CONFIRMADO' || prior?.status === 'RESPONDEU') continue;
      byPid.set(pid, {
        pid,
        name: prior?.name || 'PID DESCOBERTO',
        classification: prior?.classification || 'PADRAO_OBD',
        status: 'DESCOBERTO',
        firstSeen: prior?.firstSeen || now,
        lastSeen: now,
        occurrences: (prior?.occurrences || 0) + 1,
        protocol: protocol || prior?.protocol || 'N/D',
        responseTime: prior?.responseTime || 0,
        source: 'REAL_OBD',
        confidence: prior?.confidence || 0,
      });
    }

    await writeCompactFile(target, Array.from(byPid.values()));
  });

  fileQueues.set(target, current);
  try {
    await current;
  } finally {
    if (fileQueues.get(target) === current) fileQueues.delete(target);
  }
}

/**
 * Remove obsolete/imported entries from the legacy PID bank. A valid current
 * backup is produced only after staged content passes a source/shape check.
 */
export async function purgeLegacyNonRealPidConfirmations(basePath: string): Promise<void> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  const previous = fileQueues.get(target) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists) return;
    if (info.isDirectory) throw new Error('PID_BANK_IS_DIRECTORY');
    const content = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
    const realEntries = content.split(/\r?\n/)
      .filter((line) => line.trim())
      .map(parsePidConfirmationLine)
      .filter((entry): entry is PidConfirmationEntry => entry !== null && entry.source === 'REAL_OBD')
      .map((entry) => ({ ...entry, source: 'REAL_OBD' as const }));
    const compact = realEntries
      .sort((a, b) => a.pid.localeCompare(b.pid))
      .map(compactLine)
      .join('\n');
    const output = compact ? compact + '\n' : '';
    if (content === output) return;

    const temp = target + '.tmp';
    const backup = target + '.previous';
    await FileSystem.writeAsStringAsync(temp, output, { encoding: FileSystem.EncodingType.UTF8 });
    const staged = await FileSystem.readAsStringAsync(temp, { encoding: FileSystem.EncodingType.UTF8 });
    const stagedEntries = staged.split(/\r?\n/).filter((line) => line.trim()).map(parsePidConfirmationLine);
    if (staged !== output || stagedEntries.some((entry) => !entry || entry.source !== 'REAL_OBD')) {
      throw new Error('PID_BANK_PURGE_STAGING_FAILED');
    }

    await FileSystem.copyAsync({ from: target, to: backup });
    let committed = false;
    try {
      await FileSystem.copyAsync({ from: temp, to: target });
      const readBack = await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 });
      if (readBack !== output) throw new Error('PID_BANK_PURGE_COMMIT_FAILED');
      committed = true;
    } catch (cause) {
      try { await FileSystem.copyAsync({ from: backup, to: target }); } catch { /* leave recovery copy available */ }
      throw cause;
    } finally {
      if (committed) {
        try { await FileSystem.deleteAsync(temp, { idempotent: true }); } catch { /* cleaned on next startup */ }
      }
    }
    // Replace the temporary rollback copy with the sanitized last-known-good bank.
    await FileSystem.copyAsync({ from: target, to: backup });
  });
  fileQueues.set(target, current);
  try {
    await current;
  } finally {
    if (fileQueues.get(target) === current) fileQueues.delete(target);
  }
}

export async function readPidConfirmations(
  basePath: string,
): Promise<PidConfirmationEntry[]> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  await (fileQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
  return readPidConfirmationsUnlocked(basePath);
}
