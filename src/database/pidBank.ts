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

async function readPidConfirmationsUnlocked(basePath: string): Promise<PidConfirmationEntry[]> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];

  const content = await FileSystem.readAsStringAsync(target);
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [
        pid, name, classification, status, firstSeen, lastSeen,
        occurrences, protocol, responseTime, source, confidence,
      ] = line.split('|');

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

      return {
        pid: pid ?? '',
        name: name ?? '',
        classification: parsedClassification,
        status: parsedStatus,
        firstSeen: firstSeen ?? '',
        lastSeen: lastSeen ?? '',
        occurrences: Number.isFinite(Number(occurrences)) ? Number(occurrences) : 0,
        protocol: protocol ?? 'N/D',
        responseTime: Number.isFinite(Number(responseTime)) ? Number(responseTime) : 0,
        source: parsedSource,
        confidence: Number.isFinite(Number(confidence)) ? Number(confidence) : 0,
      };
    })
    .filter((entry) => Boolean(entry.pid));
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
  const unique = Array.from(new Set(pids.map((value) => value.toUpperCase()))).sort();
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

export async function readPidConfirmations(
  basePath: string,
): Promise<PidConfirmationEntry[]> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  await (fileQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
  return readPidConfirmationsUnlocked(basePath);
}
