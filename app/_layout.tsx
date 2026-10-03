import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady, openBluetoothAppSettings } from '../src/obd/bluetoothManager';
import { gpsTracker } from '../src/gps';

export default function RootLayout() {
  const checking = useRef(false);
  const lastFailureAt = useRef(0);
  const gpsChecking = useRef(false);
  const lastGpsFailureAt = useRef(0);

  useEffect(() => {
    const checkBluetooth = async () => {
      if (checking.current) return;
      checking.current = true;

      try {
        await ensureBluetoothReady();
      } catch (cause) {
        const now = Date.now();
        if (now - lastFailureAt.current > 2500) {
          lastFailureAt.current = now;
          Alert.alert(
            'Bluetooth necessário',
            cause instanceof Error
              ? cause.message
              : 'Ative o Bluetooth e permita o acesso a dispositivos próximos para usar o ELM327.',
            [
              { text: 'Abrir configurações', onPress: () => void openBluetoothAppSettings() },
              { text: 'Tentar novamente', onPress: () => void checkBluetooth() },
            ],
          );
        }
      } finally {
        checking.current = false;
      }
    };

    const startGps = async () => {
      if (gpsChecking.current) return;
      gpsChecking.current = true;
      try {
        const started = await gpsTracker.start();
        if (!started) {
          const now = Date.now();
          if (now - lastGpsFailureAt.current > 3000) {
            lastGpsFailureAt.current = now;
            Alert.alert(
              'GPS do celular',
              gpsTracker.getState().error ?? 'Não foi possível iniciar o GPS automaticamente.',
              [
                { text: 'Abrir configurações', onPress: () => void Linking.openSettings() },
                { text: 'Tentar novamente', onPress: () => void startGps() },
              ],
            );
          }
        }
      } finally {
        gpsChecking.current = false;
      }
    };

    const startup = async () => {
      await checkBluetooth();
      await startGps();
    };

    void startup();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startup();
    });

    return () => {
      subscription.remove();
      void gpsTracker.stop();
    };
  }, []);

  return <Stack screenOptions={{ headerStyle: { backgroundColor: '#1f2937' }, headerTintColor: '#fff' }} />;
}
