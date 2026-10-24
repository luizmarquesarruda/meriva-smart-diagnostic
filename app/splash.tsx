import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import * as FileSystem from 'expo-file-system';
import { AppIcon } from '../src/ui/AppIcon';
import { readAppSettings } from '../src/database/appSettings';
import { connectPreferredElm, getSharedObdConnection, getSharedObdStatus } from '../src/obd/sharedConnection';

const COLORS = { screen: '#07111f', accent: '#42d7f5' };
const wait = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function connectionMessage(): string {
  const state = getSharedObdStatus();
  if (state.ecuConnected) return 'ECU CONECTADA • DESCOBRINDO PIDs';
  if (state.bluetoothConnected) return 'BLUETOOTH ATIVO • VALIDANDO ELM327';
  return 'PROCURANDO ELM327 ENTRE DISPOSITIVOS PAREADOS';
}

export default function StartupScreen() {
  const [message, setMessage] = useState('PREPARANDO DIAGNÓSTICO');
  const [attempt, setAttempt] = useState(0);
  const [canContinue, setCanContinue] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;

    const run = async () => {
      let retry = 0;
      while (!cancelled) {
        try {
          setMessage('VERIFICANDO BLUETOOTH E DISPOSITIVOS PAREADOS');
          const settings = await readAppSettings(basePath);
          if (settings.autoConnectObd === false) {
            setMessage('CONEXÃO AUTOMÁTICA DESATIVADA • ABRINDO PAINEL');
            await wait(250);
            if (!cancelled) router.replace('/');
            return;
          }
          const connection = await connectPreferredElm(settings.selectedAdapterAddress, {
            ioTimeoutMs: settings.elmIoTimeoutMs,
            bluetoothConnectTimeoutMs: settings.elmBluetoothTimeoutMs,
            commandDelayMs: settings.elmCommandDelayMs,
            maxConnectionAttempts: settings.elmMaxConnectionAttempts,
            noDataReconnectThreshold: settings.elmNoDataReconnectThreshold,
            partialResponseAction: settings.elmPartialResponseAction,
            forceInitialization: settings.elmForceInitialization,
            adaptiveTiming: settings.elmAdaptiveTiming,
            adaptiveTimeoutMinMs: settings.elmAdaptiveTimeoutMinMs,
            adaptiveTimeoutMaxMs: settings.elmAdaptiveTimeoutMaxMs,
          });
          if (cancelled) return;
          setCanContinue(false);
          if (!connection.ecuValidated || !getSharedObdStatus().ecuConnected) {
            throw new Error('O ELM327 ainda não confirmou resposta válida da ECU.');
          }

          const pids = [...new Set(connection.supportedPids
            .map((pid) => pid.toUpperCase())
            .filter((pid) => /^01[0-9A-F]{2}$/.test(pid)))];
          if (cancelled) return;
          // Descoberta/validação individual já ocorre na sessão compartilhada.
          // Não repetir cinco leituras de todos os PIDs aqui: isso bloqueava o
          // cockpit com dezenas de round trips sem acrescentar evidência ao bitmap.
          setMessage(`ECU VALIDADA • ${pids.length} PIDs COM RESPOSTA VÁLIDA • ABRINDO PAINEL`);
          await wait(250);
          if (!cancelled) router.replace('/');
          return;
        } catch {
          retry += 1;
          setAttempt(retry);
          if (retry >= 2) setCanContinue(true);
          setMessage(connectionMessage());
          // Retentativa contínua com backoff limitado evita tempestade de conexões.
          await wait(Math.min(15_000, 1_000 * (2 ** Math.min(retry - 1, 4))));
        }
      }
    };

    void run();
    const statusTimer = setInterval(() => {
      if (!cancelled && getSharedObdConnection()) setMessage(connectionMessage());
    }, 1000);
    return () => {
      cancelled = true;
      clearInterval(statusTimer);
    };
  }, []);

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={COLORS.screen} />
      <View style={styles.container}>
        <View style={styles.logoMark}><AppIcon name="diagnostic" size={46} color={COLORS.accent} /></View>
        <Text style={styles.brand}>SMART OBD</Text>
        <Text style={styles.brandAccent}>DIAGNOSTIC</Text>
        <Text style={styles.tagline}>DIAGNÓSTICO VEICULAR INTELIGENTE</Text>
        <View style={styles.statusPanel}>
          <ActivityIndicator size="large" color={COLORS.accent} />
          <Text style={styles.status}>{message}</Text>
          <Text style={styles.detail}>{canContinue ? 'Confirme se o ELM327 está pareado, ligado e conectado ao veículo. Você também pode abrir o painel e ajustar a conexão depois.' : 'Pronto somente após uma resposta OBD válida da ECU.'}</Text>
          <Text style={styles.attempt}>TENTATIVA DE CONEXÃO {attempt + 1}</Text>
          {canContinue && <TouchableOpacity
            style={styles.continueButton}
            accessibilityRole="button"
            accessibilityLabel="Abrir painel sem conexão OBD"
            accessibilityHint="Abre o cockpit para consultar configurações e tentar a conexão manualmente"
            onPress={() => router.replace('/')}
            activeOpacity={0.8}
          >
            <Text style={styles.continueButtonText}>ABRIR PAINEL SEM CONEXÃO</Text>
          </TouchableOpacity>}
        </View>
        <Text style={styles.footer}>BLUETOOTH CLASSIC • ELM327 • OBD-II</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: COLORS.screen },
  container: { flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, backgroundColor: COLORS.screen },
  logoMark: { width: 92, height: 92, borderRadius: 26, borderWidth: 1, borderColor: '#1f6681', backgroundColor: '#0c2436', alignItems: 'center', justifyContent: 'center', marginBottom: 22 },
  brand: { color: '#f8fafc', fontSize: 32, fontWeight: '900', letterSpacing: 3 },
  brandAccent: { color: COLORS.accent, fontSize: 28, fontWeight: '900', letterSpacing: 4, marginTop: -2 },
  tagline: { color: '#8fa9bf', fontSize: 10, fontWeight: '800', letterSpacing: 2, marginTop: 12, textAlign: 'center' },
  statusPanel: { width: '100%', maxWidth: 430, marginTop: 36, padding: 22, borderRadius: 20, borderWidth: 1, borderColor: '#21415b', backgroundColor: '#0c1c2d', alignItems: 'center' },
  status: { color: '#eaf6ff', fontSize: 13, fontWeight: '900', textAlign: 'center', marginTop: 16, letterSpacing: 0.5 },
  detail: { color: '#93a9bc', fontSize: 11, textAlign: 'center', lineHeight: 17, marginTop: 10 },
  attempt: { color: '#607e97', fontSize: 9, fontWeight: '800', letterSpacing: 1, marginTop: 18 },
  continueButton: { width: '100%', minHeight: 48, marginTop: 18, paddingHorizontal: 14, borderRadius: 12, borderWidth: 1, borderColor: '#2c7890', backgroundColor: '#123248', alignItems: 'center', justifyContent: 'center' },
  continueButtonText: { color: COLORS.accent, fontSize: 11, fontWeight: '900', letterSpacing: 0.6, textAlign: 'center' },
  footer: { position: 'absolute', bottom: 18, color: '#607e97', fontSize: 9, fontWeight: '800', letterSpacing: 1.5, textAlign: 'center' },
});
