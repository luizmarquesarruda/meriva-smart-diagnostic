import * as FileSystem from 'expo-file-system';
import { getPidDefinition, getPidReference, type PidClassification } from '../obd/pidDefinition';
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

function safeField(value: string | number | undefined): string {
  return String(value ?? '').replace(/[|\r\n]/g, ' ').trim();
}

function compactLine(entry: PidConfirmationEntry): string {
  return [
    entry.pid, entry.name, entry.classification, entry.status,
    entry.firstSeen, entry.lastSeen, entry.occurrences,
    entry.protocol, entry.responseTime, entry.source, entry.confidence,
    entry.unit, entry.formulaId, entry.bytes, entry.description,
  ].map(safeField).join('|');
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
        unit, formulaId, bytes, description,
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
        unit: unit || undefined,
        formulaId: formulaId || undefined,
        bytes: bytes && Number.isInteger(Number(bytes)) ? Number(bytes) : undefined,
        description: description || undefined,
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
 * Persiste somente PIDs que tiveram resposta real validada pelo decodificador.
 * Bitmap de suporte é pista para sondagem, nunca evidência suficiente para salvar.
 */
export async function recordDiscoveredPids(
  basePath: string,
  pids: string[],
  protocol: string,
  respondedPids: string[] = [],
): Promise<void> {
  const normalize = (value: string) => value.replace(/\s/g, '').toUpperCase();
  const responded = new Set(respondedPids.map(normalize));
  const unique = Array.from(new Set(pids.map(normalize)))
    .filter((pid) => responded.has(pid) && Boolean(getPidDefinition(pid)) && /^01[0-9A-F]{2}$/.test(pid))
    .sort();
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
      const definition = getPidDefinition(pid);
      const reference = getPidReference(pid);
      if (prior?.status === 'CONFIRMADO' || prior?.status === 'RESPONDEU') {
        byPid.set(pid, {
          ...prior,
          name: prior.name && prior.name !== 'PID DESCOBERTO' ? prior.name : definition?.name || reference?.name || prior.name,
          unit: prior.unit || definition?.unit || reference?.unit,
          formulaId: prior.formulaId || definition?.formulaId,
          bytes: prior.bytes || definition?.bytes,
          description: prior.description || definition?.description || reference?.description,
        });
        continue;
      }
      byPid.set(pid, {
        pid,
        name: prior?.name && prior.name !== 'PID DESCOBERTO' ? prior.name : definition?.name || reference?.name || 'PID DESCOBERTO',
        classification: prior?.classification || definition?.classification || 'PADRAO_OBD',
        status: 'RESPONDEU',
        firstSeen: prior?.firstSeen || now,
        lastSeen: now,
        occurrences: (prior?.occurrences || 0) + 1,
        protocol: protocol || prior?.protocol || 'N/D',
        responseTime: prior?.responseTime || 0,
        source: 'REAL_OBD',
        confidence: Math.max(prior?.confidence || 0, 0.85),
        unit: prior?.unit || definition?.unit || reference?.unit,
        formulaId: prior?.formulaId || definition?.formulaId,
        bytes: prior?.bytes || definition?.bytes,
        description: prior?.description || definition?.description || reference?.description,
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

/** Busca o registro persistido sem elevar suporte anunciado a confirmação de resposta. */
export async function lookupPidConfirmation(
  basePath: string,
  pid: string,
): Promise<PidConfirmationEntry | null> {
  const normalized = pid.replace(/\s/g, '').toUpperCase();
  if (!/^01[0-9A-F]{2}$/.test(normalized)) return null;
  const entries = await readPidConfirmations(basePath);
  return entries.find((entry) => entry.pid === normalized) ?? null;
}

export async function readPidConfirmations(
  basePath: string,
): Promise<PidConfirmationEntry[]> {
  const target = basePath + '/BANCO/pids_meriva_confirmados.txt';
  await (fileQueues.get(target) ?? Promise.resolve()).catch(() => undefined);
  return readPidConfirmationsUnlocked(basePath);
}
