import { getPidDefinition } from './pidDefinition';
import type { PidDefinition } from './pidDefinition';

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
  const normalized = response.replace(/\s+/g, '').toUpperCase();
  return /^41[0-9A-F]{2}/.test(normalized) && !/NO DATA|UNABLE TO CONNECT|ERROR|BUS ERROR/i.test(response);
}

export function parsePidResponse(pidRequested: string, rawResponse: string): ParsedPidResult {
  const pid = pidRequested.replace(/\s/g, '').toUpperCase();

  if (!rawResponse.trim() || /NO DATA|UNABLE TO CONNECT|ERROR/i.test(rawResponse)) {
    return {
      pid,
      name: 'DESCONHECIDO',
      value: null,
      unit: 'SEM DADOS',
      rawResponse,
      rawBytes: [],
      status: 'NÃO RESPONDEU',
      errorMessage: 'ECU sem resposta válida',
    };
  }

  const definition = getPidDefinition(pid);
  const rawBytes = extractHexBytes(rawResponse);
  const headerIndex = rawBytes.findIndex(
    (byte, index) =>
      byte === 0x41 &&
      rawBytes[index + 1] === Number.parseInt(pid.slice(-2), 16),
  );

  if (!definition) {
    return {
      pid,
      name: 'PID DESCONHECIDO',
      value: null,
      unit: 'SEM DADOS',
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: 'PID não está no banco de definições',
    };
  }

  if (!validateOBDResponse(rawResponse) || headerIndex < 0) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: 'Resposta não contém cabeçalho 41/PID esperado',
      definition,
    };
  }

  const data = rawBytes.slice(headerIndex + 2, headerIndex + 2 + definition.bytes);
  if (data.length !== definition.bytes) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: `Esperado ${definition.bytes} byte(s), recebido ${data.length}`,
      definition,
    };
  }

  const value = definition.formula(data);
  if (!Number.isFinite(value)) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: 'Fórmula produziu valor inválido',
      definition,
    };
  }

  return {
    pid,
    name: definition.name,
    value,
    unit: definition.unit,
    rawResponse,
    rawBytes,
    status: 'RESPONDEU',
    definition,
  };
}

export function parseDtcResponse(rawResponse: string): string[] {
  const rawBytes = extractHexBytes(rawResponse);
  const headerIndex = rawBytes.findIndex((byte) => byte === 0x43);
  if (headerIndex < 0) return [];

  const data = rawBytes.slice(headerIndex + 1);
  const codes: string[] = [];

  for (let index = 0; index + 1 < data.length; index += 2) {
    const high = data[index];
    const low = data[index + 1];
    if (high === 0 && low === 0) continue;

    const type = ['P', 'C', 'B', 'U'][(high >> 6) & 0x03];
    const digit1 = (high >> 4) & 0x03;
    const digit2 = high & 0x0f;
    const digit3 = (low >> 4) & 0x0f;
    const digit4 = low & 0x0f;
    codes.push(
      `${type}${digit1.toString(16).toUpperCase()}${digit2.toString(16).toUpperCase()}${digit3.toString(16).toUpperCase()}${digit4.toString(16).toUpperCase()}`,
    );
  }

  return codes;
}
