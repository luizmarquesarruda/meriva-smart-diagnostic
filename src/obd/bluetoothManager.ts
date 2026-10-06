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
    logBluetoothDiagnostic('LEGACY_LOCATION_PERMISSIONS_RESULT', result);
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
  await ensureBluetoothReady();
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
}

export async function createRealElmSession(
  device: BluetoothDeviceInfo,
  compatibility?: Partial<Elm327CompatibilityConfig>,
  pidDiscoveryCache?: PidDiscoveryCache | null,
): Promise<RealElmConnection> {
  logBluetoothDiagnostic('ELM_SESSION_START', { name: device.name, address: device.address });
  await ensureBluetoothReady();
  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);
  const session = new Elm327Session(new BluetoothClassicTransport(device.address, config), config);

  try {
    logBluetoothDiagnostic('ELM_INITIALIZATION_START');
    const initialization = await session.initialize();
    logBluetoothDiagnostic('ELM_INITIALIZATION_RESULT', initialization.map((item) => ({ command: item.command, status: item.status, response: item.response })));

    // Primeiro confirme ECU/ELM com um PID real e simples.
    // 010C funciona com a chave ligada mesmo com motor parado e evita
    // bombardear a ECU com vários blocos de descoberta antes do primeiro OK.
    logBluetoothDiagnostic('ECU_PROBE_START', { command: '010C' });
    let ecuProbe = await session.executeCommand('010C');
    logBluetoothDiagnostic('ECU_PROBE_RESULT', { status: ecuProbe.status, response: ecuProbe.response });
    let probeIsValid = isValidEcuProbe(ecuProbe);

    // ATSP0 é a primeira tentativa. Se o ELM/ECU não fechar a comunicação,
    // tente protocolos em ordem de evidência para esta família GM: primeiro K-Line,
    // depois CAN como fallback genérico de baixa prioridade.
    // IMPORTANTE: no ELM327, ATSP5 = ISO 14230 KWP FAST,
    // ATSP3 = ISO 9141-2 e ATSP4 = ISO 14230 KWP 5-baud.
    // ATSP6 NÃO é KWP: é CAN 11/500.
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

    // Bluetooth/ELM e ECU são camadas diferentes. Se a ECU não respondeu,
    // NÃO crie uma conexão OBD ativa. O relatório deve mostrar a falha e o
    // próximo candidato pareado poderá ser testado pelo sharedConnection.
    if (!probeIsValid) {
      throw new Error(`ECU NÃO RESPONDEU AO 010C: ${ecuProbe.status} | RX=${ecuProbe.response || 'N/D'}`);
    }

    // Depois do primeiro PID válido, atualize o protocolo efetivamente usado
    // pela sessão. Em modo automático o ATDP anterior pode ainda representar
    // somente a seleção AUTO, e não o protocolo negociado na ECU.
    await session.identifyProtocol();
    // O 010C válido já é a prova de que a ECU respondeu. Uma falha do
    // comando informativo ATDP/identificação não pode transformar uma ECU
    // comprovadamente ativa em "desconectada".
    const identifiedProtocol = session.getProtocol();
    const activeProtocol = successfulForcedProtocol && (!identifiedProtocol || identifiedProtocol === 'AUTO')
      ? getElmProtocolName(successfulForcedProtocol)
      : (identifiedProtocol ?? 'AUTO');

    // A ECU já foi validada. Se já temos uma descoberta persistida para o
    // mesmo protocolo, reutilize-a. Não interrogue novamente os blocos 0100,
    // 0120, 0140 e 0160.
    const negotiatedProtocol = session.getProtocol() ?? activeProtocol;
    const cacheMatchesProtocol =
      Boolean(pidDiscoveryCache) &&
      pidDiscoveryCache?.protocol === negotiatedProtocol;

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
    if (transportTrace) lastBluetoothDiagnosticText += (lastBluetoothDiagnosticText ? '\n' : '') + transportTrace;
    logBluetoothDiagnostic('ELM_SESSION_FAILURE', cause instanceof Error ? cause.message : String(cause));
    try {
      await session.close();
    } catch {
      // preserva o erro original
    }
    throw cause;
  }
}
