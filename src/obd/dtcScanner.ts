import type { Elm327Session } from './elm327';
import { parseDtcResponseForService } from './parser';

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
