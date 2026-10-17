import '../src/gps/backgroundLocationTask';
import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { readAppSettings, subscribeAppSettings } from '../src/database/appSettings';
import { disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { autoTripService } from '../src/trip/autoTripService';
import { requestAllRequiredPermissions } from '../src/permissions/permissionManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';

export default function RootLayout() {
  // O keep-awake respeita a preferência persistida e reage às mudanças sem reiniciar o app.
  useEffect(() => {
    const tag = 'meriva-smart-diagnostic-active';
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    let disposed = false;
    let keepAwakeEnabled = true;

    const applyPreference = (enabled: boolean) => {
      keepAwakeEnabled = enabled;
      if (disposed) return;
      if (enabled && AppState.currentState !== 'background' && AppState.currentState !== 'inactive') {
        void activateKeepAwakeAsync(tag).catch((error) => {
          console.warn('[KeepAwake] Falha ao manter a tela ligada:', error);
        });
      } else {
        void deactivateKeepAwake(tag);
      }
    };

    const unsubscribeSettings = subscribeAppSettings((settings) => applyPreference(settings.keepScreenAwake));
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active' && keepAwakeEnabled) applyPreference(true);
      else void deactivateKeepAwake(tag);
    });

    void readAppSettings(basePath)
      .then((settings) => applyPreference(settings.keepScreenAwake))
      .catch((error) => console.warn('[KeepAwake] Não foi possível ler a configuração; padrão seguro mantido:', error));

    return () => {
      disposed = true;
      unsubscribeSettings();
      appStateSubscription.remove();
      void deactivateKeepAwake(tag);
    };
  }, []);

  const lastFailureAt = useRef(0);
  const permissionsChecked = useRef(false);

  useEffect(() => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    const loadSettings = async () => readAppSettings(basePath);

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
      // A conexão OBD é iniciada exclusivamente pela tela inicial, que aplica
      // as configurações do usuário. O layout só prepara permissões e serviços.
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
        // As telas desenham seus títulos e oferecem retorno explícito; ocultar o header nativo evita títulos duplicados sem retirar a navegação de volta.
        headerShown: false,
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
