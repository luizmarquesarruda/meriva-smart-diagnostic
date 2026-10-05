export type PartialResponseAction = 'RECONNECT_AND_INITIALIZE' | 'RECONNECT' | 'IGNORE';
export type ElmErrorType =
  | 'NONE'
  | 'NO_DATA'
  | 'TIMEOUT'
  | 'UNSUPPORTED'
  | 'BUS_ERROR'
  | 'BUS_INIT_ERROR'
  | 'BUFFER_FULL'
  | 'RX_ERROR'
  | 'DATA_ERROR'
  | 'DISCONNECTED'
  | 'UNKNOWN';

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
  adaptiveTiming: boolean;
  adaptiveTimeoutMinMs: number;
  adaptiveTimeoutMaxMs: number;
  adaptiveTimeoutStepMs: number;
}

export interface ElmHealthSnapshot {
  commands: number;
  successfulCommands: number;
  noData: number;
  timeouts: number;
  unsupported: number;
  errors: number;
  averageResponseMs: number;
  adaptiveTimeoutMs: number;
  recoveryRecommended: boolean;
  lastErrorType: ElmErrorType;
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
  adaptiveTiming: true,
  adaptiveTimeoutMinMs: 3_000,
  adaptiveTimeoutMaxMs: 15_000,
  adaptiveTimeoutStepMs: 500,
};

export function normalizeElmResponse(response: string): string {
  return response
    .replace(/\u0000/g, '')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .replace(/[ \t]+$/gm, '')
    .replace(/^\s*>\s*$/gm, '')
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

export function classifyElmError(response: string, message = ''): ElmErrorType {
  const value = normalizeElmResponse(response).toUpperCase();
  const detail = message.toUpperCase();
  if (isUnsupportedAtResponse(value)) return 'UNSUPPORTED';
  if (isNoDataResponse(value)) return 'NO_DATA';
  if (/BUFFER FULL/.test(value)) return 'BUFFER_FULL';
  if (/BUS INIT/.test(value)) return 'BUS_INIT_ERROR';
  if (/BUS ERROR|CAN ERROR|CAN ERROR/.test(value)) return 'BUS_ERROR';
  if (/RX ERROR|RXERROR/.test(value)) return 'RX_ERROR';
  if (/DATA ERROR/.test(value)) return 'DATA_ERROR';
  if (/DISCONNECT|NOT CONNECTED/.test(value + ' ' + detail)) return 'DISCONNECTED';
  if (/TIMEOUT|SEM PROMPT|FINAL DE LINHA|INCOMPLETA/.test(value + ' ' + detail)) return 'TIMEOUT';
  if (/ERROR|UNABLE TO CONNECT|STOPPED/.test(value)) return 'UNKNOWN';
  return 'NONE';
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
    adaptiveTimeoutMinMs: Math.max(1000, Math.round(merged.adaptiveTimeoutMinMs)),
    adaptiveTimeoutMaxMs: Math.max(1000, Math.round(merged.adaptiveTimeoutMaxMs)),
    adaptiveTimeoutStepMs: Math.max(50, Math.round(merged.adaptiveTimeoutStepMs)),
  };
}
