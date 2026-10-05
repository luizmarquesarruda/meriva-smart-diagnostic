import { Elm327Session } from './elm327';
import { validateOBDResponse } from './parser';

export const DISCOVERY_PIDS = ['0100', '0120', '0140', '0160'];
export const KNOWN_PIDS = ['0104', '0105', '0106', '0107', '010B', '010C', '010D', '010E', '010F', '0110', '0111', '0114', '012F', '0131', '0142', '0151', '0152', '015E'];

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

  const stream = response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = `41${normalized.slice(-2)}`;
  const headerIndex = stream.indexOf(marker);
  if (headerIndex < 0) return [];

  const bitmapHex = stream.slice(headerIndex + marker.length, headerIndex + marker.length + 8);
  if (bitmapHex.length !== 8 || !/^[0-9A-F]{8}$/.test(bitmapHex)) return [];

  const bitmap = [];
  for (let index = 0; index < bitmapHex.length; index += 2) {
    bitmap.push(Number.parseInt(bitmapHex.slice(index, index + 2), 16));
  }

  const startPid = Number.parseInt(normalized.slice(-2), 16) + 1;
  const supported: string[] = [];
  for (let byteIndex = 0; byteIndex < 4; byteIndex++) {
    for (let bit = 7; bit >= 0; bit--) {
      if ((bitmap[byteIndex] & (1 << bit)) !== 0) {
        const pidNumber = startPid + byteIndex * 8 + (7 - bit);
        if (pidNumber <= startPid + 31) {
          supported.push(`01${pidNumber.toString(16).padStart(2, '0').toUpperCase()}`);
        }
      }
    }
  }
  return supported;
}

function nextDiscoveryPid(previousPid: string, supportedPids: string[]): string | null {
  const index = DISCOVERY_PIDS.indexOf(previousPid);
  if (index < 0 || index === DISCOVERY_PIDS.length - 1) return null;
  const nextPid = DISCOVERY_PIDS[index + 1];
  return supportedPids.includes(nextPid) ? nextPid : null;
}

export async function discoverSupportedPids(
  session: Elm327Session,
  pids: string[] = DISCOVERY_PIDS,
): Promise<DiscoveryItem[]> {
  const result: DiscoveryItem[] = [];
  let nextPid: string | null = pids[0] ?? null;

  while (nextPid) {
    const pid = nextPid;
    const started = Date.now();

    try {
      const reply = await session.executeCommand(pid);
      const supportedPids = decodeSupportedPids(pid, reply.response);
      const item: DiscoveryItem = {
        pid,
        response: reply.response,
        responded: reply.status === 'OK' && validateOBDResponse(reply.response),
        elapsedMs: reply.elapsedMs || Date.now() - started,
        supportedPids,
      };
      result.push(item);

      if (pids !== DISCOVERY_PIDS) {
        const currentIndex = pids.indexOf(pid);
        nextPid = currentIndex >= 0 && currentIndex + 1 < pids.length
          ? pids[currentIndex + 1]
          : null;
      } else {
        nextPid = nextDiscoveryPid(pid, supportedPids);
      }
    } catch {
      result.push({
        pid,
        response: '',
        responded: false,
        elapsedMs: Date.now() - started,
        supportedPids: [],
      });
      break;
    }
  }

  return result;
}
