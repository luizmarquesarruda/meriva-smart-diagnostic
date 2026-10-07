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
export async function requestAllRequiredPermissions(): Promise<PermissionAudit> {
  const audit: PermissionAudit = {
    bluetooth: 'UNAVAILABLE',
    location: 'UNAVAILABLE',
    storage: Platform.OS === 'android' ? 'APP_PRIVATE' : 'UNAVAILABLE',
  };

  if (Platform.OS !== 'android') return audit;

  const bluetoothPermissions = Platform.Version >= 31
    ? [
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
      ]
    : [
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION,
        PermissionsAndroid.PERMISSIONS.ACCESS_COARSE_LOCATION,
      ];

  const bluetoothResult = await PermissionsAndroid.requestMultiple(bluetoothPermissions);
  const bluetoothValues = Object.values(bluetoothResult);
  audit.bluetooth = bluetoothValues.every((v) => v === PermissionsAndroid.RESULTS.GRANTED)
    ? 'GRANTED'
    : bluetoothValues.some((v) => v === PermissionsAndroid.RESULTS.NEVER_ASK_AGAIN)
      ? 'BLOCKED'
      : 'DENIED';

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
