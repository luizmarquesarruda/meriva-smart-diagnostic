import '../src/gps/backgroundLocationTask';
import { useEffect, useRef } from 'react';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Alert, AppState, Platform, Pressable, Text } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { readAppSettings } from '../src/database/appSettings';
import { disconnectSharedObd } from '../src/obd/sharedConnection';
import * as FileSystem from 'expo-file-system';
import { autoTripService } from '../src/trip/autoTripService';
import { requestAllRequiredPermissions } from '../src/permissions/permissionManager';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { cockpitTheme } from '../src/ui/cockpitTheme';

export default function RootLayout() {
  const router = useRouter();
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
        headerStyle: { backgroundColor: cockpitTheme.background },
        headerShadowVisible: false,
        headerTitle: '',
        headerTintColor: cockpitTheme.accent,
        headerTitleStyle: { color: cockpitTheme.text, fontWeight: '900' },
        headerBackVisible: false,
        headerLeft: () => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Página inicial"
            accessibilityHint="Volta para a tela inicial do Meriva Smart Diagnostic."
            onPress={() => router.replace('/')}
            style={{ marginLeft: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, backgroundColor: cockpitTheme.primary }}
          >
            <Text style={{ color: cockpitTheme.text, fontSize: 12, fontWeight: '800' }}>⌂ Página inicial</Text>
          </Pressable>
        ),
      }}
    >
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="bluetooth" />
      <Stack.Screen name="laboratorio" />
      <Stack.Screen name="armazenamento" />
      <Stack.Screen name="configuracoes" />
    </Stack>
    </SafeAreaProvider>
  );
}
