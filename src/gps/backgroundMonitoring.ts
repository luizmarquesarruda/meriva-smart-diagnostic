import { Platform } from 'react-native';
import { requestBackgroundLocationPermissionsOnly } from '../permissions/permissionManager';
import { gpsTracker } from './gpsTracker';

let starting: Promise<boolean> | null = null;

export async function startBackgroundMonitoring(): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  if (starting) return starting;

  starting = (async () => {
    try {
      const permission = await requestBackgroundLocationPermissionsOnly();
      if (permission !== 'GRANTED') {
        console.warn('[background] localização em segundo plano não autorizada:', permission);
        return false;
      }
      return await gpsTracker.startBackgroundLocation();
    } catch (cause) {
      console.warn(
        '[background] não foi possível iniciar monitoramento persistente:',
        cause instanceof Error ? cause.message : cause,
      );
      return false;
    }
  })();

  try {
    return await starting;
  } finally {
    starting = null;
  }
}

export async function stopBackgroundMonitoring(): Promise<void> {
  await gpsTracker.stopBackgroundLocation();
}
