import * as FileSystem from 'expo-file-system';
import { TxtEntry } from './txtDatabase';

export interface PidConfirmationEntry {
  pid: string;
  name: string;
  classification: 'PADRAO_OBD' | 'MERIVA_CONFIRMADO' | 'MERIVA_NAO_CONFIRMADO' | 'DESCONHECIDO';
  status: 'CONFIRMADO' | 'RESPONDEU' | 'NAO_RESPONDEU';
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  protocol: string;
  responseTime: number;
  source: string;
  confidence: number;
}

export async function recordPidConfirmation(basePath: string, entry: PidConfirmationEntry): Promise<void> {
  const target = `${basePath}/BANCO/pids_meriva_confirmados.txt`;
  const line = `${entry.pid}|${entry.name}|${entry.classification}|${entry.status}|${entry.firstSeen}|${entry.lastSeen}|${entry.occurrences}|${entry.protocol}|${entry.responseTime}|${entry.source}|${entry.confidence}`;
  
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) {
    await FileSystem.writeAsStringAsync(target, `${line}\n`, { encoding: FileSystem.EncodingType.UTF8 });
    return;
  }

  const current = await FileSystem.readAsStringAsync(target);
  const lines = current.split('\n').filter((l) => l.trim());
  const updated = lines.map((l) => {
    if (l.startsWith(entry.pid + '|')) {
      return line;
    }
    return l;
  });
  if (!updated.some((l) => l.startsWith(entry.pid + '|'))) {
    updated.push(line);
  }
  await FileSystem.writeAsStringAsync(target, updated.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readPidConfirmations(basePath: string): Promise<PidConfirmationEntry[]> {
  const target = `${basePath}/BANCO/pids_meriva_confirmados.txt`;
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists) return [];

  const content = await FileSystem.readAsStringAsync(target);
  return content.split('\n').filter((l) => l.trim()).map((line) => {
    const [pid, name, classification, status, firstSeen, lastSeen, occurrences, protocol, responseTime, source, confidence] = line.split('|');
    return {
      pid,
      name,
      classification: classification as any,
      status: status as any,
      firstSeen,
      lastSeen,
      occurrences: Number(occurrences),
      protocol,
      responseTime: Number(responseTime),
      source,
      confidence: Number(confidence),
    };
  });
}
