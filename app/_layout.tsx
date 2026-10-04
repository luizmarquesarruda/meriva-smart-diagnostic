import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady, openBluetoothAppSettings } from '../src/obd/bluetoothManager';
import { gpsTracker } from '../src/gps';
import { readAppSettings, writeAppSettings } from '../src/database/appSettings';
import { connectPreferredElm, disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import { autoTripService } from '../src/trip/autoTripService';

export default function RootLayout() {
  const checking = useRef(false);
  const lastFailureAt = useRef(0);
  const gpsChecking = useRef(false);
  const lastGpsFailureAt = useRef(0);

  useEffect(() => {
    const loadSettings = async () => readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`);
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;

    const checkBluetooth = async (
      autoConnectObd: boolean,
      diagnosticAlerts: boolean,
      selectedAdapterAddress: string | null,
    ) => {
      if (checking.current) return;
      checking.current = true;

      try {
        if (!autoConnectObd) return;
        await ensureBluetoothReady();
        const settings = await loadSettings();
        const connection = await connectPreferredElm(selectedAdapterAddress);
        await writeAppSettings(basePath, {
          ...settings,
          selectedAdapterAddress: connection.device.address,
        });
        await initAutoSave(basePath);
        updateAutoSaveState((state) => {
          state.obd = {
            connected: true,
            adapterName: connection.device.name,
            protocol: connection.protocol ?? undefined,
            lastConnectedAt: new Date().toISOString(),
          };
        });
        if (!connection.protocol) throw new Error('ELM RESPONDEU, MAS O PROTOCOLO NÃO FOI IDENTIFICADO.');
      } catch (cause) {
        const now = Date.now();
        if (diagnosticAlerts && now - lastFailureAt.current > 2500) {
          lastFailureAt.current = now;
          Alert.alert(
            'Bluetooth necessário',
            cause instanceof Error
              ? cause.message
              : 'Ative o Bluetooth e permita o acesso a dispositivos próximos para usar o ELM327.',
            [
              { text: 'Abrir configurações', onPress: () => void openBluetoothAppSettings() },
              { text: 'Tentar novamente', onPress: () => void checkBluetooth(true, true, selectedAdapterAddress) },
            ],
          );
        }
      } finally {
        checking.current = false;
      }
    };

    const startGps = async (diagnosticAlerts: boolean) => {
      if (gpsChecking.current) return;
      gpsChecking.current = true;
      try {
        const started = await gpsTracker.start();
        if (!started) {
          const now = Date.now();
          if (diagnosticAlerts && now - lastGpsFailureAt.current > 3000) {
            lastGpsFailureAt.current = now;
            Alert.alert(
              'GPS do celular',
              gpsTracker.getState().error ?? 'Não foi possível iniciar o GPS automaticamente.',
              [
                { text: 'Abrir configurações', onPress: () => void Linking.openSettings() },
                { text: 'Tentar novamente', onPress: () => void startGps(true, true) },
              ],
            );
          }
        }
      } finally {
        gpsChecking.current = false;
      }
    };

    void autoTripService.start(basePath);

    const startup = async () => {
      const settings = await loadSettings();
      await Promise.all([
        checkBluetooth(
          settings.autoConnectObd,
          settings.diagnosticAlerts,
          settings.selectedAdapterAddress,
        ),
        startGps(settings.diagnosticAlerts),
      ]);
    };

    void startup();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startup();
    });

    return () => {
      subscription.remove();
      void gpsTracker.stop();
      void autoTripService.stop().finally(() => {
        void disconnectSharedObd();
      });
    };
  }, []);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#d9d9d9' },
        headerTintColor: '#1557a6',
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="laboratorio" options={{ title: 'DIAGNÓSTICO OBD' }} />
      <Stack.Screen name="armazenamento" options={{ title: 'HISTÓRICO E DADOS' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'CONFIGURAÇÕES' }} />
    </Stack>
  );
}
