import * as FileSystem from 'expo-file-system';
import type { PidClassification } from '../obd/pidDefinition';
import type { DataSource } from '../types/sourceTypes';

export interface PidConfirmationEntry {
  pid: string;
  name: string;
  classification: PidClassification;
  status: 'CONFIRMADO' | 'RESPONDEU' | 'NAO_RESPONDEU';
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  protocol: string;
  responseTime: number;
  source: DataSource;
  confidence: number;
}

export async function recordPidConfirmation(basePath: string, entry: PidConfirmationEntry): Promise<void> {
  const target = `${basePath}/BANCO/pids_meriva_confirmados.txt`;
  await FileSystem.makeDirectoryAsync(`${basePath}/BANCO`, { intermediates: true });

  const line = [
    entry.pid,
    entry.name,
    entry.classification,
    entry.status,
    entry.firstSeen,
    entry.lastSeen,
    entry.occurrences,
    entry.protocol,
    entry.responseTime,
    entry.source,
    entry.confidence,
  ].join('|');

  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(target, `${line}\n`, { encoding: FileSystem.EncodingType.UTF8 });
    return;
  }

  const current = await FileSystem.readAsStringAsync(target);
  const lines = current.split('\n').filter((lineItem) => lineItem.trim());
  const updated = lines
    .map((lineItem) => (lineItem.startsWith(`${entry.pid}|`) ? line : lineItem))
    .filter((lineItem) => lineItem.trim());

  if (!updated.some((lineItem) => lineItem.startsWith(`${entry.pid}|`))) {
    updated.push(line);
  }

  await FileSystem.writeAsStringAsync(target, `${updated.join('\n')}\n`, {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function readPidConfirmations(basePath: string): Promise<PidConfirmationEntry[]> {
  const target = `${basePath}/BANCO/pids_meriva_confirmados.txt`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];

  const content = await FileSystem.readAsStringAsync(target);
  return content
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const [
        pid,
        name,
        classification,
        status,
        firstSeen,
        lastSeen,
        occurrences,
        protocol,
        responseTime,
        source,
        confidence,
      ] = line.split('|');

      const parsedClassification: PidClassification =
        classification === 'PADRAO_OBD' ||
        classification === 'MERIVA_CONFIRMADO' ||
        classification === 'MERIVA_NAO_CONFIRMADO' ||
        classification === 'DESCONHECIDO'
          ? classification
          : 'DESCONHECIDO';

      const parsedStatus: PidConfirmationEntry['status'] =
        status === 'CONFIRMADO' || status === 'RESPONDEU' || status === 'NAO_RESPONDEU'
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
