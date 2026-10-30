import type { CurrentConditions } from './currentConditions';

export interface NetworkReachabilitySnapshot {
  isConnected: boolean | null;
  isInternetReachable: boolean | null;
}

export interface NetworkMonitor {
  fetch(): Promise<NetworkReachabilitySnapshot>;
  addEventListener(listener: (state: NetworkReachabilitySnapshot) => void): () => void;
}

export interface ConditionsRefreshOptions {
  refreshIntervalMs?: number;
  retryCooldownMs?: number;
  now?: () => number;
  setIntervalFn?: (handler: () => void, delayMs: number) => ReturnType<typeof setInterval>;
  clearIntervalFn?: (handle: ReturnType<typeof setInterval>) => void;
}

/** Refresh enrichment sparingly; it must never run on the OBD polling cadence. */
export const CURRENT_CONDITIONS_REFRESH_INTERVAL_MS = 15 * 60 * 1000;
export const CURRENT_CONDITIONS_RETRY_COOLDOWN_MS = 60 * 1000;
export const CURRENT_CONDITIONS_MAX_RETRY_COOLDOWN_MS = 15 * 60 * 1000;

export function isConditionsNetworkAvailable(state: NetworkReachabilitySnapshot): boolean {
  // 4G/5G and Wi-Fi both work. A null reachability result means "not yet known",
  // not proof of offline; the request itself remains bounded by the fetch stack.
  return state.isConnected === true && state.isInternetReachable !== false;
}

export function mergeCurrentConditions(
  previous: CurrentConditions,
  next: CurrentConditions,
): CurrentConditions {
  if (next.available || !previous.available ||
      /LOCALIZAÇÃO NÃO AUTORIZADA/.test(next.description)) {
    return next;
  }

  // Never present an old temperature as current. Retain only the last locality
  // label and explicitly mark its weather as stale while the refresh is failing.
  return {
    city: next.city ?? previous.city,
    locationLabels: next.locationLabels.length > 0 ? next.locationLabels : previous.locationLabels,
    temperatureC: null,
    description: 'CLIMA DESATUALIZADO • ATUALIZAÇÃO INDISPONÍVEL',
    available: false,
  };
}

export function startCurrentConditionsRefresh(
  monitor: NetworkMonitor,
  load: () => Promise<CurrentConditions>,
  onUpdate: (conditions: CurrentConditions) => void,
  options: ConditionsRefreshOptions = {},
): () => void {
  const refreshIntervalMs = options.refreshIntervalMs ?? CURRENT_CONDITIONS_REFRESH_INTERVAL_MS;
  const retryCooldownMs = options.retryCooldownMs ?? CURRENT_CONDITIONS_RETRY_COOLDOWN_MS;
  const now = options.now ?? Date.now;
  const schedule = options.setIntervalFn ?? setInterval;
  const cancelSchedule = options.clearIntervalFn ?? clearInterval;

  let disposed = false;
  let inFlight = false;
  let lastOnline: boolean | null = null;
  let lastAttemptAt = 0;
  let lastSuccessAt = 0;
  let consecutiveFailures = 0;

  const refresh = async (
    providedState?: NetworkReachabilitySnapshot,
    force = false,
  ): Promise<void> => {
    if (disposed) return;

    let network: NetworkReachabilitySnapshot;
    try {
      network = providedState ?? await monitor.fetch();
    } catch {
      return;
    }

    const online = isConditionsNetworkAvailable(network);
    const wasOnline = lastOnline;
    lastOnline = online;
    if (!online || inFlight) return;

    const currentTime = now();
    const reconnecting = wasOnline !== true;
    const retryDelayMs = consecutiveFailures === 0
      ? retryCooldownMs
      : Math.min(
        CURRENT_CONDITIONS_MAX_RETRY_COOLDOWN_MS,
        retryCooldownMs * (2 ** Math.min(consecutiveFailures - 1, 4)),
      );
    if (!force && !reconnecting) {
      if (lastAttemptAt > 0 && currentTime - lastAttemptAt < retryDelayMs) return;
      if (consecutiveFailures === 0 && lastSuccessAt > 0 && currentTime - lastSuccessAt < refreshIntervalMs) return;
    }

    inFlight = true;
    lastAttemptAt = currentTime;
    let result: CurrentConditions;
    try {
      result = await load();
    } catch {
      result = {
        city: null,
        locationLabels: [],
        temperatureC: null,
        description: 'CLIMA INDISPONÍVEL • DIAGNÓSTICO OFFLINE',
        available: false,
      };
    } finally {
      inFlight = false;
    }

    if (disposed) return;
    if (result.available) {
      consecutiveFailures = 0;
      lastSuccessAt = now();
    } else {
      consecutiveFailures = Math.min(consecutiveFailures + 1, 5);
    }
    onUpdate(result);
  };

  let unsubscribe: (() => void) | null = null;
  try {
    unsubscribe = monitor.addEventListener((state) => {
      void refresh(state);
    });
  } catch {
    // Initial and periodic fetches still operate if event subscription fails.
  }

  void refresh(undefined, true);
  const timer = schedule(() => { void refresh(); }, refreshIntervalMs);

  return () => {
    disposed = true;
    unsubscribe?.();
    cancelSchedule(timer);
  };
}
