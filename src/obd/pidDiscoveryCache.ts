import type { PidDiscoveryCache } from '../meriva/autosaveState';

export const PID_DISCOVERY_CACHE_TTL_MS = 24 * 60 * 60 * 1000;

export interface PidDiscoveryCacheContext {
  adapterAddress?: string | null;
  vin?: string | null;
  ecuAddress?: string | null;
}

function normalize(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.replace(/[:\s-]/g, '').toUpperCase();
}

export function isPidDiscoveryCacheUsable(
  cache: PidDiscoveryCache | null | undefined,
  context: PidDiscoveryCacheContext,
  nowMs = Date.now(),
): boolean {
  if (!cache) return false;
  const discoveredAt = Date.parse(cache.discoveredAt);
  if (!Number.isFinite(discoveredAt) || nowMs - discoveredAt > PID_DISCOVERY_CACHE_TTL_MS) return false;
  if (!cache.adapterAddress) return false;
  if (context.adapterAddress && normalize(cache.adapterAddress) !== normalize(context.adapterAddress)) return false;
  if (cache.vin && context.vin && normalize(cache.vin) !== normalize(context.vin)) return false;
  if (cache.ecuAddress && context.ecuAddress && normalize(cache.ecuAddress) !== normalize(context.ecuAddress)) return false;
  return Array.isArray(cache.supportedPids) && cache.supportedPids.length > 0 && typeof cache.protocol === 'string' && cache.protocol.length > 0;
}
