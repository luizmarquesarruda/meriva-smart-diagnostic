import * as FileSystem from 'expo-file-system';
import { queueCsvRow, CsvRow } from './csvLogger';
import { PidQueryResult } from '../obd/elm327';

export interface RawObdLogEntry {
  timestamp: string;
  tx: string;
  rx: string;
  pid: string;
  responseTimeMs: number;
  commandStatus: 'OK' | 'TIMEOUT' | 'ERROR' | 'NO_RESPONSE';
  protocol: string;
  source: 'REAL' | 'SIMULACAO';
}

/** Uses device-local date for daily file partitioning; timestamps stay ISO UTC. */
export function getObdLogLocalDateKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export async function logRawObdData(
  basePath: string,
  query: PidQueryResult,
  pid: string,
  source: 'REAL' | 'SIMULACAO',
): Promise<void> {
  const today = getObdLogLocalDateKey();
  const fileName = `obd_raw_${today}.csv`;
  const filePath = `${basePath}/LOGS/${fileName}`;

  const row: CsvRow = {
    timestamp: new Date().toISOString(),
    tx: query.tx,
    rx: query.rx,
    pid,
    responseTimeMs: query.elapsedMs,
    commandStatus: query.commandStatus,
    protocol: query.protocol ?? 'N/D',
    source,
  };

  queueCsvRow(filePath, row);
}

export async function logInterpretedData(
  basePath: string,
  query: PidQueryResult,
  pid: string,
  source: 'REAL' | 'SIMULACAO',
): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const fileName = `obd_interpreted_${today}.csv`;
  const filePath = `${basePath}/LOGS/${fileName}`;

  const row: CsvRow = {
    timestamp: new Date().toISOString(),
    tx: query.tx,
    rx: query.rx,
    pid,
    nome: query.parsed.name,
    valor: query.parsed.value ?? 'SEM_DADOS',
    unidade: query.parsed.unit,
    responseTimeMs: query.elapsedMs,
    commandStatus: query.commandStatus,
    protocol: query.protocol ?? 'N/D',
    source,
    condicao: query.parsed.status,
  };

  queueCsvRow(filePath, row);
}
