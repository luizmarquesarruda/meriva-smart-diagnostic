import '../src/gps/backgroundLocationTask';
import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, AppState, Platform } from 'react-native';
import { Stack } from 'expo-router';
import { readAppSettings } from '../src/database/appSettings';
import { disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { autoTripService } from '../src/trip/autoTripService';
import { requestAllRequiredPermissions } from '../src/permissions/permissionManager';
import { canStartObdStartup, canUseGps } from '../src/permissions/permissionPolicy';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import * as ScreenOrientation from 'expo-screen-orientation';
import { COLORS } from '../src/ui/theme';

export default function RootLayout() {
  // Libera retrato/paisagem conforme a orientação suportada pelo sistema.
  // useWindowDimensions/useMidLayout recalculam os componentes quando a janela muda.
  useEffect(() => {
    void ScreenOrientation.unlockAsync().catch((error) => {
      console.warn('[ScreenOrientation] Não foi possível restaurar orientação padrão:', error);
    });

    const subscription = ScreenOrientation.addOrientationChangeListener(({ orientationInfo }) => {
      console.info('[ScreenOrientation] Orientação alterada:', orientationInfo.orientation);
    });

    return () => subscription.remove();
  }, []);
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

  const lastFailureAt = useRef(0);
  const permissionsChecked = useRef(false);

  useEffect(() => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    const loadSettings = async () => readAppSettings(basePath);

    const preparePermissions = async () => {
      if (permissionsChecked.current) return;
      if (Platform.OS === 'android') {
        const audit = await requestAllRequiredPermissions();
        if (!canStartObdStartup(audit)) {
          throw new Error('PERMISSÃO DE BLUETOOTH/DISPOSITIVOS PRÓXIMOS NÃO CONCEDIDA.');
        }
        if (!canUseGps(audit)) {
          console.warn('[Permissions] Localização não concedida; OBD segue disponível, mas o registro GPS/viagens pode ficar indisponível.');
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
        headerStyle: { backgroundColor: COLORS.screen },
        headerTintColor: COLORS.accent,
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      {/* Todas as telas usam cabeçalho próprio; evite um segundo cabeçalho do Stack. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bluetooth" options={{ headerShown: false }} />
      <Stack.Screen name="conectividade" options={{ headerShown: false }} />
      <Stack.Screen name="laboratorio" options={{ headerShown: false }} />
      <Stack.Screen name="dados" options={{ headerShown: false }} />
      <Stack.Screen name="saude" options={{ headerShown: false }} />
      <Stack.Screen name="mais" options={{ headerShown: false }} />
      <Stack.Screen name="viagens" options={{ headerShown: false }} />
      <Stack.Screen name="veiculo" options={{ headerShown: false }} />
      <Stack.Screen name="aprendizado" options={{ headerShown: false }} />
      <Stack.Screen name="testes-sensores" options={{ headerShown: false }} />
      <Stack.Screen name="armazenamento" options={{ headerShown: false }} />
      <Stack.Screen name="configuracoes" options={{ headerShown: false }} />
    </Stack>
    </SafeAreaProvider>
  );
}
