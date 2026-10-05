import { PermissionsAndroid, Platform, Linking } from 'react-native';
import * as Location from 'expo-location';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';
import { Elm327CompatibilityConfig, DEFAULT_ELM327_COMPATIBILITY, mergeCompatibilityConfig } from './elm327Compatibility';
import { discoverSupportedPids } from './pidScanner';

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

export function getLastBluetoothDiagnosticText(): string { return lastBluetoothDiagnosticText; }

export interface PidDiscoveryCache {
  supportedPids: string[];
  protocol: string;
  discoveredAt: string;
}

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
export function isValidEcuProbe(result: ElmCommandResult): boolean {
  const stream = result.response.replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = '410C';
  const index = stream.indexOf(marker);
  return result.status === 'OK' && index >= 0 && stream.length >= index + marker.length + 4;
}

export async function requestBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);

    if (Object.values(result).some((value) => value !== PermissionsAndroid.RESULTS.GRANTED)) {
      throw new Error('PERMISSÃO DE DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA. PERMITA O ACESSO NAS CONFIGURAÇÕES DO APLICATIVO.');
    }

    // O app também usa o GPS para velocidade, distância e consumo.
    // Bluetooth não concede localização automaticamente, então a permissão
    // do GPS precisa ser solicitada separadamente.
    const location = await Location.requestForegroundPermissionsAsync();
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
  if (Platform.OS !== 'android') {
    throw new Error('BLUETOOTH CLASSIC DISPONÍVEL SOMENTE NO ANDROID');
  }

  await requestBluetoothPermissions();

  const available = await RNBluetoothClassic.isBluetoothAvailable();
  if (!available) {
    throw new Error('ESTE ANDROID NÃO POSSUI BLUETOOTH COMPATÍVEL');
  }

  const enabled = await RNBluetoothClassic.isBluetoothEnabled();
  if (enabled) return true;

  type BluetoothClassicWithEnable = typeof RNBluetoothClassic & {
    requestBluetoothEnabled?: () => Promise<boolean>;
  };
  const bluetoothClassic = RNBluetoothClassic as BluetoothClassicWithEnable;
  const requestBluetoothEnabled = bluetoothClassic.requestBluetoothEnabled;

  if (typeof requestBluetoothEnabled !== 'function') {
    throw new Error('BIBLIOTECA BLUETOOTH SEM SUPORTE PARA ATIVAÇÃO DO RÁDIO.');
  }

  const requested = await requestBluetoothEnabled();
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
  await ensureBluetoothReady();
  return listBondedBluetoothDevices();
}

export async function createRealElmSession(
  device: BluetoothDeviceInfo,
  compatibility?: Partial<Elm327CompatibilityConfig>,
  pidDiscoveryCache?: PidDiscoveryCache | null,
): Promise<RealElmConnection> {
  await ensureBluetoothReady();
  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);
  const session = new Elm327Session(new BluetoothClassicTransport(device.address, config), config);

  try {
    const initialization = await session.initialize();

    // Primeiro confirme ECU/ELM com um PID real e simples.
    // 010C funciona com a chave ligada mesmo com motor parado e evita
    // bombardear a ECU com vários blocos de descoberta antes do primeiro OK.
    let ecuProbe = await session.executeCommand('010C');
    let probeStream = ecuProbe.response.replace(/[^0-9A-F]/gi, '').toUpperCase();
    let probeIsValid = isValidEcuProbe(ecuProbe);

    // A Meriva usa ISO 14230-4 KWP Fast Init. Em clones v1.5 baratos, a
    // descoberta automática ATSP0 pode falhar ou escolher mal o protocolo.
    // Se o primeiro 010C não validar, faça uma única tentativa direcionada
    // ATSP6. A Meriva usa ISO 14230-4 KWP Fast Init; ATSP5 é KWP 5-baud e
    // não é o fallback correto para esta ECU. Isso mantém Bluetooth/ELM
    // conectados e evita um ciclo destrutivo de reconexão.
    if (!probeIsValid) {
      const forcedKwp = await session.executeCommand('ATSP6');
      if (forcedKwp.status === 'OK') {
        ecuProbe = await session.executeCommand('010C');
        probeStream = ecuProbe.response.replace(/[^0-9A-F]/gi, '').toUpperCase();
        probeIsValid = isValidEcuProbe(ecuProbe);
      }
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
    const protocolResult = await session.identifyProtocol();
    if (protocolResult.status !== 'OK' || !session.getProtocol()) {
      return {
        session,
        initialization,
        protocol: session.getProtocol(),
        ecuProbe,
        supportedPids: [],
        ecuValidated: false,
        pidDiscoverySource: 'ECU',
      };
    }

    // A ECU já foi validada. Se já temos uma descoberta persistida para o
    // mesmo protocolo, reutilize-a. Não interrogue novamente os blocos 0100,
    // 0120, 0140 e 0160.
    const activeProtocol = session.getProtocol() ?? '';
    const cacheMatchesProtocol =
      Boolean(pidDiscoveryCache) &&
      pidDiscoveryCache?.protocol === activeProtocol;

    let supportedPids: string[] = [];
    let pidDiscoverySource: RealElmConnection['pidDiscoverySource'] = 'CACHE';

    if (cacheMatchesProtocol && pidDiscoveryCache) {
      supportedPids = Array.from(new Set(pidDiscoveryCache.supportedPids)).sort();
    } else {
      pidDiscoverySource = 'ECU';
      try {
        const discovery = await discoverSupportedPids(session);
        supportedPids = Array.from(new Set(discovery.flatMap((item) => item.supportedPids))).sort();
      } catch {
        supportedPids = [];
      }
    }

    return {
      session,
      initialization,
      protocol: activeProtocol || null,
      ecuProbe,
      supportedPids,
      ecuValidated: true,
      pidDiscoverySource,
    };
  } catch (cause) {
    lastBluetoothDiagnosticText = session.getTransportDiagnosticsText();
    try {
      await session.close();
    } catch {
      // preserva o erro original
    }
    throw cause;
  }
}
