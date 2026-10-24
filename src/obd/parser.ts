import { parseDtcResponseForService } from './dtcParser';
import { getPidDefinition } from './pidDefinition';
import { decodeFormula, validatePidValue } from './formulaEngine';
import fuelTypesCatalog from '../knowledge/fuel_types.json';
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
  const fuelTypeCodes = fuelTypesCatalog.codes as Record<string, string>;
  const fuelTypeLabel = pid === '0151' ? fuelTypeCodes[String(data[0])] : undefined;
  if (pid === '0151' && !fuelTypeLabel) {
    return {
      pid, name: definition.name, value: null, unit: definition.unit, rawResponse, rawBytes,
      status: 'VALOR NÃO INTERPRETADO',
      errorMessage: 'Código de combustível não catalogado: ' + String(data[0]),
      definition,
    };
  }
  const interpretation = pid === '0101'
    ? (() => {
        const [a, b, supportedByte, incompleteByte] = data;
        const mil = (a & 0x80) !== 0;
        const dtcCount = a & 0x7f;
        const compressionIgnition = (b & 0x08) !== 0;
        const monitored: string[] = [];
        const incomplete: string[] = [];
        const continuousMonitors: Array<[string, number, number]> = [
          ['MISFIRE', 0x01, 0x10],
          ['FUEL_SYSTEM', 0x02, 0x20],
          ['COMPONENTES', 0x04, 0x40],
        ];
        for (const [name, supportMask, incompleteMask] of continuousMonitors) {
          if ((b & supportMask) !== 0) {
            const notReady = (b & incompleteMask) !== 0;
            monitored.push(name + ':' + (notReady ? 'NÃO PRONTO' : 'PRONTO'));
            if (notReady) incomplete.push(name);
          }
        }
        const ignitionMonitors: Array<[string, number]> = compressionIgnition
          ? [
              ['CATALISADOR_NMHC', 0x01], ['NOX/SCR', 0x02], ['PRESSAO_BOOST', 0x08],
              ['SENSOR_GASES_ESCAPE', 0x20], ['FILTRO_PARTICULAS', 0x40], ['EGR/VVT', 0x80],
            ]
          : [
              ['CATALISADOR', 0x01], ['CATALISADOR_AQUECIDO', 0x02], ['EVAP', 0x04],
              ['AR_SECUNDARIO', 0x08], ['FILTRO_PARTICULAS_GASOLINA', 0x10],
              ['O2', 0x20], ['AQUECEDOR_O2', 0x40], ['EGR/VVT', 0x80],
            ];
        for (const [name, mask] of ignitionMonitors) {
          if ((supportedByte & mask) !== 0) {
            const notReady = (incompleteByte & mask) !== 0;
            monitored.push(name + ':' + (notReady ? 'NÃO PRONTO' : 'PRONTO'));
            if (notReady) incomplete.push(name);
          }
        }
        return 'MIL=' + (mil ? 'ON' : 'OFF')
          + ' | DTCs=' + dtcCount
          + ' | MOTOR=' + (compressionIgnition ? 'DIESEL/CI' : 'CICLO OTTO/SI')
          + ' | MONITORES=' + (monitored.length ? monitored.join(', ') : 'NENHUM SUPORTADO')
          + ' | INCOMPLETOS=' + (incomplete.length ? incomplete.join(', ') : 'NENHUM');
      })()
    : pid === '0114'
      ? (() => {
          if (data[1] === 0xFF) {
            return 'TENSÃO O2 B1S1=' + value.toFixed(3) + ' V | STFT B1S1=NÃO UTILIZADA (B=FF)';
          }
          const trim = decodeFormula('FUEL_TRIM', '0106', [data[1]]);
          return 'TENSÃO O2 B1S1=' + value.toFixed(3) + ' V | STFT B1S1=' + trim.value.toFixed(2) + '%';
        })()
      : pid === '0151'
        ? 'Combustível reportado pela ECU: ' + fuelTypeLabel + ' (código ' + data[0] + ')'
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
