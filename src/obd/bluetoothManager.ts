import { PermissionsAndroid, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';
import { Elm327CompatibilityConfig, DEFAULT_ELM327_COMPATIBILITY, mergeCompatibilityConfig } from './elm327Compatibility';
import { discoverIntelligentPids } from './intelligentPidDiscovery';
import type { PidDiscoveryCache } from '../meriva/autosaveState';

export type BluetoothConnectionStatus =
  | 'BLUETOOTH INDISPONÍVEL'
  | 'BLUETOOTH DESLIGADO'
  | 'BLUETOOTH CONECTANDO'
  | 'BLUETOOTH CONECTADO'
  | 'ELM RESPONDENDO'
  | 'ELM NÃO RESPONDE'
  | 'ECU RESPONDENDO'
  | 'ECU NÃO RESPONDE'
  | 'PROTOCOLO IDENTIFICADO'
  | 'PROTOCOLO NÃO IDENTIFICADO'
  | 'ERRO';

export interface BluetoothConnectionState {
  status: BluetoothConnectionStatus;
  device?: BluetoothDeviceInfo;
  error?: string;
}

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

export function isValidEcuProbe(result: ElmCommandResult): boolean {
  const stream = result.response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = '410C';
  const index = stream.indexOf(marker);
  return result.status === 'OK' && index >= 0 && stream.length >= index + marker.length + 4;
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

    // O app também usa o GPS para velocidade, distância e consumo.
    // Bluetooth não concede localização automaticamente, então a permissão
    // do GPS precisa ser solicitada separadamente.
    const location = await Location.requestForegroundPermissionsAsync();
    logBluetoothDiagnostic('LOCATION_PERMISSION_RESULT', { status: location.status });
    if (location.status !== Location.PermissionStatus.GRANTED) {
      throw new Error('PERMISSÃO DE LOCALIZAÇÃO NÃO CONCEDIDA. O GPS É NECESSÁRIO PARA VELOCIDADE E DISTÂNCIA.');
    }
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

  const available = await RNBluetoothClassic.isBluetoothAvailable();
  logBluetoothDiagnostic('BLUETOOTH_AVAILABLE', available);
  if (!available) {
    throw new Error('ESTE ANDROID NÃO POSSUI BLUETOOTH COMPATÍVEL');
  }

  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  logBluetoothDiagnostic('BLUETOOTH_ENABLED', enabled);
  if (enabled) return true;

  type BluetoothClassicWithEnable = typeof RNBluetoothClassic & {
    requestBluetoothEnabled?: () => Promise<boolean>;
  };
  const bluetoothClassic = RNBluetoothClassic as BluetoothClassicWithEnable;
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

  const enabledAfterRequest = await RNBluetoothClassic.isBluetoothEnabled();
  if (!enabledAfterRequest) {
    throw new Error('BLUETOOTH NÃO FOI ATIVADO. ATIVE-O PARA USAR O ELM327.');
  }

  return true;
}

export async function openBluetoothAppSettings(): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Linking.openSettings();
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

export const MAX_BLUETOOTH_ATTEMPTS = 20;
export const BLUETOOTH_RETRY_INTERVAL_MS = 8000;

export async function createRealElmSession(
  device: BluetoothDeviceInfo,
  compatibility?: Partial<Elm327CompatibilityConfig>,
  pidDiscoveryCache?: PidDiscoveryCache | null,
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
      );

      logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_RESULT', {
        attempt,
        result: 'SUCCESS',
      });
      logBluetoothDiagnostic('BLUETOOTH_TEST_SESSION_END', {
        attemptsTotal: attempt,
        successes: 1,
        failures: attempt - 1,
        reason: 'SUCCESS_STOPPED',
      });

      return session;
    } catch (cause) {
      lastCause = cause;
      logBluetoothDiagnostic('BLUETOOTH_ATTEMPT_RESULT', {
        attempt,
        result: 'FAILURE',
        error: cause instanceof Error ? cause.message : String(cause),
      });

      if (attempt === MAX_BLUETOOTH_ATTEMPTS) {
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
): Promise<RealElmConnection> {
  logBluetoothDiagnostic('ELM_SESSION_START', {
    name: device.name,
    address: device.address,
    attempt,
    maxAttempts,
  });
  await ensureBluetoothReady();
  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);
  const session = new Elm327Session(new BluetoothClassicTransport(device.address, config), config);

  try {
    logBluetoothDiagnostic('ELM_INITIALIZATION_START', { attempt, maxAttempts });
    const initialization = await session.initialize();
    logBluetoothDiagnostic('ELM_INITIALIZATION_RESULT', initialization.map((item) => ({ command: item.command, status: item.status, response: item.response })));

    logBluetoothDiagnostic('ECU_PROBE_START', { command: '010C', attempt, maxAttempts });
    let ecuProbe = await session.executeCommand('010C');
    logBluetoothDiagnostic('ECU_PROBE_RESULT', { status: ecuProbe.status, response: ecuProbe.response, attempt });
    let probeIsValid = isValidEcuProbe(ecuProbe);

    const protocolFallbacks = ['5', '3', '4', '6', '7', '8', '9'];
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
