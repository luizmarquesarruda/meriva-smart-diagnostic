import { PermissionsAndroid, Platform, Linking } from 'react-native';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';
import { discoverSupportedPids } from './pidScanner';
import { Elm327CompatibilityConfig, DEFAULT_ELM327_COMPATIBILITY, mergeCompatibilityConfig } from './elm327Compatibility';

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

export interface RealElmConnection {
  session: Elm327Session;
  initialization: ElmCommandResult[];
  protocol: string | null;
  ecuProbe: ElmCommandResult;
  supportedPids: string[];
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
    return;
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
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
): Promise<RealElmConnection> {
  await ensureBluetoothReady();
  const config = mergeCompatibilityConfig(compatibility ?? DEFAULT_ELM327_COMPATIBILITY);
  const session = new Elm327Session(new BluetoothClassicTransport(device.address, config), config);

  try {
    const initialization = await session.initialize();

    // Primeiro confirme ECU/ELM com um PID real e simples.
    // 010C funciona com a chave ligada mesmo com motor parado e evita
    // bombardear a ECU com vários blocos de descoberta antes do primeiro OK.
    const ecuProbe = await session.executeCommand('010C');
    const probeStream = ecuProbe.response.replace(/[^0-9A-F]/gi, '').toUpperCase();
    const probeMarker = '410C';
    const probeIndex = probeStream.indexOf(probeMarker);
    const probeIsValid =
      ecuProbe.status === 'OK' &&
      probeIndex >= 0 &&
      probeStream.length >= probeIndex + probeMarker.length + 4;

    // A conexão Bluetooth/ELM e a comunicação com a ECU são camadas diferentes.
    // O ELM já foi confirmado pelos comandos AT acima. Portanto, uma falha no
    // primeiro PID não pode derrubar a conexão Bluetooth nem iniciar um loop de
    // reconexão desnecessário. Isso também permite ligar o app antes da ECU estar
    // pronta e diagnosticar a causa real na tela.
    if (!probeIsValid) {
      return {
        session,
        initialization,
        protocol: session.getProtocol(),
        ecuProbe,
        supportedPids: [],
      };
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
      };
    }

    const discovery = await discoverSupportedPids(session);
    const supportedPids = Array.from(
      new Set(discovery.flatMap((item) => item.supportedPids)),
    ).sort();

    return {
      session,
      initialization,
      protocol: session.getProtocol(),
      ecuProbe,
      supportedPids,
    };
  } catch (cause) {
    try {
      await session.close();
    } catch {
      // preserva o erro original
    }
    throw cause;
  }
}
