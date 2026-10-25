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
        // ATS0 removes byte separators, so legacy K-Line framing may arrive as
        // 486B10 + positive response + payload + one checksum byte. Accept that
        // exact envelope in compact form as well as in the spaced-token path.
        const compactKLineChecksum = prefix === '486B10'
          && trailingHex.length === 2
          && hasValidKLineChecksum(
            compactLine.slice(0, payloadStart + byteCount * 2),
            trailingHex,
          );
        if (
          payloadHex.length === byteCount * 2 &&
          ((trailingHex.length === 0 && acceptedPrefix) || compactKLineChecksum) &&
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
      if (!(index === 0 && isDirectResponse) && !canEnvelope && !legacyKLineHeader) continue;

      const payloadStart = index + 2 + serviceOffsetBytes;
      const payload = tokens.slice(payloadStart, payloadStart + byteCount);
      const trailing = tokens.slice(payloadStart + byteCount);
      // Legacy ISO/K-line responses may include one checksum byte after the
      // payload; it is only permitted with the explicit 48 6B 10 envelope.
      const legacyKLineChecksum = legacyKLineHeader
        && trailing.length === 1
        && hasValidKLineChecksum(
          tokens.slice(0, payloadStart + byteCount)
            .map((token) => Number.parseInt(token, 16).toString(16).padStart(2, '0'))
            .join(''),
          trailing[0],
        );
      if (payload.length !== byteCount || (trailing.length !== 0 && !legacyKLineChecksum)) continue;
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
    : pid === '0114'
      ? (() => {
          const trimByte = data[1];
          // PID 0114 byte B is STFT for B1S1; 0xFF means the sensor is
          // not used in the fuel-trim calculation, not a 99.22% correction.
          if (trimByte === 0xFF) return 'AJUSTE CURTO B1S1=NÃO USADO (B=FF)';
          const trimPercent = (trimByte * 100 / 128) - 100;
          return 'AJUSTE CURTO B1S1=' + trimPercent.toFixed(2) + '%';
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
