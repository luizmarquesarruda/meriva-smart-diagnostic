import { useEffect, useRef } from 'react';
import { Alert, AppState } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady } from '../src/obd/bluetoothManager';

export default function RootLayout() {
  const checking = useRef(false);
  const lastFailureAt = useRef(0);

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
          );
        }
      } finally {
        checking.current = false;
      }
    };

    void checkBluetooth();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void checkBluetooth();
    });

    return () => subscription.remove();
  }, []);

  return <Stack screenOptions={{ headerStyle: { backgroundColor: '#1f2937' }, headerTintColor: '#fff' }} />;
}
