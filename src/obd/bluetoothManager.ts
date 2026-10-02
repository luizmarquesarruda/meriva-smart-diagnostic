import { PermissionsAndroid, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import RNBluetoothClassic from 'react-native-bluetooth-classic';
import { BluetoothClassicTransport, BluetoothDeviceInfo, discoverBluetoothDevices, listBondedBluetoothDevices } from './bluetoothClassicTransport';
import { Elm327Session, ElmCommandResult } from './elm327';

export const LAST_ELM_ADDRESS_KEY = '@meriva-smart/last-elm-address';
export type BootstrapStatus = 'BLUETOOTH DESLIGADO' | 'BLUETOOTH LIGADO' | 'BLUETOOTH CLASSIC NÃO SUPORTADO' | 'PERMISSÃO BLUETOOTH NEGADA';

async function requestBluetoothPermissions(discovery = true): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (Platform.Version >= 31) {
    const permissions = [PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT];
    if (discovery) permissions.push(PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN);
    const result = await PermissionsAndroid.requestMultiple(permissions);
    return permissions.every((permission) => result[permission] === PermissionsAndroid.RESULTS.GRANTED);
  }
  if (!discovery) return true;
  const result = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
  return result === PermissionsAndroid.RESULTS.GRANTED;
}

export async function bootstrapBluetooth(): Promise<BootstrapStatus> {
  if (Platform.OS !== 'android') return 'BLUETOOTH CLASSIC NÃO SUPORTADO';
  if (!(await RNBluetoothClassic.isBluetoothAvailable())) return 'BLUETOOTH CLASSIC NÃO SUPORTADO';
  if (!(await requestBluetoothPermissions(true))) return 'PERMISSÃO BLUETOOTH NEGADA';
  return (await RNBluetoothClassic.isBluetoothEnabled()) ? 'BLUETOOTH LIGADO' : 'BLUETOOTH DESLIGADO';
}

export async function requestBluetoothEnable(): Promise<boolean> {
  if (!(await RNBluetoothClassic.isBluetoothAvailable())) return false;
  const enabled = await RNBluetoothClassic.requestBluetoothEnabled();
  return enabled && await RNBluetoothClassic.isBluetoothEnabled();
}

export async function discoverPairedDevices(): Promise<BluetoothDeviceInfo[]> {
  return listBondedBluetoothDevices();
}

export async function discoverClassicDevices(): Promise<BluetoothDeviceInfo[]> {
  const paired = await listBondedBluetoothDevices();
  let discovered: BluetoothDeviceInfo[] = [];
  try { discovered = await discoverBluetoothDevices(); } catch {}
  const map = new Map<string, BluetoothDeviceInfo>();
  [...paired, ...discovered].forEach((device) => map.set(device.address, device));
  return Array.from(map.values());
}

export async function getLastElmAddress(): Promise<string | null> {
  return AsyncStorage.getItem(LAST_ELM_ADDRESS_KEY);
}

export async function createRealElmSession(device: BluetoothDeviceInfo): Promise<{ session: Elm327Session; initialization: ElmCommandResult[] }> {
  const session = new Elm327Session(new BluetoothClassicTransport(device.address));
  const initialization = await session.initialize();
  try {
    await session.confirmEcu();
  } catch (error) {
    await session.close();
    throw error;
  }
  await AsyncStorage.setItem(LAST_ELM_ADDRESS_KEY, device.address);
  return { session, initialization };
}

export function subscribeBluetoothState(onEnabled: (enabled: boolean) => void, onDisconnected?: () => void) {
  const stateSubscription = RNBluetoothClassic.onStateChanged((event) => onEnabled(!!event.enabled));
  const disconnectSubscription = onDisconnected ? RNBluetoothClassic.onDeviceDisconnected(() => onDisconnected()) : undefined;
  return {
    remove() {
      stateSubscription.remove();
      disconnectSubscription?.remove();
    },
  };
}
