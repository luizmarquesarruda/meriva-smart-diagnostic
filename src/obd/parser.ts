import { getPidDefinition } from './pidDefinition';
import { validatePidValue } from './formulaEngine';
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

function normalizeHexStream(rawResponse: string): string {
  return rawResponse.replace(/[^0-9A-F]/gi, '').toUpperCase();
}

function findResponsePayload(rawResponse: string, pid: string, byteCount: number): number[] {
  const stream = normalizeHexStream(rawResponse);
  const marker = `41${pid.slice(-2)}`;
  const markerIndex = stream.indexOf(marker);
  if (markerIndex < 0) return [];

  const payloadHex = stream.slice(markerIndex + marker.length, markerIndex + marker.length + byteCount * 2);
  if (payloadHex.length !== byteCount * 2 || !/^[0-9A-F]+$/.test(payloadHex)) return [];

  const bytes: number[] = [];
  for (let index = 0; index < payloadHex.length; index += 2) {
    bytes.push(Number.parseInt(payloadHex.slice(index, index + 2), 16));
  }
  return bytes;
}

export function extractHexBytes(rawResponse: string): number[] {
  const tokens = rawResponse.toUpperCase().match(/(?:^|\s)([0-9A-F]{2})(?=\s|$)/g) ?? [];
  return tokens.map((token) => Number.parseInt(token.trim(), 16));
}

export function validateOBDResponse(response: string): boolean {
  if (!response.trim() || /NO DATA|UNABLE TO CONNECT|ERROR|BUS ERROR/i.test(response)) return false;
  return /41[0-9A-F]{2}/i.test(normalizeHexStream(response));
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

  if (!validateOBDResponse(rawResponse)) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: 'Resposta não contém resposta OBD positiva',
      definition,
    };
  }

  const data = findResponsePayload(rawResponse, pid, definition.bytes);
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
  const validation = validatePidValue(pid, value);
  if (!validation.valid) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: validation.reason,
      definition,
    };
  }

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

export function parseDtcResponseForService(
  service: '03' | '07' | '0A',
  rawResponse: string,
): string[] {
  const stream = normalizeHexStream(rawResponse);
  const serviceNumber = Number.parseInt(service, 16);
  const positiveHeader = (0x40 + serviceNumber).toString(16).padStart(2, '0').toUpperCase();
  const headerIndex = stream.indexOf(positiveHeader);
  if (headerIndex < 0) return [];

  const rawData = stream.slice(headerIndex + positiveHeader.length);
  // DTCs são sempre pares de bytes, então descartamos a sobra incompleta.
  const usableLength = rawData.length - (rawData.length % 4);
  const data = rawData.slice(0, usableLength);
  const codes: string[] = [];

  for (let index = 0; index + 3 < data.length; index += 4) {
    const high = Number.parseInt(data.slice(index, index + 2), 16);
    const low = Number.parseInt(data.slice(index + 2, index + 4), 16);
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

export function parseDtcResponse(rawResponse: string): string[] {
  return parseDtcResponseForService('03', rawResponse);
}
