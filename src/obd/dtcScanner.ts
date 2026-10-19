import type { Elm327Session } from './elm327';
import { parseDtcResponseForService } from './dtcParser';
import { parsePidResponse } from './parser';

export type DtcServiceKind = 'STORED' | 'PENDING' | 'PERMANENT';

export interface DtcServiceScan {
  service: '03' | '07' | '0A';
  kind: DtcServiceKind;
  label: string;
  codes: string[];
  available: boolean;
  response: string;
  elapsedMs: number;
  reason?: string;
}

const REQUESTS: Array<{
  service: '03' | '07' | '0A';
  kind: DtcServiceKind;
  label: string;
}> = [
  { service: '03', kind: 'STORED', label: 'ARMAZENADOS / CONFIRMADOS' },
  { service: '07', kind: 'PENDING', label: 'PENDENTES' },
  { service: '0A', kind: 'PERMANENT', label: 'PERMANENTES' },
];

function isNoCodeResponse(response: string): boolean {
  return /NO DATA|NO CODES?|NENHUM/i.test(response);
}

export async function scanDtcServices(
  session: Elm327Session,
  execute: (command: string) => Promise<Awaited<ReturnType<Elm327Session['executeCommand']>>> = (command) =>
    session.executeCommand(command),
): Promise<DtcServiceScan[]> {
  const results: DtcServiceScan[] = [];

  for (const request of REQUESTS) {
    try {
      const reply = await execute(request.service);
      const response = reply.response ?? '';
      const available = reply.status === 'OK' || isNoCodeResponse(response);

      results.push({
        ...request,
        codes: available ? parseDtcResponseForService(request.service, response) : [],
        available,
        response,
        elapsedMs: reply.elapsedMs,
        ...(available ? {} : {
          reason: reply.errorMessage || ('SERVIÇO ' + request.service + ' NÃO DISPONÍVEL'),
        }),
      });
    } catch (cause) {
      results.push({
        ...request,
        codes: [],
        available: false,
        response: '',
        elapsedMs: 0,
        reason: cause instanceof Error ? cause.message : ('FALHA NO SERVIÇO ' + request.service),
      });
    }
  }

  return results;
}

export function summarizeDtcScan(results: DtcServiceScan[]): {
  stored: string[];
  pending: string[];
  permanent: string[];
  unavailable: string[];
} {
  return {
    stored: results.find((item) => item.kind === 'STORED')?.codes ?? [],
    pending: results.find((item) => item.kind === 'PENDING')?.codes ?? [],
    permanent: results.find((item) => item.kind === 'PERMANENT')?.codes ?? [],
    unavailable: results.filter((item) => !item.available).map((item) => item.service),
  };
}

export const DTC_SERVICE_REQUESTS = REQUESTS;


export interface FreezeFrameParameter {
  pid: string;
  label: string;
  value: number | null;
  unit: string;
  available: boolean;
  reason?: string;
}

export interface FreezeFrameSnapshot {
  frame: number;
  dtc: string | null;
  rpm: number | null;
  coolantC: number | null;
  speedKmh: number | null;
  engineLoadPercent: number | null;
  stftPercent: number | null;
  ltftPercent: number | null;
  mapKpa: number | null;
  intakeAirTempC: number | null;
  throttlePercent: number | null;
  capturedAt: string;
  available: boolean;
  reason?: string;
  parameters: FreezeFrameParameter[];
  responses: Record<string, string>;
}

type FreezeFramePidSpec = { pid: string; label: string };

const FREEZE_FRAME_PIDS: FreezeFramePidSpec[] = [
  { pid: '0104', label: 'Carga calculada do motor' },
  { pid: '0105', label: 'Temperatura do arrefecimento' },
  { pid: '0106', label: 'Ajuste de combustível curto prazo (STFT)' },
  { pid: '0107', label: 'Ajuste de combustível longo prazo (LTFT)' },
  { pid: '010B', label: 'Pressão absoluta do coletor (MAP)' },
  { pid: '010C', label: 'Rotação do motor' },
  { pid: '010D', label: 'Velocidade do veículo' },
  { pid: '010F', label: 'Temperatura do ar de admissão' },
  { pid: '0111', label: 'Posição da borboleta' },
];

function normalizedResponse(response: string): string {
  return String(response ?? '').replace(/[^0-9A-F]/gi, '').toUpperCase();
}

function parseFreezeFrameFrameNumber(response: string, pid: string): number | null {
  const stream = normalizedResponse(response);
  const marker = stream.indexOf('42' + pid);
  if (marker < 0) return null;
  const frameHex = stream.slice(marker + 4, marker + 6);
  return /^[0-9A-F]{2}$/.test(frameHex) ? Number.parseInt(frameHex, 16) : null;
}

function parseFreezeFrameDtc(response: string): string | null {
  const stream = normalizedResponse(response);
  const marker = stream.indexOf('4202');
  if (marker < 0) return null;
  // Mode 02 PID 02 payload: 42 02, frame number (1 byte), then DTC (2 bytes).
  const data = stream.slice(marker + 6, marker + 10);
  if (data.length !== 4 || /^0{4}$/.test(data)) return null;
  const high = Number.parseInt(data.slice(0, 2), 16);
  const low = Number.parseInt(data.slice(2), 16);
  const type = ['P', 'C', 'B', 'U'][(high >> 6) & 0x03];
  return `${type}${((high >> 4) & 0x03).toString(16).toUpperCase()}${(high & 0x0f).toString(16).toUpperCase()}${(low >> 4).toString(16).toUpperCase()}${(low & 0x0f).toString(16).toUpperCase()}`;
}

function emptyFreezeFrame(
  capturedAt: string,
  responses: Record<string, string>,
  reason: string,
  frame = 0,
  dtc: string | null = null,
): FreezeFrameSnapshot {
  return {
    frame, dtc, rpm: null, coolantC: null, speedKmh: null,
    engineLoadPercent: null, stftPercent: null, ltftPercent: null,
    mapKpa: null, intakeAirTempC: null, throttlePercent: null,
    capturedAt, available: false, reason, parameters: [], responses,
  };
}

export async function readFreezeFrame(
  session: Elm327Session,
  execute: (command: string) => Promise<Awaited<ReturnType<Elm327Session['executeCommand']>>> = (command) =>
    session.executeCommand(command),
): Promise<FreezeFrameSnapshot> {
  const responses: Record<string, string> = {};
  const capturedAt = new Date().toISOString();
  let firstReply: Awaited<ReturnType<Elm327Session['executeCommand']>>;
  try {
    firstReply = await execute('020200');
    responses['020200'] = firstReply.response ?? '';
  } catch (cause) {
    return emptyFreezeFrame(capturedAt, responses, cause instanceof Error ? cause.message : 'FALHA NA LEITURA DO FREEZE FRAME');
  }

  const frame = parseFreezeFrameFrameNumber(firstReply.response ?? '', '02');
  const dtc = firstReply.status === 'OK' ? parseFreezeFrameDtc(firstReply.response ?? '') : null;
  if (firstReply.status !== 'OK' || frame === null || dtc === null) {
    return emptyFreezeFrame(
      capturedAt,
      responses,
      firstReply.errorMessage || 'A ECU não informou um DTC/quadro válido em Mode 02 PID 02.',
      frame ?? 0,
      dtc,
    );
  }

  const parameters: FreezeFrameParameter[] = [];
  const frameHex = frame.toString(16).padStart(2, '0').toUpperCase();
  for (const spec of FREEZE_FRAME_PIDS) {
    const command = '02' + spec.pid.slice(-2) + frameHex;
    let response = '';
    try {
      const reply = await execute(command);
      response = reply.response ?? '';
      responses[command] = response;
      if (reply.status !== 'OK') {
        parameters.push({
          pid: spec.pid, label: spec.label, value: null,
          unit: 'N/D', available: false,
          reason: reply.errorMessage || 'SERVIÇO SEM RESPOSTA VÁLIDA',
        });
        continue;
      }
      const responseFrame = parseFreezeFrameFrameNumber(response, spec.pid.slice(-2));
      if (responseFrame !== frame) {
        parameters.push({
          pid: spec.pid, label: spec.label, value: null,
          unit: 'N/D', available: false,
          reason: responseFrame === null ? 'PID NÃO DISPONÍVEL NO FREEZE FRAME' : 'RESPOSTA DE OUTRO QUADRO IGNORADA',
        });
        continue;
      }
      const parsed = parsePidResponse(spec.pid, response, '42');
      parameters.push({
        pid: spec.pid,
        label: spec.label,
        value: parsed.status === 'RESPONDEU' ? parsed.value : null,
        unit: parsed.unit,
        available: parsed.status === 'RESPONDEU' && parsed.value !== null && Number.isFinite(parsed.value),
        ...(parsed.status !== 'RESPONDEU' ? { reason: parsed.errorMessage || parsed.status } : {}),
      });
    } catch (cause) {
      parameters.push({
        pid: spec.pid, label: spec.label, value: null,
        unit: 'N/D', available: false,
        reason: cause instanceof Error ? cause.message : 'FALHA AO LER PID DE FREEZE FRAME',
      });
    }
  }

  const value = (pid: string): number | null =>
    parameters.find((item) => item.pid === pid && item.available && item.value !== null)?.value ?? null;
  const anyParameter = parameters.some((item) => item.available);
  return {
    frame,
    dtc,
    rpm: value('010C'),
    coolantC: value('0105'),
    speedKmh: value('010D'),
    engineLoadPercent: value('0104'),
    stftPercent: value('0106'),
    ltftPercent: value('0107'),
    mapKpa: value('010B'),
    intakeAirTempC: value('010F'),
    throttlePercent: value('0111'),
    capturedAt,
    available: anyParameter,
    ...(!anyParameter ? { reason: 'O DTC foi identificado, mas nenhum PID de freeze frame foi decodificado.' } : {}),
    parameters,
    responses,
  };
}
