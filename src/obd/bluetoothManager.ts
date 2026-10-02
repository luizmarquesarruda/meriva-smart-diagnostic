import { PermissionsAndroid, Platform, NativeModules } from 'react-native';
import { BluetoothClassicTransport, BluetoothDeviceInfo, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { ElmCommandResult, Elm327Session } from './elm327';

type NativeBluetoothControl = {
  isBluetoothAvailable?: () => Promise<boolean>;
  isBluetoothEnabled?: () => Promise<boolean>;
  requestBluetoothEnabled?: () => Promise<boolean>;
  openBluetoothSettings?: () => void;
};

function getNativeBluetoothControl(): NativeBluetoothControl {
  if (Platform.OS !== 'android') {
    throw new Error('BLUETOOTH DISPONÍVEL SOMENTE NO ANDROID');
  }

  const nativeModule = (NativeModules as Record<string, unknown>).RNBluetoothClassic as NativeBluetoothControl | undefined;
  if (!nativeModule) {
    throw new Error('MÓDULO BLUETOOTH CLASSIC AUSENTE. USE UM DEVELOPMENT BUILD ANDROID.');
  }

  return nativeModule;
}

export type BluetoothConnectionStatus =
  | 'BLUETOOTH DESLIGADO' | 'BLUETOOTH CONECTANDO' | 'BLUETOOTH CONECTADO'
  | 'ELM RESPONDENDO' | 'ELM NÃO RESPONDE' | 'ECU RESPONDENDO' | 'ECU NÃO RESPONDE'
  | 'PROTOCOLO IDENTIFICADO' | 'PROTOCOLO NÃO IDENTIFICADO' | 'ERRO';

export interface BluetoothConnectionState { status: BluetoothConnectionStatus; device?: BluetoothDeviceInfo; error?: string; }
export interface RealElmConnection { session: Elm327Session; initialization: ElmCommandResult[]; }

export async function requestBluetoothPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  if (Platform.Version >= 31) {
    const result = await PermissionsAndroid.requestMultiple([
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
      PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
    ]);

    const denied = Object.entries(result).filter(([, value]) => value !== PermissionsAndroid.RESULTS.GRANTED);
    if (denied.length) {
      throw new Error('PERMISSÃO DE DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA');
    }
    return;
  }

  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  if (result !== PermissionsAndroid.RESULTS.GRANTED) {
    throw new Error('PERMISSÃO DE LOCALIZAÇÃO NECESSÁRIA NO ANDROID ANTIGO');
  }
}

export async function ensureBluetoothReady(): Promise<boolean> {
  const native = getNativeBluetoothControl();

  await requestBluetoothPermissions();

  if (native.isBluetoothAvailable && !(await native.isBluetoothAvailable())) {
    throw new Error('ESTE ANDROID NÃO POSSUI BLUETOOTH COMPATÍVEL');
  }

  const enabled = native.isBluetoothEnabled ? await native.isBluetoothEnabled() : false;
  if (enabled) return true;

  if (!native.requestBluetoothEnabled) {
    throw new Error('NÃO FOI POSSÍVEL SOLICITAR A ATIVAÇÃO DO BLUETOOTH');
  }

  const enabledAfterRequest = await native.requestBluetoothEnabled();
  if (!enabledAfterRequest || (native.isBluetoothEnabled && !(await native.isBluetoothEnabled()))) {
    throw new Error('BLUETOOTH CONTINUA DESLIGADO. ATIVE-O PARA USAR O ELM327.');
  }

  return true;
}

export function openBluetoothSettings(): void {
  const native = getNativeBluetoothControl();
  if (native.openBluetoothSettings) native.openBluetoothSettings();
}

export async function discoverPairedDevices(): Promise<BluetoothDeviceInfo[]> {
  await ensureBluetoothReady();
  return listBondedBluetoothDevices();
}

export async function createRealElmSession(device: BluetoothDeviceInfo): Promise<RealElmConnection> {
  await ensureBluetoothReady();
  const session = new Elm327Session(new BluetoothClassicTransport(device.address));
  const initialization = await session.initialize();
  return { session, initialization };
}
