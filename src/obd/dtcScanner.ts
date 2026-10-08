import type { Elm327Session } from './elm327';
import { isValidDtcResponse, parseDtcResponseForService } from './dtcParser';
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

const REQUESTS: {
  service: '03' | '07' | '0A';
  kind: DtcServiceKind;
  label: string;
}[] = [
  { service: '03', kind: 'STORED', label: 'ARMAZENADOS / CONFIRMADOS' },
  { service: '07', kind: 'PENDING', label: 'PENDENTES' },
  { service: '0A', kind: 'PERMANENT', label: 'PERMANENTES' },
];

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
      const available = reply.status === 'OK' && isValidDtcResponse(request.service, response);

      results.push({
        ...request,
        codes: available ? parseDtcResponseForService(request.service, response) : [],
        available,
        response,
        elapsedMs: reply.elapsedMs,
        ...(available ? {} : {
          reason: reply.errorMessage || ('SERVIÇO ' + request.service + ' SEM RESPOSTA OBD POSITIVA'),
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

export interface FreezeFrameSnapshot {
  frame: number;
  dtc: string | null;
  rpm: number | null;
  coolantC: number | null;
  available: boolean;
  responses: Record<string, string>;
}

function parseFreezeFrameDtc(response: string): string | null {
  const stream = response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = stream.indexOf('4202');
  if (marker < 0) return null;
  const data = stream.slice(marker + 8, marker + 12);
  if (data.length !== 4 || /^0{4}$/.test(data)) return null;
  const high = Number.parseInt(data.slice(0, 2), 16);
  const low = Number.parseInt(data.slice(2), 16);
  const type = ['P', 'C', 'B', 'U'][(high >> 6) & 0x03];
  return `${type}${((high >> 4) & 0x03).toString(16).toUpperCase()}${(high & 0x0f).toString(16).toUpperCase()}${(low >> 4).toString(16).toUpperCase()}${(low & 0x0f).toString(16).toUpperCase()}`;
}

export async function readFreezeFrame(
  session: Elm327Session,
  execute: (command: string) => Promise<Awaited<ReturnType<Elm327Session['executeCommand']>>> = (command) => session.executeCommand(command),
): Promise<FreezeFrameSnapshot> {
  const responses: Record<string, string> = {};
  let dtc: string | null = null;
  let rpm: number | null = null;
  let coolantC: number | null = null;

  for (const command of ['020200', '020C00', '020500']) {
    try {
      const reply = await execute(command);
      responses[command] = reply.response;
      if (reply.status !== 'OK') continue;
      if (command === '020200') dtc = parseFreezeFrameDtc(reply.response);
      if (command === '020C00') {
        const parsed = parsePidResponse('010C', reply.response, '42');
        rpm = parsed.status === 'RESPONDEU' ? parsed.value : null;
      }
      if (command === '020500') {
        const parsed = parsePidResponse('0105', reply.response, '42');
        coolantC = parsed.status === 'RESPONDEU' ? parsed.value : null;
      }
    } catch {
      // Freeze frame is optional and must not invalidate the DTC scan.
    }
  }

  const frameMatch = Object.values(responses).join(' ').match(/42\s*(?:02|0C|05)\s*([0-9A-F]{2})/i);
  const frame = frameMatch ? Number.parseInt(frameMatch[1], 16) : 0;
  return {
    frame,
    dtc,
    rpm,
    coolantC,
    available: Boolean(dtc || rpm != null || coolantC != null),
    responses,
  };
}
