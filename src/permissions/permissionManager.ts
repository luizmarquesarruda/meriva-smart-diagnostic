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
 * Solicita somente permissões que o aplicativo realmente usa.
 * Android moderno não exige READ/WRITE_EXTERNAL_STORAGE para os dados
 * internos do aplicativo; pedir essa permissão seria incorreto e não
 * resolveria a exportação via Storage Access Framework.
 */
export async function requestBluetoothPermissionsOnly(): Promise<PermissionAudit['bluetooth']> {
  if (Platform.OS !== 'android') return 'UNAVAILABLE';

  audit.bluetooth = await requestBluetoothPermissionsOnly();

  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) {
    audit.location = 'DENIED';
    return audit;
  }

  let location = await Location.getForegroundPermissionsAsync();
  if (location.status !== Location.PermissionStatus.GRANTED) {
    location = await Location.requestForegroundPermissionsAsync();
  }
  audit.location = location.status === Location.PermissionStatus.GRANTED
    ? 'GRANTED'
    : location.canAskAgain === false
      ? 'BLOCKED'
      : 'DENIED';

  return audit;
}
