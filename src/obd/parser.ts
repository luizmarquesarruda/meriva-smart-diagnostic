import { getPidDefinition, PidDefinition } from './pidDefinition';

export type ParseStatus = 'RESPONDEU' | 'NÃO RESPONDEU' | 'VALOR NÃO INTERPRETADO';
export interface ParsedPidResult {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  rawResponse: string;
  rawBytes: number[];
  status: ParseStatus;
  errorMessage?: string;
  definition?: PidDefinition;
}

export function extractHexBytes(rawResponse: string): number[] {
  const tokens = rawResponse.toUpperCase().match(/[0-9A-F]{2}/g) ?? [];
  return tokens.map((token) => Number.parseInt(token, 16));
}

export function validateOBDResponse(response: string): boolean {
  return /(?:^|\s)41\s+[0-9A-F]{2}(?:\s|$)/i.test(response) && !/NO DATA/i.test(response);
}

export function parsePidResponse(pidRequested: string, rawResponse: string): ParsedPidResult {
  const pid = pidRequested.replace(/\s/g, '').toUpperCase();
  if (!rawResponse.trim() || /NO DATA|UNABLE TO CONNECT|ERROR/i.test(rawResponse)) {
    return { pid, name: 'DESCONHECIDO', value: null, unit: 'SEM DADOS', rawResponse, rawBytes: [], status: 'NÃO RESPONDEU', errorMessage: 'ECU sem resposta válida' };
  }
  const definition = getPidDefinition(pid);
  const rawBytes = extractHexBytes(rawResponse);
  const headerIndex = rawBytes.findIndex((byte, index) => byte === 0x41 && rawBytes[index + 1] === Number.parseInt(pid.slice(-2), 16));
  if (!definition) {
    return { pid, name: 'PID DESCONHECIDO', value: null, unit: 'SEM DADOS', rawResponse, rawBytes, status: 'VALOR NÃO INTERPRETADO', errorMessage: 'PID não está no banco de definições' };
  }
  if (!validateOBDResponse(rawResponse) || headerIndex < 0) {
    return { pid, name: definition.name, value: null, unit: definition.unit, rawResponse, rawBytes, status: 'VALOR NÃO INTERPRETADO', errorMessage: 'Resposta não contém cabeçalho 41/PID esperado', definition };
  }
  const data = rawBytes.slice(headerIndex + 2, headerIndex + 2 + definition.bytes);
  if (data.length !== definition.bytes) {
    return { pid, name: definition.name, value: null, unit: definition.unit, rawResponse, rawBytes, status: 'VALOR NÃO INTERPRETADO', errorMessage: `Esperado ${definition.bytes} byte(s), recebido ${data.length}`, definition };
  }
  const value = definition.formula(data);
  if (!Number.isFinite(value)) {
    return { pid, name: definition.name, value: null, unit: definition.unit, rawResponse, rawBytes, status: 'VALOR NÃO INTERPRETADO', errorMessage: 'Fórmula produziu valor inválido', definition };
  }
  return { pid, name: definition.name, value, unit: definition.unit, rawResponse, rawBytes, status: 'RESPONDEU', definition };
}
