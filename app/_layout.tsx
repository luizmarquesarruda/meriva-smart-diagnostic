import { useEffect, useRef } from 'react';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady, requestBluetoothPermissions } from '../src/obd/bluetoothManager';
import * as Location from 'expo-location';
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
  const permissionsChecked = useRef(false);

  useEffect(() => {
    const loadSettings = async () => readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`);
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;

    const preparePermissions = async () => {
      if (permissionsChecked.current) return;
      if (Platform.OS === 'android') {
        await requestBluetoothPermissions();
      }
      let locationPermission = await Location.getForegroundPermissionsAsync();
      if (locationPermission.status !== Location.PermissionStatus.GRANTED) {
        locationPermission = await Location.requestForegroundPermissionsAsync();
      }
      if (locationPermission.status !== Location.PermissionStatus.GRANTED) {
        throw new Error('PERMISSÃO DE LOCALIZAÇÃO NÃO CONCEDIDA. O GPS é necessário para velocidade, distância e viagem automática.');
      }
      permissionsChecked.current = true;
    };

    const checkBluetooth = async (
      autoConnectObd: boolean,
      diagnosticAlerts: boolean,
    ) => {
      if (checking.current) return;
      checking.current = true;

      try {
        if (!autoConnectObd) return;
        await ensureBluetoothReady();
        const settings = await loadSettings();
        const connection = await connectPreferredElm(settings.selectedAdapterAddress);
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
        // 010C validado é o critério real de ECU. Protocolo pode permanecer N/D.
      } catch (cause) {
        const now = Date.now();
        if (diagnosticAlerts && now - lastFailureAt.current > 2500) {
          lastFailureAt.current = now;
          Alert.alert(
            'Bluetooth necessário',
            cause instanceof Error && /BLUETOOTH.*DESLIGADO|BLUETOOTH CONTINUA DESLIGADO|BLUETOOTH NÃO FOI ATIVADO/i.test(cause.message)
              ? 'Bluetooth necessário para diagnóstico do veículo.'
              : cause instanceof Error
                ? cause.message
                : 'Bluetooth necessário para diagnóstico do veículo.',
            [
              { text: 'Ativar Bluetooth', onPress: () => void checkBluetooth(true, true) },
              { text: 'Tentar novamente', onPress: () => void checkBluetooth(true, true) },
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
                { text: 'Tentar novamente', onPress: () => void startGps(true) },
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
      try {
        await preparePermissions();
      } catch (cause) {
        const now = Date.now();
        if (settings.diagnosticAlerts && now - lastFailureAt.current > 2500) {
          lastFailureAt.current = now;
          Alert.alert(
            'Permissões necessárias',
            cause instanceof Error ? cause.message : 'O aplicativo precisa de acesso ao Bluetooth e à localização para funcionar.',
            [
              { text: 'Abrir configurações', onPress: () => void Linking.openSettings() },
              { text: 'Tentar novamente', onPress: () => void startup() },
            ],
          );
        }
        return;
      }
      await Promise.all([
        checkBluetooth(
          settings.autoConnectObd,
          settings.diagnosticAlerts,
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
      <Stack.Screen name="bluetooth" options={{ headerShown: false }} />
      <Stack.Screen name="laboratorio" options={{ title: 'DIAGNÓSTICO OBD' }} />
      <Stack.Screen name="armazenamento" options={{ title: 'HISTÓRICO E DADOS' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'CONFIGURAÇÕES' }} />
    </Stack>
  );
}
