import { PermissionsAndroid, Platform } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';
import { parsePidResponse } from './parser';
import { Elm327CompatibilityConfig, DEFAULT_ELM327_COMPATIBILITY, mergeCompatibilityConfig, classifyElmError, ElmErrorType } from './elm327Compatibility';
import { discoverIntelligentPids } from './intelligentPidDiscovery';
import type { PidDiscoveryCache } from '../meriva/autosaveState';
import bluetoothConfig from '../knowledge/bluetooth_config.json';

let lastBluetoothDiagnosticText = '';

export function logBluetoothDiagnostic(event: string, details?: unknown): void {
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
  '3': 'ISO 9141-2',
  '4': 'ISO 14230-4 KWP 5-BAUD',
  '5': 'ISO 14230-4 KWP FAST',
  '6': 'ISO 15765-4 CAN 11/500',
  '7': 'ISO 15765-4 CAN 29/500',
  '8': 'ISO 15765-4 CAN 11/250',
  '9': 'ISO 15765-4 CAN 29/250',
};

export function getElmProtocolName(protocolId: string): string {
  return ELM_PROTOCOL_NAMES[protocolId] ?? 'ELM327 PROTOCOLO ' + protocolId;
}

function classifyConnectionFailure(error: unknown): ElmErrorType {
  const message = error instanceof Error ? error.message : String(error ?? '');
  return classifyElmError(message, message);
}

function shouldTryProtocolFallback(result: ElmCommandResult): boolean {
  const value = String(result.response || '').toUpperCase();
  // Quando o ELM já respondeu explicitamente que não conseguiu acessar o barramento,
  // trocar o protocolo imediatamente só repete timeouts. O retry do candidato fica
  // sob controle do ciclo externo; aqui preservamos a causa observável.
  return !/\\b(?:NO DATA|UNABLE TO CONNECT|BUS INIT|BUS ERROR|STOPPED)\\b/.test(value);
}

export function isValidEcuProbe(result: ElmCommandResult): boolean {
  if (result.status !== 'OK' || !result.response.trim()) return false;
  const parsed = parsePidResponse('010C', result.response);
  return parsed.status === 'RESPONDEU' && parsed.value !== null && Number.isFinite(parsed.value);
}

export async function requestBluetoothPermissions(): Promise<void> {
  logBluetoothDiagnostic('PERMISSIONS_START', { platform: Platform.OS, version: Platform.Version });
  if (Platform.OS !== 'android') {
    logBluetoothDiagnostic('PERMISSIONS_SKIP_NON_ANDROID');
    return;
  }

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);

    logBluetoothDiagnostic('BLUETOOTH_PERMISSIONS_RESULT', result);
    if (Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error('PERMISSÃO DE DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA. PERMITA O ACESSO NAS CONFIGURAÇÕES DO APLICATIVO.');
    }

    // No Android 12+, operações Bluetooth usam BLUETOOTH_CONNECT/SCAN.
    // A permissão de localização do GPS é tratada separadamente pelo app.
    return;
  }

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
    PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
  ]);
  if (Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error('PERMISSÃO DE LOCALIZAÇÃO NECESSÁRIA NO ANDROID ANTIGO. PERMITA O ACESSO NAS CONFIGURAÇÕES DO APLICATIVO.');
  }
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

  for (let attempt = 1; attempt <= MAX_BLUETOOTH_ATTEMPTS; attempt++) {
    logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_START', {
      attempt,
      maxAttempts: MAX_BLUETOOTH_ATTEMPTS,
      retryIntervalMs: BLUETOOTH_RETRY_INTERVAL_MS,
      name: device.name,
      address: device.address,
    });

    try {
      const session = await createRealElmSessionAttempt(
        device,
        compatibility,
        pidDiscoveryCache,
        attempt,
        MAX_BLUETOOTH_ATTEMPTS,
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
      logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_RESULT', {
        attempt,
        result: 'FAILURE',
        error: cause instanceof Error ? cause.message : String(cause),
      });

      const failureType = classifyConnectionFailure(cause);
      logBluetoothDiagnostic('BLUETOOTH_FAILURE_CLASSIFIED', { attempt, failureType });
      const terminalEcuFailure = /ECU NÃO RESPONDEU AO 010C/i.test(cause instanceof Error ? cause.message : String(cause));
      if (attempt === MAX_BLUETOOTH_ATTEMPTS || terminalEcuFailure) {
        break;
      }

      const waitMs = Math.min(BLUETOOTH_RETRY_INTERVAL_MS * (2 ** (attempt - 1)), 8000);
      logBluetoothDiagnostic('BLUETOOTH_RETRY_WAIT_START', {
        attempt,
        nextAttempt: attempt + 1,
        waitMs,
        failureType,
        continueAfterSuccess: false,
      });
      await new Promise((resolve) => setTimeout(resolve, waitMs));
      logBluetoothDiagnostic('BLUETOOTH_RETRY_WAIT_END', {
        nextAttempt: attempt + 1,
      });
    }
  }

  logBluetoothDiagnostic('BLUETOOTH_TEST_SESSION_END', {
    attemptsTotal: MAX_BLUETOOTH_ATTEMPTS,
    successes: 0,
    failures: MAX_BLUETOOTH_ATTEMPTS,
    reason: 'MAX_ATTEMPTS_REACHED',
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
  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);
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

    const protocolFallbacks = ['5', '3', '4', '6', '7', '8', '9'];
    let successfulForcedProtocol: string | null = null;

    if (!probeIsValid && !shouldTryProtocolFallback(ecuProbe)) {
      logBluetoothDiagnostic('ECU_PROBE_TERMINAL', {
        response: ecuProbe.response,
        status: ecuProbe.status,
        action: 'SKIP_PROTOCOL_FALLBACKS',
      });
    }

    for (const protocol of protocolFallbacks) {
      if (probeIsValid || !shouldTryProtocolFallback(ecuProbe)) break;
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

    let supportedPids: string[] = [];
    let pidDiscoverySource: RealElmConnection['pidDiscoverySource'] = 'CACHE';

    if (cacheMatchesProtocol && pidDiscoveryCache) {
      supportedPids = Array.from(new Set(pidDiscoveryCache.supportedPids)).sort();
    } else {
      pidDiscoverySource = 'ECU';
      try {
        const discovery = await discoverIntelligentPids(session);
        supportedPids = discovery.supportedPids;
      } catch {
        supportedPids = [];
      }
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
