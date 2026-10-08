import type { Elm327Session } from './elm327';
import { getPidDefinition } from './pidDefinition';
import { validatePidValue } from './formulaEngine';

export interface VehicleInfoResult {
  ok: boolean;
  command: '0902';
  response: string;
  elapsedMs: number;
  vin: string | null;
  reason?: string;
}

export interface FreezeFrameReading {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  rawResponse: string;
  timestamp: string;
  source: 'REAL_OBD';
  status: 'RESPONDEU' | 'VALOR_NAO_INTERPRETADO';
  errorMessage?: string;
}

export interface FreezeFrameResult {
  command: string;
  response: string;
  elapsedMs: number;
  reading: FreezeFrameReading;
}

function hexByteTokens(line: string): string[] {
  return line.toUpperCase().match(/\b[0-9A-F]{2}\b/g) ?? [];
}

function decodeAscii(bytes: number[]): string {
  return bytes.map((byte) => String.fromCharCode(byte)).join('');
}

export function parseVinMode09Response(rawResponse: string): string | null {
  const frames: Array<{ index: number; bytes: number[] }> = [];
  for (const line of rawResponse.split(/\r\n|\n|\r/)) {
    const bytes = hexByteTokens(line);
    for (let i = 0; i < bytes.length - 2; i += 1) {
      if (bytes[i] !== '49' || bytes[i + 1] !== '02') continue;
      const frameIndex = Number.parseInt(bytes[i + 2], 16);
      const payload = bytes.slice(i + 3, i + 7).map((value) => Number.parseInt(value, 16));
      if (Number.isFinite(frameIndex) && payload.length > 0) frames.push({ index: frameIndex, bytes: payload });
    }
  }
  if (!frames.length) return null;
  frames.sort((a, b) => a.index - b.index);
  const bytes = frames.flatMap((frame) => frame.bytes);
  const ascii = decodeAscii(bytes).replace(/[\u0000-\u001F\u007F]/g, '');
  const match = ascii.match(/[A-HJ-NPR-Z0-9]{17}/i);
  return match ? match[0].toUpperCase() : null;
}

export function parseFreezeFramePidResponse(pidRequested: string, rawResponse: string): FreezeFrameReading {
  const pid = pidRequested.replace(/\s/g, '').toUpperCase();
  const definition = getPidDefinition(pid);
  const timestamp = new Date().toISOString();

  if (!definition) {
    return {
      pid,
      name: 'PID DESCONHECIDO',
      value: null,
      unit: 'SEM DADOS',
      rawResponse,
      timestamp,
      source: 'REAL_OBD',
      status: 'VALOR_NAO_INTERPRETADO',
      errorMessage: 'PID não está no banco de definições',
    };
  }

  const normalized = rawResponse.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = `42${pid.slice(-2)}`;
  const markerIndex = normalized.indexOf(marker);
  if (markerIndex < 0) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      timestamp,
      source: 'REAL_OBD',
      status: 'VALOR_NAO_INTERPRETADO',
      errorMessage: 'Resposta não contém resposta positiva do Mode 02',
    };
  }

  const payloadHex = normalized.slice(markerIndex + marker.length, markerIndex + marker.length + definition.bytes * 2);
  if (payloadHex.length !== definition.bytes * 2) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      timestamp,
      source: 'REAL_OBD',
      status: 'VALOR_NAO_INTERPRETADO',
      errorMessage: `Esperado ${definition.bytes} byte(s), recebido ${Math.floor(payloadHex.length / 2)}`,
    };
  }

  const bytes: number[] = [];
  for (let i = 0; i < payloadHex.length; i += 2) bytes.push(Number.parseInt(payloadHex.slice(i, i + 2), 16));

  const value = definition.formula(bytes);
  const validation = validatePidValue(pid, value);
  if (!Number.isFinite(value) || !validation.valid) {
    return {
      pid,
      name: definition.name,
      value: null,
      unit: definition.unit,
      rawResponse,
      timestamp,
      source: 'REAL_OBD',
      status: 'VALOR_NAO_INTERPRETADO',
      errorMessage: validation.valid ? 'Fórmula produziu valor inválido' : validation.reason,
    };
  }

  return {
    pid,
    name: definition.name,
    value,
    unit: definition.unit,
    rawResponse,
    timestamp,
    source: 'REAL_OBD',
    status: 'RESPONDEU',
  };
}

export async function readVehicleVin(session: Elm327Session): Promise<VehicleInfoResult> {
  const result = await session.executeCommand('0902');
  const vin = result.status === 'OK' ? parseVinMode09Response(result.response) : null;
  return {
    ok: Boolean(vin),
    command: '0902',
    response: result.response,
    elapsedMs: result.elapsedMs,
    vin,
    ...(vin ? {} : { reason: result.status === 'OK' ? 'ECU respondeu sem VIN válido' : `Mode 09 indisponível: ${result.status}` }),
  };
}

export async function readFreezeFramePids(
  session: Elm327Session,
  pids: string[] = ['010C', '0105', '010D', '010B', '0111'],
): Promise<FreezeFrameResult[]> {
  const results: FreezeFrameResult[] = [];
  for (const pid of Array.from(new Set(pids.map((value) => value.replace(/\s/g, '').toUpperCase())))) {
    const result = await session.executeCommand(`02${pid.slice(-2)}`);
    results.push({
      command: result.command,
      response: result.response,
      elapsedMs: result.elapsedMs,
      reading: parseFreezeFramePidResponse(pid, result.response),
    });
  }
  return results;
}
