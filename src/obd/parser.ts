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
  const interpretation = pid === '0101'
    ? (() => {
        const [a, b, c, d] = data;
        const mil = (a & 0x80) !== 0;
        const dtcCount = a & 0x7f;
        const sparkIncomplete = ['CATALYST', 'HEATED_CATALYST', 'EVAP', 'SECONDARY_AIR', 'O2_SENSOR', 'O2_HEATER', 'EGR'].filter((_, index) => (b & (0x20 >> index)) !== 0);
        const compressionIncomplete = ['NMHC_CATALYST', 'NOX_SCR', 'BOOST', 'PM_FILTER', 'EXHAUST_GAS_SENSOR', 'EGR'].filter((_, index) => (d & (0x20 >> index)) !== 0);
        const incomplete = sparkIncomplete.length ? sparkIncomplete : compressionIncomplete;
        return 'MIL=' + (mil ? 'ON' : 'OFF') + ' | DTCs=' + dtcCount + ' | MONITORES=' + (incomplete.length ? 'INCOMPLETOS: ' + incomplete.join(', ') : 'PRONTOS');
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
