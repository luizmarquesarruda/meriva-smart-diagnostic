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
          // GPS/clima/registro de percurso são recursos opcionais. Não bloquear
          // o diagnóstico OBD: o rastreador informa seu próprio estado e degrada
          // sem amostras quando a localização não está autorizada.
          console.warn('[Permissions] Localização não concedida; o diagnóstico OBD permanece habilitado, mas GPS/viagens podem ficar indisponíveis.');
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
      initialRouteName="splash"
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.screen },
        headerTintColor: COLORS.accent,
        headerTitleStyle: { fontWeight: '900' },
      }}
    >
      <Stack.Screen name="splash" options={{ headerShown: false, gestureEnabled: false }} />
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="manutencao" options={{ headerShown: false }} />
      <Stack.Screen name="bluetooth" options={{ headerShown: false }} />
      <Stack.Screen name="conectividade" options={{ headerShown: false }} />
      <Stack.Screen name="laboratorio" options={{ title: 'DIAGNÓSTICO OBD' }} />
      <Stack.Screen name="armazenamento" options={{ title: 'HISTÓRICO E DADOS' }} />
      <Stack.Screen name="configuracoes" options={{ title: 'CONFIGURAÇÕES' }} />
    </Stack>
    </SafeAreaProvider>
  );
}
