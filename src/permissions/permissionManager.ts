import { PermissionsAndroid, Platform } from 'react-native';
import * as Location from 'expo-location';

export interface PermissionAudit {
  bluetooth: 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';
  location: 'GRANTED' | 'DENIED' | 'BLOCKED' | 'UNAVAILABLE';
  storage: 'APP_PRIVATE' | 'GRANTED' | 'DENIED' | 'UNAVAILABLE';
}

function mapAndroid(status: string): PermissionAudit['bluetooth'] {
  if (status === PermissionsAndroid.RESULTS.GRANTED) return 'GRANTED';
  if (status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN) return 'BLOCKED';
  return 'DENIED';
}

/**
 * Bluetooth Classic em Android 12+ usa BLUETOOTH_CONNECT/SCAN como
 * permissões runtime. Em versões anteriores, a descoberta Classic depende
 * da permissão de localização, tratada separadamente por
 * requestLocationPermissionsOnly().
 */
export async function requestBluetoothPermissionsOnly(): Promise<PermissionAudit['bluetooth']> {
  if (Platform.OS !== 'android') return 'UNAVAILABLE';

  if (Platform.Version < 31) return 'GRANTED';

  const result = await PermissionsAndroid.requestMultiple([
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
    PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
  ]);

  const statuses = [
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT],
    result[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN],
  ];

  if (statuses.every((status) => status === PermissionsAndroid.RESULTS.GRANTED)) return 'GRANTED';
  if (statuses.some((status) => status === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)) return 'BLOCKED';
  return 'DENIED';
}

export async function requestBackgroundLocationPermissionsOnly(): Promise<PermissionAudit['location']> {
  if (Platform.OS !== 'android') return 'UNAVAILABLE';
  if (Platform.Version < 29) return 'GRANTED';

  let permission = await Location.getBackgroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestBackgroundPermissionsAsync();
  }

  if (permission.status === Location.PermissionStatus.GRANTED) return 'GRANTED';
  return permission.canAskAgain === false ? 'BLOCKED' : 'DENIED';
}

export async function requestLocationPermissionsOnly(): Promise<PermissionAudit['location']> {
  if (Platform.OS !== 'android') return 'UNAVAILABLE';

  let permission = await Location.getForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    permission = await Location.requestForegroundPermissionsAsync();
  }

  if (permission.status === Location.PermissionStatus.GRANTED) return 'GRANTED';
  return permission.canAskAgain === false ? 'BLOCKED' : 'DENIED';
}

/**
 * Auditoria única das permissões runtime necessárias ao aplicativo.
 * O armazenamento interno do app não requer uma permissão Android ampla.
 */
export async function requestAllRequiredPermissions(): Promise<PermissionAudit> {
  const bluetooth = await requestBluetoothPermissionsOnly();
  const location = await requestLocationPermissionsOnly();

  return {
    bluetooth,
    location,
    storage: 'APP_PRIVATE',
  };
}
