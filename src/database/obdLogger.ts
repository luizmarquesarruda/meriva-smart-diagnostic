import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from './csvLogger';
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

export async function logRawObdData(basePath: string, query: PidQueryResult, pid: string, source: 'REAL' | 'SIMULACAO'): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const fileName = `obd_raw_${today}.csv`;
  const filePath = `${basePath}/LOGS/${fileName}`;

  const row: CsvRow = {
    timestamp: new Date().toISOString(),
    pid: pid,
    nome: query.parsed.name,
    valor: query.rx,
    unidade: source,
    rpm: query.elapsedMs,
    temperatura: undefined,
    velocidade: undefined,
    condicao: query.commandStatus,
  };

  await appendCsvRow(filePath, row);
}

export async function logInterpretedData(basePath: string, query: PidQueryResult, pid: string, source: 'REAL' | 'SIMULACAO'): Promise<void> {
  const today = new Date().toISOString().split('T')[0];
  const fileName = `obd_interpreted_${today}.csv`;
  const filePath = `${basePath}/LOGS/${fileName}`;

  const row: CsvRow = {
    timestamp: new Date().toISOString(),
    pid: pid,
    nome: query.parsed.name,
    valor: query.parsed.value ?? 'SEM_DADOS',
    unidade: query.parsed.unit,
    rpm: undefined,
    temperatura: undefined,
    velocidade: undefined,
    condicao: `${query.parsed.status}|${source}`,
  };

  await appendCsvRow(filePath, row);
}
