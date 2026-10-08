import { parseDtcResponseForService } from './dtcParser';
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
  interpretation?: string;
}

function normalizeHexStream(rawResponse: string): string {
  const withoutPrompt = rawResponse.replace(/>/g, ' ');
  const runs = withoutPrompt.match(/(?:[0-9A-F]{2}(?:\s*)?){2,}/gi) ?? [];
  return runs
    .map((run) => run.replace(/\s+/g, '').toUpperCase())
    .join('');
}

function normalizeRawResponse(rawResponse: string): string {
  return rawResponse
    .replace(/>/g, '')
    .replace(/\\r/g, '\n')
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean)
    .join('\n');
}

function findResponsePayload(rawResponse: string, pid: string, byteCount: number, positiveService = '41'): number[] {
  const stream = normalizeHexStream(normalizeRawResponse(rawResponse));
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
  const normalized = normalizeRawResponse(response);
  if (!normalized || /NO DATA|UNABLE TO CONNECT|ERROR|BUS ERROR/i.test(normalized)) return false;
  return new RegExp(positiveService + '[0-9A-F]{2}', 'i').test(normalizeHexStream(normalized));
}

export function parsePidResponse(pidRequested: string, rawResponse: string, positiveService = '41'): ParsedPidResult {
  const pid = pidRequested.replace(/\s/g, '').toUpperCase();

  const definition = getPidDefinition(pid);

  const normalizedResponse = normalizeRawResponse(rawResponse);
  const hasPositiveFrame = validateOBDResponse(normalizedResponse, positiveService);
  if (!normalizedResponse || (!hasPositiveFrame && /NO DATA|UNABLE TO CONNECT|ERROR|BUS INIT|BUS ERROR/i.test(normalizedResponse))) {
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

  if (!definition) {
    const rawBytes = extractHexBytes(rawResponse);
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
  const rawBytes = data.slice();
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
    ? (() => {
        const [a, b, readinessSupported, readiness] = data;
        const mil = (a & 0x80) !== 0;
        const dtcCount = a & 0x7f;
        const compressionIgnition = (b & 0x08) !== 0;
        const catalystSupported = (readinessSupported & 0x01) !== 0;
        const catalystIncomplete = (readiness & 0x01) !== 0;
        const incomplete = [
          ['MISFIRE', (b & 0x10) !== 0],
          ['FUEL_SYSTEM', (b & 0x20) !== 0],
          ['COMPONENTES', (b & 0x40) !== 0],
          ['CATALISADOR', catalystSupported && catalystIncomplete],
          ['CATALISADOR_AQUECIDO', (readinessSupported & 0x02) !== 0 && (readiness & 0x02) !== 0],
          ['EVAP', (readinessSupported & 0x04) !== 0 && (readiness & 0x04) !== 0],
          ['AR_SECUNDARIO', (readinessSupported & 0x08) !== 0 && (readiness & 0x08) !== 0],
          ['O2', (readinessSupported & 0x20) !== 0 && (readiness & 0x20) !== 0],
          ['AQUECEDOR_O2', (readinessSupported & 0x40) !== 0 && (readiness & 0x40) !== 0],
          ['EGR/VVT', (readinessSupported & 0x80) !== 0 && (readiness & 0x80) !== 0],
        ].filter(([, notReady]) => notReady).map(([name]) => name);
        return 'MIL=' + (mil ? 'ON' : 'OFF')
          + ' | DTCs=' + dtcCount
          + ' | MOTOR=' + (compressionIgnition ? 'DIESEL/CI' : 'CICLO OTTO/SI')
          + ' | CATALISADOR=' + (catalystSupported ? (catalystIncomplete ? 'NÃO PRONTO' : 'PRONTO') : 'NÃO SUPORTADO')
          + ' | INCOMPLETOS=' + (incomplete.length ? incomplete.join(', ') : 'NENHUM');
      })()
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
