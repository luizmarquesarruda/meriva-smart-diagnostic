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
  maxConnectionAttempts: 20,
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

function boundedInteger(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

export function mergeCompatibilityConfig(
  partial?: Partial<Elm327CompatibilityConfig>,
): Elm327CompatibilityConfig {
  const merged = { ...DEFAULT_ELM327_COMPATIBILITY, ...(partial ?? {}) };
  const adaptiveTimeoutMinMs = boundedInteger(
    merged.adaptiveTimeoutMinMs,
    DEFAULT_ELM327_COMPATIBILITY.adaptiveTimeoutMinMs,
    1000,
    30_000,
  );
  const adaptiveTimeoutMaxMs = boundedInteger(
    merged.adaptiveTimeoutMaxMs,
    Math.max(adaptiveTimeoutMinMs, DEFAULT_ELM327_COMPATIBILITY.adaptiveTimeoutMaxMs),
    adaptiveTimeoutMinMs,
    120_000,
  );
  const recoveryBackoffMs = Array.isArray(merged.recoveryBackoffMs) && merged.recoveryBackoffMs.length
    ? merged.recoveryBackoffMs.slice(0, 5).map((value, index) => boundedInteger(
        value,
        DEFAULT_ELM327_COMPATIBILITY.recoveryBackoffMs[index] ?? 5000,
        500,
        120_000,
      ))
    : [...DEFAULT_ELM327_COMPATIBILITY.recoveryBackoffMs];
  const configuredCommands = Array.isArray(merged.forceInitCommands)
    ? merged.forceInitCommands
      .filter((command): command is string => typeof command === 'string')
      .map((command) => command.toUpperCase())
      .filter((command) => /^AT[A-Z0-9]+$/.test(command))
    : [];
  return {
    ...merged,
    ioTimeoutMs: boundedInteger(merged.ioTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.ioTimeoutMs, 1000, 120_000),
    bluetoothConnectTimeoutMs: boundedInteger(merged.bluetoothConnectTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.bluetoothConnectTimeoutMs, 1000, 120_000),
    commandDelayMs: boundedInteger(merged.commandDelayMs, DEFAULT_ELM327_COMPATIBILITY.commandDelayMs, 0, 5000),
    maxConnectionAttempts: boundedInteger(merged.maxConnectionAttempts, DEFAULT_ELM327_COMPATIBILITY.maxConnectionAttempts, 0, 100),
    noDataReconnectThreshold: boundedInteger(merged.noDataReconnectThreshold, DEFAULT_ELM327_COMPATIBILITY.noDataReconnectThreshold, 1, 100),
    recoveryBackoffMs,
    partialResponseAction: ['RECONNECT_AND_INITIALIZE', 'RECONNECT', 'IGNORE'].includes(merged.partialResponseAction)
      ? merged.partialResponseAction
      : DEFAULT_ELM327_COMPATIBILITY.partialResponseAction,
    forceInitialization: typeof merged.forceInitialization === 'boolean'
      ? merged.forceInitialization
      : DEFAULT_ELM327_COMPATIBILITY.forceInitialization,
    forceInitCommands: configuredCommands.length ? [...new Set(configuredCommands)] : [...DEFAULT_ELM327_COMPATIBILITY.forceInitCommands],
    allowUnsupportedAtCommands: typeof merged.allowUnsupportedAtCommands === 'boolean'
      ? merged.allowUnsupportedAtCommands
      : DEFAULT_ELM327_COMPATIBILITY.allowUnsupportedAtCommands,
    adaptiveTiming: typeof merged.adaptiveTiming === 'boolean'
      ? merged.adaptiveTiming
      : DEFAULT_ELM327_COMPATIBILITY.adaptiveTiming,
    adaptiveTimeoutMinMs,
    adaptiveTimeoutMaxMs,
    adaptiveTimeoutStepMs: boundedInteger(merged.adaptiveTimeoutStepMs, DEFAULT_ELM327_COMPATIBILITY.adaptiveTimeoutStepMs, 50, 10_000),
    optionalAtTimeoutMs: boundedInteger(merged.optionalAtTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.optionalAtTimeoutMs, 1000, 30_000),
    protocolSelectionTimeoutMs: boundedInteger(merged.protocolSelectionTimeoutMs, DEFAULT_ELM327_COMPATIBILITY.protocolSelectionTimeoutMs, 1000, 120_000),
  };
}
