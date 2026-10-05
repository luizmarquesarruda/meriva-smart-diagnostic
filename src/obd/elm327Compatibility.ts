export type PartialResponseAction = 'RECONNECT_AND_INITIALIZE' | 'RECONNECT' | 'IGNORE';

export interface Elm327CompatibilityConfig {
  ioTimeoutMs: number;
  bluetoothConnectTimeoutMs: number;
  commandDelayMs: number;
  maxConnectionAttempts: number; // 0 = infinite
  noDataReconnectThreshold: number;
  partialResponseAction: PartialResponseAction;
  forceInitialization: boolean;
  forceInitCommands: string[];
  allowUnsupportedAtCommands: boolean;
}

export const DEFAULT_ELM327_COMPATIBILITY: Elm327CompatibilityConfig = {
  ioTimeoutMs: 10_000,
  bluetoothConnectTimeoutMs: 5_000,
  commandDelayMs: 20,
  maxConnectionAttempts: 0,
  noDataReconnectThreshold: 40,
  partialResponseAction: 'RECONNECT_AND_INITIALIZE',
  forceInitialization: true,
  forceInitCommands: ['ATZ', 'ATE0'],
  allowUnsupportedAtCommands: true,
};

export function normalizeElmResponse(response: string): string {
  return response
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

export function hasElmPrompt(response: string): boolean {
  return response.includes('>');
}

export function isUnsupportedAtResponse(response: string): boolean {
  const normalized = normalizeElmResponse(response).toUpperCase();
  return normalized === '?' || normalized.includes('UNKNOWN COMMAND') || normalized.includes('UNSUPPORTED');
}

export function isNoDataResponse(response: string): boolean {
  return /(^|\n)\s*NO DATA\s*($|\n)/i.test(normalizeElmResponse(response));
}

export function isPartialResponseError(message: string): boolean {
  return /PARTIAL|SEM PROMPT|FINAL DE LINHA|INCOMPLETA/i.test(message);
}

export function mergeCompatibilityConfig(
  partial?: Partial<Elm327CompatibilityConfig>,
): Elm327CompatibilityConfig {
  const merged = { ...DEFAULT_ELM327_COMPATIBILITY, ...(partial ?? {}) };
  return {
    ...merged,
    ioTimeoutMs: Math.max(1000, Math.round(merged.ioTimeoutMs)),
    bluetoothConnectTimeoutMs: Math.max(1000, Math.round(merged.bluetoothConnectTimeoutMs)),
    commandDelayMs: Math.max(0, Math.round(merged.commandDelayMs)),
    maxConnectionAttempts: Math.max(0, Math.round(merged.maxConnectionAttempts)),
    noDataReconnectThreshold: Math.max(1, Math.round(merged.noDataReconnectThreshold)),
  };
}
