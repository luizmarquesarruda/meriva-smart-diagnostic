import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady, openBluetoothAppSettings } from '../src/obd/bluetoothManager';
import { gpsTracker } from '../src/gps';
import { readAppSettings } from '../src/database/appSettings';
import { connectPreferredElm, disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';

export default function RootLayout() {
  const checking = useRef(false);
  const lastFailureAt = useRef(0);
  const gpsChecking = useRef(false);
  const lastGpsFailureAt = useRef(0);

  useEffect(() => {
    const loadSettings = async () => readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`);

    const checkBluetooth = async (autoConnectObd: boolean) => {
      if (checking.current) return;
      checking.current = true;

      try {
        if (!autoConnectObd) return;
        await ensureBluetoothReady();
        const connection = await connectPreferredElm();
        if (!connection.protocol) throw new Error('ELM RESPONDEU, MAS O PROTOCOLO NÃO FOI IDENTIFICADO.');
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

    const startGps = async (autoStartGps: boolean) => {
      if (!autoStartGps) return;
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
      const settings = await loadSettings();
      await checkBluetooth(settings.autoConnectObd);
      await startGps(settings.autoStartGps);
    };

    void startup();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startup();
    });

    return () => {
      subscription.remove();
      void gpsTracker.stop();
      void disconnectSharedObd();
    };
  }, []);

  return <Stack screenOptions={{ headerStyle: { backgroundColor: '#1f2937' }, headerTintColor: '#fff' }} />;
}
