import '../src/gps/backgroundLocationTask';
import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, AppState, Linking, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady } from '../src/obd/bluetoothManager';
import { gpsTracker } from '../src/gps';
import { readAppSettings, writeAppSettings } from '../src/database/appSettings';
import { connectPreferredElm, disconnectSharedObd, getSharedObdStatus, subscribeSharedObdStatus } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { initAutoSave } from '../src/meriva/autosaveManager';
import { autoTripService } from '../src/trip/autoTripService';
import { requestAllRequiredPermissions } from '../src/permissions/permissionManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  // Ativa o bloqueio de tela de forma explícita e o restaura quando o app volta ao primeiro plano.
  useEffect(() => {
    const tag = 'meriva-smart-diagnostic-active';
    let disposed = false;

    const activate = () => {
      if (disposed || AppState.currentState === 'background' || AppState.currentState === 'inactive') return;
      void activateKeepAwakeAsync(tag).catch((error) => {
        console.warn('[KeepAwake] Falha ao manter a tela ligada:', error);
      });
    };

    activate();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') activate();
      else void deactivateKeepAwake(tag);
    });

    return () => {
      disposed = true;
      subscription.remove();
      void deactivateKeepAwake(tag);
    };
  }, []);

  const checking = useRef(false);
  const lastFailureAt = useRef(0);
  const gpsChecking = useRef(false);
  const lastGpsFailureAt = useRef(0);
  const permissionsChecked = useRef(false);
  const gpsEcuConnected = useRef<boolean | null>(null);
  const unsubscribeEcuStatus = useRef<(() => void) | null>(null);

  useEffect(() => {
    const loadSettings = async () => readAppSettings(`${FileSystem.documentDirectory}MERIVA_SMART`);
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;

    const preparePermissions = async () => {
      if (permissionsChecked.current) return;
      if (Platform.OS === 'android') {
        const audit = await requestAllRequiredPermissions();
        if (audit.bluetooth !== 'GRANTED') {
          throw new Error('PERMISSÃO DE BLUETOOTH/DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA.');
        }
        if (audit.location !== 'GRANTED') {
          throw new Error('PERMISSÃO DE GPS/LOCALIZAÇÃO NÃO CONCEDIDA.');
        }
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
        // A persistência da sessão ECU é centralizada em sharedConnection.
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

    const startGps = async (diagnosticAlerts: boolean): Promise<boolean> => {
      if (gpsChecking.current) return gpsTracker.getState().running;
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
        return started;
      } finally {
        gpsChecking.current = false;
      }
    };

    const syncGpsWithEcu = async (ecuConnected: boolean, diagnosticAlerts: boolean) => {
      if (gpsEcuConnected.current === ecuConnected) return;
      if (!ecuConnected) {
        gpsEcuConnected.current = false;
        gpsTracker.setVehicleSpeedHintKmh(null);
        await gpsTracker.stop();
        return;
      }
      const started = await startGps(diagnosticAlerts);
      // Só memoriza a transição positiva quando o watcher realmente iniciou;
      // isso permite nova tentativa caso a permissão/provider falhe.
      gpsEcuConnected.current = started ? true : null;
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
            'Permissão de Bluetooth',
            cause instanceof Error ? cause.message : 'Permissão de Bluetooth necessária para diagnóstico do veículo.',
            [
              { text: 'Tentar novamente', onPress: () => void startup() },
              { text: 'Fechar', style: 'cancel' },
            ],
          );
        }
        return;
      }
      // O GPS só registra deslocamento enquanto a ECU estiver validada e respondendo.
      // Não iniciar localização apenas porque o aplicativo abriu ou o Bluetooth pareou.
      if (!unsubscribeEcuStatus.current) {
        unsubscribeEcuStatus.current = subscribeSharedObdStatus((status) => {
          void syncGpsWithEcu(status.ecuConnected, settings.diagnosticAlerts);
        });
      }
      await syncGpsWithEcu(getSharedObdStatus().ecuConnected, settings.diagnosticAlerts);
      await checkBluetooth(settings.autoConnectObd, settings.diagnosticAlerts);
    };

    void startup();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startup();
    });

    return () => {
      subscription.remove();
      unsubscribeEcuStatus.current?.();
      unsubscribeEcuStatus.current = null;
      gpsEcuConnected.current = null;
      void gpsTracker.stop();
      void autoTripService.stop().finally(() => {
        void disconnectSharedObd();
      });
    };
  }, []);

  return (
    <SafeAreaProvider>
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
    </SafeAreaProvider>
  );
}
