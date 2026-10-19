import { parseDtcResponseForService } from './dtcParser';
import { getPidDefinition } from './pidDefinition';
import { validatePidValue } from './formulaEngine';
import { parseReadinessMonitorResponse } from './readinessMonitor';
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
  interpretation?: string;
}

function normalizeHexStream(rawResponse: string): string {
  return rawResponse.replace(/[^0-9A-F]/gi, '').toUpperCase();
}

function findResponsePayload(rawResponse: string, pid: string, byteCount: number, positiveService = '41'): number[] {
  const stream = normalizeHexStream(rawResponse);
  const marker = `${positiveService}${pid.slice(-2)}`;
  const markerIndex = stream.indexOf(marker);
  if (markerIndex < 0) return [];

  const frameOffset = positiveService === '42' ? 2 : 0;
  const payloadStart = markerIndex + marker.length + frameOffset;
  const payloadHex = stream.slice(payloadStart, payloadStart + byteCount * 2);
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

export function validateOBDResponse(response: string, positiveService = '41'): boolean {
  if (!response.trim() || /NO DATA|UNABLE TO CONNECT|ERROR|BUS ERROR/i.test(response)) return false;
  return new RegExp(positiveService + '[0-9A-F]{2}', 'i').test(normalizeHexStream(response));
}

export function parsePidResponse(pidRequested: string, rawResponse: string, positiveService = '41'): ParsedPidResult {
  const pid = pidRequested.replace(/\s/g, '').toUpperCase();

  const definition = getPidDefinition(pid);

  if (!rawResponse.trim() || /NO DATA|UNABLE TO CONNECT|ERROR|BUS INIT|BUS ERROR/i.test(rawResponse)) {
    return {
      pid,
      name: definition?.name ?? `PID ${pid}`,
      value: null,
      unit: definition?.unit ?? 'SEM DADOS',
      rawResponse,
      rawBytes: [],
      status: 'NÃO RESPONDEU',
      errorMessage: 'ECU sem resposta válida',
      ...(definition ? { definition } : {}),
    };
  }

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

  if (!validateOBDResponse(rawResponse, positiveService)) {
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

  const data = findResponsePayload(rawResponse, pid, definition.bytes, positiveService);
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
  const interpretation = pid === '0101'
    ? parseReadinessMonitorResponse(rawResponse)?.summary ?? 'STATUS DE PRONTIDÃO NÃO INTERPRETADO'
    : undefined;
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
    interpretation,
  };
}

export { parseDtcResponseForService } from './dtcParser';

export function parseDtcResponse(rawResponse: string): string[] {
  return parseDtcResponseForService('03', rawResponse);
}
