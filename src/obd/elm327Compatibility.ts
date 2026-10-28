/**
 * Pick the protocol reported by ATDP; do not guess KWP fast for all KWP ECUs.
 */
export function getRecoveryProtocolCommand(protocol: string | null | undefined): string {
  const value = String(protocol ?? '').trim().toUpperCase();
  if (/^ATSP[0-9A-C]$/.test(value)) return value;
  if (/^[0-9A-C]$/.test(value)) return 'ATSP' + value;
  if (/KWP.*(?:5[\s-]?BAUD|SLOW)|(?:5[\s-]?BAUD|SLOW).*KWP/.test(value)) return 'ATSP4';
  if (/KWP.*FAST|FAST.*KWP/.test(value)) return 'ATSP5';
  if (/ISO\s*9141/.test(value)) return 'ATSP3';
  if (/J1850.*PWM|PWM.*J1850/.test(value)) return 'ATSP1';
  if (/J1850.*VPW|VPW.*J1850/.test(value)) return 'ATSP2';
  if (/(?:CAN.*11\s*\/\s*500|11\s*\/\s*500.*CAN)/.test(value)) return 'ATSP6';
  if (/(?:CAN.*29\s*\/\s*500|29\s*\/\s*500.*CAN)/.test(value)) return 'ATSP7';
  if (/(?:CAN.*11\s*\/\s*250|11\s*\/\s*250.*CAN)/.test(value)) return 'ATSP8';
  if (/(?:CAN.*29\s*\/\s*250|29\s*\/\s*250.*CAN)/.test(value)) return 'ATSP9';
  return 'ATSP0';
}

function boundedAttempts(value: number, fallback: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

export function resolveMaxConnectionAttempts(configuredAttempts: number, catalogMaxAttempts: number): number {
  if (Number.isFinite(configuredAttempts) && configuredAttempts > 0) return boundedAttempts(configuredAttempts, 3, 1, 100);
  return boundedAttempts(catalogMaxAttempts, 3, 1, 100);
}

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
  maxConnectionAttempts: number; // 0 = usar o limite-base finito do catálogo
  noDataReconnectThreshold: number;
  recoveryBackoffMs: number[];
  partialResponseAction: PartialResponseAction;
  forceInitialization: boolean;
  forceInitCommands: string[];
  allowUnsupportedAtCommands: boolean;
  adaptiveTiming: boolean;
  adaptiveTimeoutMinMs: number;
  adaptiveTimeoutMaxMs: number;
  adaptiveTimeoutStepMs: number;
  optionalAtTimeoutMs: number;
  protocolSelectionTimeoutMs: number;
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
  consecutiveFailures: number;
  lastSuccessfulResponseAt: string | null;
}

export const DEFAULT_ELM327_COMPATIBILITY: Elm327CompatibilityConfig = {
  ioTimeoutMs: 15_000,
  bluetoothConnectTimeoutMs: 5_000,
  commandDelayMs: 20,
  maxConnectionAttempts: 0,
  noDataReconnectThreshold: 4,
  recoveryBackoffMs: [2000, 5000, 15000],
  partialResponseAction: 'RECONNECT_AND_INITIALIZE',
  forceInitialization: true,
  forceInitCommands: ['ATZ', 'ATE0'],
  allowUnsupportedAtCommands: true,
  adaptiveTiming: true,
  adaptiveTimeoutMinMs: 3_000,
  adaptiveTimeoutMaxMs: 15_000,
  adaptiveTimeoutStepMs: 500,
  optionalAtTimeoutMs: 2500,
  protocolSelectionTimeoutMs: 15000,
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
    maxConnectionAttempts: boundedAttempts(merged.maxConnectionAttempts, DEFAULT_ELM327_COMPATIBILITY.maxConnectionAttempts, 0, 100),
    noDataReconnectThreshold: Math.max(1, Math.round(merged.noDataReconnectThreshold)),
    recoveryBackoffMs: Array.isArray(merged.recoveryBackoffMs) && merged.recoveryBackoffMs.length
      ? merged.recoveryBackoffMs.map((value) => Math.max(500, Math.round(Number(value) || 0))).slice(0, 5)
      : [2000, 5000, 15000],
    adaptiveTimeoutMinMs: Math.max(1000, Math.round(merged.adaptiveTimeoutMinMs)),
    adaptiveTimeoutMaxMs: Math.max(1000, Math.round(merged.adaptiveTimeoutMaxMs)),
    adaptiveTimeoutStepMs: Math.max(50, Math.round(merged.adaptiveTimeoutStepMs)),
    optionalAtTimeoutMs: Math.max(1000, Math.round(merged.optionalAtTimeoutMs)),
    protocolSelectionTimeoutMs: Math.max(1000, Math.round(merged.protocolSelectionTimeoutMs)),
  };
}
