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
    ? (() => {
        const [a, b, readinessSupported, readiness] = data;
        const mil = (a & 0x80) !== 0;
        const dtcCount = a & 0x7f;
        const compressionIgnition = (b & 0x08) !== 0;
        // Bytes C/D use different monitor bit assignments for spark-ignition
        // and compression-ignition engines. Decoding both as gasoline creates
        // fictitious EVAP/O2 readiness results on diesel ECUs.
        const monitorBits: Array<[string, number]> = compressionIgnition
          ? [
              ['CATALISADOR_NMHC', 0],
              ['NOX_SCR', 1],
              ['PRESSAO_TURBO', 3],
              ['SENSOR_GASES_ESCAPE', 5],
              ['FILTRO_PARTICULAS', 6],
              ['EGR/VVT', 7],
            ]
          : [
              ['CATALISADOR', 0],
              ['CATALISADOR_AQUECIDO', 1],
              ['EVAP', 2],
              ['AR_SECUNDARIO', 3],
              ['FILTRO_PARTICULAS_GASOLINA', 4],
              ['O2', 5],
              ['AQUECEDOR_O2', 6],
              ['EGR/VVT', 7],
            ];
        const incompleteEntries: Array<[string, boolean]> = [
          ['MISFIRE', (b & 0x10) !== 0],
          ['FUEL_SYSTEM', (b & 0x20) !== 0],
          ['COMPONENTES', (b & 0x40) !== 0],
          ...monitorBits.map(([name, bit]): [string, boolean] => {
            const mask = 1 << bit;
            return [name, (readinessSupported & mask) !== 0 && (readiness & mask) !== 0];
          }),
        ];
        const incomplete = incompleteEntries.filter(([, notReady]) => notReady).map(([name]) => name);
        const primaryMonitorName = compressionIgnition ? 'CATALISADOR_NMHC' : 'CATALISADOR';
        const catalystSupported = (readinessSupported & 0x01) !== 0;
        const catalystIncomplete = (readiness & 0x01) !== 0;
        return 'MIL=' + (mil ? 'ON' : 'OFF')
          + ' | DTCs=' + dtcCount
          + ' | MOTOR=' + (compressionIgnition ? 'DIESEL/CI' : 'CICLO OTTO/SI')
          + ' | ' + primaryMonitorName + '=' + (catalystSupported ? (catalystIncomplete ? 'NÃO PRONTO' : 'PRONTO') : 'NÃO SUPORTADO')
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
