import { Elm327Session } from './elm327';
import { validateOBDResponse } from './parser';

export const DISCOVERY_PIDS = ['0100', '0120'];
export const KNOWN_PIDS = ['0105', '0106', '010B', '010C', '010D', '0110', '012F', '0142', '015E'];

export interface DiscoveryItem {
  pid: string;
  response: string;
  responded: boolean;
  elapsedMs: number;
  supportedPids: string[];
}

export function decodeSupportedPids(requestedPid: string, response: string): string[] {
  const normalized = requestedPid.replace(/\s/g, '').toUpperCase();
  if (!/^01(?:00|20|40|60)$/.test(normalized) || !validateOBDResponse(response)) return [];

  const bytes = response.toUpperCase().match(/[0-9A-F]{2}/g) ?? [];
  const headerIndex = bytes.findIndex(
    (byte, index) =>
      byte === '41' &&
      bytes[index + 1] === normalized.slice(-2),
  );
  if (headerIndex < 0) return [];

  const bitmap = bytes
    .slice(headerIndex + 2, headerIndex + 6)
    .map((value) => Number.parseInt(value, 16));
  if (bitmap.length !== 4) return [];

  const startPid = Number.parseInt(normalized.slice(-2), 16) + 1;
  const supported: string[] = [];
  for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((bitmap[byteIndex] & (1 << bit)) !== 0) {
        const pidNumber = startPid + byteIndex * 8 + (7 - bit);
        if (pidNumber <= startPid + 31) supported.push(`01${pidNumber.toString(16).padStart(2, '0').toUpperCase()}`);
      }
    }
  }
  return supported;
}

export async function discoverSupportedPids(
  session: Elm327Session,
  pids: string[] = DISCOVERY_PIDS,
): Promise<DiscoveryItem[]> {
  const result: DiscoveryItem[] = [];
  for (const pid of pids) {
    const started = Date.now();
    try {
      const reply = await session.executeCommand(pid);
      result.push({
        pid,
        response: reply.response,
        responded: reply.status === 'OK' && validateOBDResponse(reply.response),
        elapsedMs: reply.elapsedMs || Date.now() - started,
        supportedPids: decodeSupportedPids(pid, reply.response),
      });
    } catch {
      result.push({
        pid,
        response: '',
        responded: false,
        elapsedMs: Date.now() - started,
        supportedPids: [],
      });
    }
  }
  return result;
}
