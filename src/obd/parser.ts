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

function hasValidKLineChecksum(frameHex: string, checksumHex: string): boolean {
  const frame = frameHex.toUpperCase();
  const checksum = checksumHex.toUpperCase();
  if (!/^(?:[0-9A-F]{2})+$/.test(frame) || !/^[0-9A-F]{2}$/.test(checksum)) return false;
  let sum = 0;
  for (let offset = 0; offset < frame.length; offset += 2) {
    sum = (sum + Number.parseInt(frame.slice(offset, offset + 2), 16)) & 0xFF;
  }
  return sum === Number.parseInt(checksum, 16);
}

function findResponsePayload(rawResponse: string, pid: string, byteCount: number, positiveService = '41'): number[] {
  const service = positiveService.toUpperCase();
  const requestedPid = pid.slice(-2).toUpperCase();
  const serviceOffsetBytes = service === '42' ? 1 : 0;

  // Keep response lines separate so adapter chatter cannot be joined to payload bytes.
  for (const line of rawResponse.split(/[\r\n]+/)) {
    const compactLine = line.trim().toUpperCase();
    if (/^[0-9A-F]+$/.test(compactLine)) {
      // ELM adapters may emit compact hex such as 410C1AF8. Validate its exact
      // payload length just as strictly as a space-separated response.
      const marker = service + requestedPid;
      let markerIndex = compactLine.indexOf(marker);
      while (markerIndex >= 0) {
        const prefix = compactLine.slice(0, markerIndex);
        const payloadStart = markerIndex + marker.length + serviceOffsetBytes * 2;
        const payloadHex = compactLine.slice(payloadStart, payloadStart + byteCount * 2);
        const trailingHex = compactLine.slice(payloadStart + byteCount * 2);
        const expectedCanDlc = (byteCount + 2 + serviceOffsetBytes).toString(16).padStart(2, '0').toUpperCase();
        const can11BitFrame = /^[0-9A-F]{3}[0-9A-F]{2}$/.test(prefix)
          && prefix.slice(3) === expectedCanDlc;
        const can29BitFrame = /^[0-9A-F]{8}[0-9A-F]{2}$/.test(prefix)
          && prefix.slice(8) === expectedCanDlc;
        const acceptedPrefix = prefix.length === 0
          || can11BitFrame
          || can29BitFrame
          || prefix === '486B10';
        // KWP fast-init can return a compact 3-byte header such as 84F111.
        // The low six bits of the format byte declare the service/PID/data
        // length; KWP frames must also carry a valid additive checksum.
        const compactKwpHeader = /^8[0-9A-F]{5}$/.test(prefix)
          && (Number.parseInt(prefix.slice(0, 2), 16) & 0x3F) === Number.parseInt(expectedCanDlc, 16);
        const compactKwpChecksum = compactKwpHeader
          && trailingHex.length === 2
          && hasValidKLineChecksum(
            compactLine.slice(0, payloadStart + byteCount * 2),
            trailingHex,
          );
        // Older ISO/K-line adapters may use the 48 6B 10 envelope instead.
        const compactKLineChecksum = prefix === '486B10'
          && trailingHex.length === 2
          && hasValidKLineChecksum(
            compactLine.slice(0, payloadStart + byteCount * 2),
            trailingHex,
          );
        if (
          payloadHex.length === byteCount * 2 &&
          ((trailingHex.length === 0 && acceptedPrefix) || compactKLineChecksum || compactKwpChecksum) &&
          /^[0-9A-F]+$/.test(payloadHex)
        ) {
          const bytes: number[] = [];
          for (let offset = 0; offset < payloadHex.length; offset += 2) {
            bytes.push(Number.parseInt(payloadHex.slice(offset, offset + 2), 16));
          }
          return bytes;
        }
        markerIndex = compactLine.indexOf(marker, markerIndex + 1);
      }
      continue;
    }

    const lineText = line.trim().toUpperCase();
    const tokens = lineText.match(/\b[0-9A-F]{2}\b/g) ?? [];
    const canHeader = lineText.match(/^([0-9A-F]{3}|[0-9A-F]{8})\s+([0-9A-F]{2})\s+/);
    const isLegacyKLineHeader = /^48\s+6B\s+10\s+/.test(lineText);
    const expectedCanDlc = byteCount + 2 + serviceOffsetBytes;
    const isKwpHeader = /^8[0-9A-F]\s+[0-9A-F]{2}\s+[0-9A-F]{2}\s+/.test(lineText)
      && tokens.length >= byteCount + 4
      && tokens[0] !== undefined
      && (Number.parseInt(tokens[0], 16) & 0x3F) === expectedCanDlc;
    const isDirectResponse = new RegExp('^' + service + '\\s+' + requestedPid + '(?:\\s|$)').test(lineText);

    for (let index = 0; index < tokens.length - 1; index += 1) {
      if (tokens[index] !== service || tokens[index + 1] !== requestedPid) continue;

      const canEnvelope = index === 1
        && canHeader !== null
        && Number.parseInt(canHeader[2], 16) === expectedCanDlc;
      const legacyKLineHeader = index === 3
        && isLegacyKLineHeader
        && tokens[0] === '48'
        && tokens[1] === '6B'
        && tokens[2] === '10';
      const kwpEnvelope = index === 3 && isKwpHeader;
      if (!(index === 0 && isDirectResponse) && !canEnvelope && !legacyKLineHeader && !kwpEnvelope) continue;

      const payloadStart = index + 2 + serviceOffsetBytes;
      const payload = tokens.slice(payloadStart, payloadStart + byteCount);
      const trailing = tokens.slice(payloadStart + byteCount);
      // KWP frames contain one checksum byte after the declared payload. Check
      // the complete header/service/PID/data sum before accepting the payload.
      const kwpChecksum = kwpEnvelope
        && trailing.length === 1
        && hasValidKLineChecksum(
          tokens.slice(0, payloadStart + byteCount)
            .map((token) => Number.parseInt(token, 16).toString(16).padStart(2, '0'))
            .join(''),
          trailing[0],
        );
      // The legacy ISO/K-line envelope has the same additive checksum rule.
      const legacyKLineChecksum = legacyKLineHeader
        && trailing.length === 1
        && hasValidKLineChecksum(
          tokens.slice(0, payloadStart + byteCount)
            .map((token) => Number.parseInt(token, 16).toString(16).padStart(2, '0'))
            .join(''),
          trailing[0],
        );
      const validTrailing = trailing.length === 0
        ? !kwpEnvelope
        : legacyKLineChecksum || kwpChecksum;
      if (payload.length !== byteCount || !validTrailing) continue;
      if (!payload.every((token) => /^[0-9A-F]{2}$/.test(token))) continue;
      return payload.map((token) => Number.parseInt(token, 16));
    }
  }
  return [];
}

export function extractHexBytes(rawResponse: string): number[] {
  const bytes: number[] = [];
  for (const line of rawResponse.split(/[\r\n]+/)) {
    const trimmed = line.trim().toUpperCase();
    if (/^(?:[0-9A-F]{2})+$/.test(trimmed)) {
      for (let offset = 0; offset < trimmed.length; offset += 2) {
        bytes.push(Number.parseInt(trimmed.slice(offset, offset + 2), 16));
      }
      continue;
    }
    const tokens = line.toUpperCase().match(/(?:^|\s)([0-9A-F]{2})(?=\s|$)/g) ?? [];
    bytes.push(...tokens.map((token) => Number.parseInt(token.trim(), 16)));
  }
  return bytes;
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
          const trimByte = data[1];
          // PID 0114 byte B is STFT for B1S1; 0xFF means the sensor is
          // not used in the fuel-trim calculation, not a 99.22% correction.
          if (trimByte === 0xFF) return 'AJUSTE CURTO B1S1=NÃO USADO (B=FF)';
          const trimPercent = (trimByte * 100 / 128) - 100;
          return 'AJUSTE CURTO B1S1=' + trimPercent.toFixed(2) + '%';
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
