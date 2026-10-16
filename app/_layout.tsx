import '../src/gps/backgroundLocationTask';
import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { ensureBluetoothReady } from '../src/obd/bluetoothManager';
import { readAppSettings, writeAppSettings } from '../src/database/appSettings';
import { connectPreferredElm, disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { initAutoSave } from '../src/meriva/autosaveManager';
import { autoTripService } from '../src/trip/autoTripService';
import { requestAllRequiredPermissions } from '../src/permissions/permissionManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { syncDesktopDashboardIfAvailable } from '../src/storage/desktopSync';

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

  // Sincronização opcional com o painel Windows: só transfere dados quando
  // o serviço local responde pelo ADB reverse autorizado. Não afeta a ECU se
  // o notebook estiver desconectado.
  useEffect(() => {
    let disposed = false;
    const sync = () => {
      if (!disposed && AppState.currentState === 'active') {
        void syncDesktopDashboardIfAvailable();
      }
    };
    sync();
    const timer = setInterval(sync, 30_000);
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') sync();
    });
    return () => {
      disposed = true;
      clearInterval(timer);
      subscription.remove();
    };
  }, []);

  const checking = useRef(false);
  const lastFailureAt = useRef(0);
  const permissionsChecked = useRef(false);

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
      // A aquisição GPS pertence ao autoTripService e só começa depois da
      // validação da resposta ECU. Iniciar o watcher aqui cria trilha antes
      // da sessão OBD e compete com o Foreground Service nativo.
      await checkBluetooth(
        settings.autoConnectObd,
        settings.diagnosticAlerts,
      );
    };

    void startup();

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void startup();
    });

    return () => {
      subscription.remove();
      // O serviço de viagens é o único dono do ciclo de vida GPS; serializar
      // o fechamento evita stop() concorrente com o fechamento da sessão OBD.
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
