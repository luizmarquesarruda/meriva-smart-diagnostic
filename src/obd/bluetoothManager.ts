import { Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';
import { parsePidResponse } from './parser';
import { Elm327CompatibilityConfig, DEFAULT_ELM327_COMPATIBILITY, mergeCompatibilityConfig, resolveMaxConnectionAttempts } from './elm327Compatibility';
import { discoverIntelligentPids } from './intelligentPidDiscovery';
import { getBluetoothRadioRecoveryStopReason } from './bluetoothRadioRecovery';
import type { PidDiscoveryCache } from '../meriva/autosaveState';
import bluetoothConfig from '../knowledge/bluetooth_config.json';
import { requestBluetoothPermissionsOnly } from '../permissions/permissionManager';

let lastBluetoothDiagnosticText = '';

function logBluetoothDiagnostic(event: string, details?: unknown): void {
  const time = new Date().toISOString();
  let line = `[${time}] ${event}`;
  if (details !== undefined) {
    try { line += ` | ${JSON.stringify(details)}`; }
    catch { line += ` | ${String(details)}`; }
  }
  lastBluetoothDiagnosticText += (lastBluetoothDiagnosticText ? '\n' : '') + line;
  const lines = lastBluetoothDiagnosticText.split('\n');
  if (lines.length > 800) lastBluetoothDiagnosticText = lines.slice(-800).join('\n');
}

export function getLastBluetoothDiagnosticText(): string { return lastBluetoothDiagnosticText; }
export function clearBluetoothDiagnostic(): void { lastBluetoothDiagnosticText = ''; }

export interface RealElmConnection {
  session: Elm327Session;
  initialization: ElmCommandResult[];
  protocol: string | null;
  ecuProbe: ElmCommandResult;
  supportedPids: string[];
  ecuValidated: boolean;
  pidDiscoverySource: 'CACHE' | 'ECU';
}

export interface RealElmSessionCallbacks {
  onBluetoothConnected?: () => void;
  onElmResponding?: () => void;
  onElmInitialized?: () => void;
  onEcuResponding?: () => void;
  onDisconnected?: (reason: string) => void;
}

/** A conexão só é considerada OBD real quando existe um payload 41 0C válido. */
const ELM_PROTOCOL_NAMES: Record<string, string> = {
  '0': 'AUTO',
  '1': 'SAE J1850 PWM',
  '2': 'SAE J1850 VPW',
  '3': 'ISO 9141-2',
  '4': 'ISO 14230-4 KWP 5-BAUD',
  '5': 'ISO 14230-4 KWP FAST',
  '6': 'ISO 15765-4 CAN 11/500',
  '7': 'ISO 15765-4 CAN 29/500',
  '8': 'ISO 15765-4 CAN 11/250',
  '9': 'ISO 15765-4 CAN 29/250',
};

export const ELM_PROTOCOL_FALLBACKS = ['5', '3', '4', '6', '7', '8', '9', '2', '1'] as const;

export function getElmProtocolName(protocolId: string): string {
  return ELM_PROTOCOL_NAMES[protocolId] ?? 'ELM327 PROTOCOLO ' + protocolId;
}

export function isValidEcuProbe(result: ElmCommandResult): boolean {
  if (result.status !== 'OK' || !result.response.trim()) return false;
  const parsed = parsePidResponse('010C', result.response);
  return parsed.status === 'RESPONDEU' && parsed.value !== null && Number.isFinite(parsed.value);
}

export function shouldRetryElmSessionAttempt(cause: unknown): boolean {
  const message = cause instanceof Error ? cause.message : String(cause ?? '');
  return !/ECU NÃO RESPONDEU AO 010C/i.test(message);
}

export async function requestBluetoothPermissions(): Promise<void> {
  logBluetoothDiagnostic('PERMISSIONS_START', { platform: Platform.OS, version: Platform.Version });
  const status = await requestBluetoothPermissionsOnly();
  if (status !== 'GRANTED') {
    throw new Error(
      status === 'BLOCKED'
        ? 'PERMISSÃO DE DISPOSITIVOS PRÓXIMOS BLOQUEADA. ABRA AS CONFIGURAÇÕES DO APLICATIVO E PERMITA O BLUETOOTH.'
        : 'PERMISSÃO DE DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA. PERMITA O ACESSO NAS CONFIGURAÇÕES DO APLICATIVO.',
    );
  }
  logBluetoothDiagnostic('BLUETOOTH_PERMISSIONS_RESULT', status);
}

export async function ensureBluetoothReady(): Promise<boolean> {
  logBluetoothDiagnostic('BLUETOOTH_READY_START');
  if (Platform.OS !== 'android') {
    throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
  }

  await requestBluetoothPermissions();

  const bluetoothClassic = RNBluetoothClassic as (typeof RNBluetoothClassic & {
    requestBluetoothEnabled?: () => Promise<boolean>;
  }) | undefined;

  if (!bluetoothClassic) {
    logBluetoothDiagnostic('BLUETOOTH_NATIVE_MODULE_UNAVAILABLE');
    throw new Error('MÓDULO BLUETOOTH CLASSIC NÃO ESTÁ DISPONÍVEL NO BUILD NATIVO. REINSTALE/RECONSTRUA O APK.');
  }

  const available = await bluetoothClassic.isBluetoothAvailable();
  logBluetoothDiagnostic('BLUETOOTH_AVAILABLE', available);
  if (!available) {
    throw new Error('ESTE ANDROID NÃO POSSUI BLUETOOTH COMPATÍVEL');
  }

  let enabled = await bluetoothClassic.isBluetoothEnabled();
  logBluetoothDiagnostic('BLUETOOTH_ENABLED', enabled);
  if (!enabled) {
    await new Promise((resolve) => setTimeout(resolve, 250));
    enabled = await bluetoothClassic.isBluetoothEnabled();
    logBluetoothDiagnostic('BLUETOOTH_ENABLED_RECHECK', enabled);
  }
  if (enabled) return true;

  const requestBluetoothEnabled = bluetoothClassic.requestBluetoothEnabled;

  if (typeof requestBluetoothEnabled !== 'function') {
    throw new Error('BIBLIOTECA BLUETOOTH SEM SUPORTE PARA ATIVAÇÃO DO RÁDIO.');
  }

  logBluetoothDiagnostic('BLUETOOTH_ENABLE_REQUEST');
  const requested = await requestBluetoothEnabled();
  logBluetoothDiagnostic('BLUETOOTH_ENABLE_RESULT', requested);
  if (!requested) {
    throw new Error('BLUETOOTH CONTINUA DESLIGADO. ATIVE-O PARA USAR O ELM327.');
  }

  const enabledAfterRequest = await bluetoothClassic.isBluetoothEnabled();
  if (!enabledAfterRequest) {
    throw new Error('BLUETOOTH NÃO FOI ATIVADO. ATIVE-O PARA USAR O ELM327.');
  }

  return true;
}

export async function discoverPairedDevices(): Promise<BluetoothDeviceInfo[]> {
  logBluetoothDiagnostic('PAIRED_DISCOVERY_START');
  try {
    const devices = await listBondedBluetoothDevices();
    logBluetoothDiagnostic('PAIRED_DISCOVERY_RESULT', {
      count: devices.length,
      devices: devices.map((device) => ({ name: device.name, address: device.address })),
    });
    return devices;
  } catch (cause) {
    logBluetoothDiagnostic('PAIRED_DISCOVERY_FAILURE', cause instanceof Error ? cause.message : String(cause));
    throw cause;
  }
}

export const MAX_BLUETOOTH_ATTEMPTS = bluetoothConfig.retry.maxAttempts;
export const BLUETOOTH_RETRY_INTERVAL_MS = bluetoothConfig.retry.intervalMs;

export async function createRealElmSession(
  device: BluetoothDeviceInfo,
  compatibility?: Partial<Elm327CompatibilityConfig>,
  pidDiscoveryCache?: PidDiscoveryCache | null,
  callbacks?: RealElmSessionCallbacks,
): Promise<RealElmConnection> {
  let lastCause: unknown = null;
  let attemptsExecuted = 0;
  let terminalReason = 'MAX_ATTEMPTS_REACHED';
  const config = mergeCompatibilityConfig({
    ...(compatibility ?? DEFAULT_ELM327_COMPATIBILITY),
    optionalAtTimeoutMs: compatibility?.optionalAtTimeoutMs ?? bluetoothConfig.initialization.optionalCommandTimeoutMs,
    protocolSelectionTimeoutMs: compatibility?.protocolSelectionTimeoutMs ?? bluetoothConfig.initialization.protocolSelectionTimeoutMs,
  });
  const effectiveMaxAttempts = resolveMaxConnectionAttempts(config.maxConnectionAttempts, MAX_BLUETOOTH_ATTEMPTS);

  for (let attempt = 1; attempt <= effectiveMaxAttempts; attempt++) {
    attemptsExecuted = attempt;
    logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_START', {
      attempt,
      maxAttempts: effectiveMaxAttempts,
      retryIntervalMs: BLUETOOTH_RETRY_INTERVAL_MS,
      name: device.name,
      address: device.address,
    });

    try {
      const session = await createRealElmSessionAttempt(
        device,
        config,
        pidDiscoveryCache,
        attempt,
        effectiveMaxAttempts,
        callbacks,
      );

      logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_RESULT', {
        attempt,
        result: 'SUCCESS',
      });
      logBluetoothDiagnostic('BLUETOOTH_TEST_SESSION_END', {
        attemptsTotal: attempt,
        successes: 1,
        failures: attempt - 1,
        reason: bluetoothConfig.retry.stopOnSuccess ? 'SUCCESS_STOPPED' : 'SUCCESS_CONTINUE',
      });

      return session;
    } catch (cause) {
      lastCause = cause;
      const errorMessage = cause instanceof Error ? cause.message : String(cause);
      logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_RESULT', {
        attempt,
        result: 'FAILURE',
        error: errorMessage,
      });

      const radioStopReason = getBluetoothRadioRecoveryStopReason(cause);
      if (radioStopReason) {
        terminalReason = radioStopReason;
        logBluetoothDiagnostic('BLUETOOTH_RETRY_STOPPED', {
          attempt,
          reason: radioStopReason,
          error: errorMessage,
        });
        break;
      }

      if (!shouldRetryElmSessionAttempt(cause)) {
        terminalReason = 'ECU_PROBE_EXHAUSTED';
        logBluetoothDiagnostic('BLUETOOTH_RETRY_STOPPED', { attempt, reason: terminalReason, error: errorMessage, action: 'NEXT_PAIRED_CANDIDATE' });
        break;
      }

      if (attempt === effectiveMaxAttempts) {
        break;
      }

      logBluetoothDiagnostic('BLUETOOTH_RETRY_WAIT_START', {
        attempt,
        nextAttempt: attempt + 1,
        waitMs: BLUETOOTH_RETRY_INTERVAL_MS,
        continueAfterSuccess: false,
      });
      await new Promise((resolve) => setTimeout(resolve, BLUETOOTH_RETRY_INTERVAL_MS));
      logBluetoothDiagnostic('BLUETOOTH_RETRY_WAIT_END', {
        nextAttempt: attempt + 1,
      });
    }
  }

  logBluetoothDiagnostic('BLUETOOTH_TEST_SESSION_END', {
    attemptsTotal: attemptsExecuted,
    successes: 0,
    failures: attemptsExecuted,
    reason: terminalReason,
  });

  throw lastCause instanceof Error
    ? lastCause
    : new Error(String(lastCause ?? 'FALHA BLUETOOTH SEM CAUSA'));
}

async function createRealElmSessionAttempt(
  device: BluetoothDeviceInfo,
  compatibility: Partial<Elm327CompatibilityConfig> | undefined,
  pidDiscoveryCache: PidDiscoveryCache | null | undefined,
  attempt: number,
  maxAttempts: number,
  callbacks?: RealElmSessionCallbacks,
): Promise<RealElmConnection> {
  logBluetoothDiagnostic('ELM_SESSION_START', {
    name: device.name,
    address: device.address,
    attempt,
    maxAttempts,
  });
  // A prontidão do Bluetooth e a descoberta dos pareados pertencem ao fluxo
  // chamador (sharedConnection). Cada retry deve começar diretamente na sessão
  // RFCOMM/ELM, sem reabrir permissões ou reiniciar a preparação Bluetooth.
  const config = mergeCompatibilityConfig({
    ...(compatibility ?? DEFAULT_ELM327_COMPATIBILITY),
    optionalAtTimeoutMs: compatibility?.optionalAtTimeoutMs ?? bluetoothConfig.initialization.optionalCommandTimeoutMs,
    protocolSelectionTimeoutMs: compatibility?.protocolSelectionTimeoutMs ?? bluetoothConfig.initialization.protocolSelectionTimeoutMs,
  });
  const session = new Elm327Session(
    new BluetoothClassicTransport(device.address, config, {
      onConnected: callbacks?.onBluetoothConnected,
      onDisconnected: callbacks?.onDisconnected,
    }),
    config,
  );

  try {
    logBluetoothDiagnostic('ELM_INITIALIZATION_START', { attempt, maxAttempts });
    const initialization = await session.initialize();
    callbacks?.onElmResponding?.();
    logBluetoothDiagnostic('ELM_RESPONDING', { attempt });
    callbacks?.onElmInitialized?.();
    logBluetoothDiagnostic('ELM_INITIALIZED', { attempt });
    logBluetoothDiagnostic('ELM_INITIALIZATION_RESULT', initialization.map((item) => ({ command: item.command, status: item.status, response: item.response })));
    logBluetoothDiagnostic('ECU_PROBE_START', { command: '010C', attempt, maxAttempts });
    let ecuProbe = await session.executeCommand('010C');
    logBluetoothDiagnostic('ECU_PROBE_RESULT', { status: ecuProbe.status, response: ecuProbe.response, attempt });
    let probeIsValid = isValidEcuProbe(ecuProbe);

    const protocolFallbacks = ELM_PROTOCOL_FALLBACKS;
    let successfulForcedProtocol: string | null = null;

    for (const protocol of protocolFallbacks) {
      if (probeIsValid) break;
      const forcedProtocol = await session.executeCommand(`ATSP${protocol}`);
      if (forcedProtocol.status !== 'OK') continue;
      ecuProbe = await session.executeCommand('010C');
      probeIsValid = isValidEcuProbe(ecuProbe);
      if (probeIsValid) successfulForcedProtocol = protocol;
    }

    if (!probeIsValid) {
      throw new Error(`ECU NÃO RESPONDEU AO 010C: ${ecuProbe.status} | RX=${ecuProbe.response || 'N/D'}`);
    }
    callbacks?.onEcuResponding?.();

    await session.identifyProtocol();
    const identifiedProtocol = session.getProtocol();
    const activeProtocol = successfulForcedProtocol && (!identifiedProtocol || identifiedProtocol === 'AUTO')
      ? getElmProtocolName(successfulForcedProtocol)
      : (identifiedProtocol ?? 'AUTO');
    const negotiatedProtocol = session.getProtocol() ?? activeProtocol;
    const cacheMatchesProtocol = Boolean(pidDiscoveryCache) && pidDiscoveryCache?.protocol === negotiatedProtocol;
    // O cache só prioriza candidatos. A cada sessão, a ECU atual precisa anunciar
    // os bitmaps e responder aos PIDs sondados; um cache não prova suporte atual.
    const cachedPidPriority = cacheMatchesProtocol && pidDiscoveryCache
      ? Array.from(new Set(pidDiscoveryCache.supportedPids)).sort()
      : [];

    let supportedPids: string[] = [];
    const pidDiscoverySource: RealElmConnection['pidDiscoverySource'] = 'ECU';
    const pidDiscoveryStartedAt = Date.now();
    logBluetoothDiagnostic('PID_DISCOVERY_START', {
      protocol: negotiatedProtocol,
      cacheMatchesProtocol,
      cachedPriorityCount: cachedPidPriority.length,
      gatePid: '010C',
      gateResponseReused: true,
    });

    try {
      const discovery = await discoverIntelligentPids(session, {
        knownPids: cachedPidPriority,
        prevalidatedResults: [ecuProbe],
      });
      supportedPids = discovery.supportedPids;

      for (const observation of discovery.observations) {
        const isBitmap = observation.unit === 'BITMAP';
        logBluetoothDiagnostic('PID_DISCOVERY_COMMAND_RESULT', {
          command: observation.pid,
          kind: isBitmap ? 'BITMAP' : observation.pid === '010C' ? 'REUSED_ECU_GATE' : 'PID_PROBE',
          status: observation.status,
          elapsedMs: observation.elapsedMs,
          value: observation.value,
          unit: observation.unit,
          confidence: observation.confidence,
          reason: observation.reason,
          response: observation.response,
        });
      }

      const measured = discovery.observations.filter((item) =>
        item.pid !== '010C' && Number.isFinite(item.elapsedMs) && item.elapsedMs >= 0
      );
      logBluetoothDiagnostic('PID_DISCOVERY_SUMMARY', {
        protocol: negotiatedProtocol,
        cacheUsedForPriorityOnly: cacheMatchesProtocol,
        cachedPriorityCount: cachedPidPriority.length,
        bitmapPages: Object.keys(discovery.supportResponses),
        bitmapCommandCount: measured.filter((item) => item.unit === 'BITMAP').length,
        pidProbeCount: measured.filter((item) => item.unit !== 'BITMAP').length,
        measuredCommandCount: measured.length,
        commandElapsedTotalMs: measured.reduce((total, item) => total + item.elapsedMs, 0),
        maxCommandElapsedMs: measured.reduce((maximum, item) => Math.max(maximum, item.elapsedMs), 0),
        wallElapsedMs: Date.now() - pidDiscoveryStartedAt,
        supportedPidCount: supportedPids.length,
        supportedPids,
      });
    } catch (cause) {
      supportedPids = [];
      logBluetoothDiagnostic('PID_DISCOVERY_FAILURE', {
        protocol: negotiatedProtocol,
        wallElapsedMs: Date.now() - pidDiscoveryStartedAt,
        error: cause instanceof Error ? cause.message : String(cause),
      });
    }

    return {
      session,
      initialization,
      protocol: negotiatedProtocol || null,
      ecuProbe,
      supportedPids,
      ecuValidated: true,
      pidDiscoverySource,
    };
  } catch (cause) {
    const transportTrace = session.getTransportDiagnosticsText();
    if (transportTrace) {
      logBluetoothDiagnostic('ATTEMPT_TRANSPORT_TRACE', { attempt, trace: transportTrace });
    }
    logBluetoothDiagnostic('ELM_SESSION_FAILURE', {
      attempt,
      error: cause instanceof Error ? cause.message : String(cause),
    });
    try { await session.close(); } catch { /* preserva o erro original */ }
    throw cause;
  }
}
