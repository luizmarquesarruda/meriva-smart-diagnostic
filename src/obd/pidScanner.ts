import { Elm327Session, ObdTransport } from './elm327';

export const DISCOVERY_PIDS = ['0100', '0120', '0140', '0160'];
export const KNOWN_PIDS = ['0105', '0106', '010B', '010C', '010D', '0110', '0142'];

export interface DiscoveryItem { pid: string; response: string; responded: boolean; elapsedMs: number; }

export async function discoverSupportedPids(session: Elm327Session, pids: string[] = DISCOVERY_PIDS): Promise<DiscoveryItem[]> {
  const result: DiscoveryItem[] = [];
  for (const pid of pids) {
    const started = Date.now();
    try {
      const reply = await session.queryPid(pid);
      result.push({ pid, response: reply.rx, responded: reply.parsed.status === 'RESPONDEU', elapsedMs: Date.now() - started });
    } catch {
      result.push({ pid, response: '', responded: false, elapsedMs: Date.now() - started });
    }
  }
  return result;
}

export function createTransport(factory: () => ObdTransport): ObdTransport { return factory(); }
