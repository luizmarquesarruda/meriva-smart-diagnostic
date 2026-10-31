import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { Link } from 'expo-router';
import { Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { createBackup } from '../src/storage/backup';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { VehicleProfile } from '../src/database/vehicleConfig';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave } from '../src/meriva/autosaveManager';
import { exportAutoSaveTxt, exportDailyObdHistoryTxt } from '../src/meriva/exportAutoSaveTxt';
import { exportBluetoothDiagnosticTxt } from '../src/obd/exportBluetoothDiagnosticTxt';
import { AppSettings, readAppSettings, writeAppSettings } from '../src/database/appSettings';
import { requestBackgroundLocationPermissionsOnly, requestLocationPermissionsOnly } from '../src/permissions/permissionManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import { getMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return 'N/D'; }
}

export default function ConfiguracaoScreen() {
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
  const [storageBase, setStorageBase] = useState<string | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [status, setStatus] = useState('INICIALIZANDO...');
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null, obdSessionActive: false });
  const appVersion = Constants.expoConfig?.version ?? '1.0.1';

  useEffect(() => {
    async function initStorage() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const state = await initAutoSave(basePath);
      setProfile(state.vehicle);
      setSettings(await readAppSettings(basePath));
      setSaveStatus(getAutoSaveStatus());
      setStatus('PRONTO');
      setStorageBase(basePath);
    }
    void initStorage();
  }, []);

  async function updateSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]) {
    if (!storageBase || !settings) return;
    const next = { ...settings, [key]: value };
    setSettings(next);
    try {
      await writeAppSettings(storageBase, next);
      setStatus('CONFIGURAÇÃO SALVA');
    } catch {
      setStatus('FALHA AO SALVAR CONFIGURAÇÃO');
    }
  }

  async function updateGpsTrackingPreference(enabled: boolean) {
    if (!storageBase || !settings) return;
    if (!enabled) {
      const next = { ...settings, gpsTrackingEnabled: false, backgroundGpsEnabled: false };
      setSettings(next);
      try {
        await writeAppSettings(storageBase, next);
        setStatus('GPS DESATIVADO • OBD PERMANECE ATIVO');
      } catch {
        setStatus('FALHA AO SALVAR PREFERÊNCIA GPS');
      }
      return;
    }

    const foreground = await requestLocationPermissionsOnly();
    if (foreground !== 'GRANTED') {
      Alert.alert('Localização não autorizada', 'O GPS para viagens exige permissão de localização em primeiro plano. O diagnóstico Bluetooth/OBD continua funcionando.');
      return;
    }
    await updateSetting('gpsTrackingEnabled', true);
  }

  async function updateBackgroundGpsPreference(enabled: boolean) {
    if (enabled && !settings?.gpsTrackingEnabled) {
      Alert.alert('Ative o GPS primeiro', 'Ative antes a opção de usar GPS em viagens. O rastreamento em segundo plano é complementar e opcional.');
      return;
    }
    if (!enabled) {
      await updateSetting('backgroundGpsEnabled', false);
      return;
    }

    const foreground = await requestLocationPermissionsOnly();
    if (foreground !== 'GRANTED') {
      Alert.alert('Localização não autorizada', 'O GPS em primeiro plano precisa ser autorizado antes de ativar o rastreamento com a tela apagada. O diagnóstico OBD continua funcionando.');
      return;
    }

    const background = await requestBackgroundLocationPermissionsOnly();
    if (background !== 'GRANTED') {
      Alert.alert('GPS em segundo plano não autorizado', 'O rastreamento com a tela apagada não foi ativado. O GPS em primeiro plano e o diagnóstico OBD continuam independentes.');
      return;
    }

    await updateSetting('backgroundGpsEnabled', true);
    Alert.alert('Rastreamento em segundo plano ativado', 'A preferência será aplicada à sessão de viagem atual. O Android manterá a notificação persistente enquanto o GPS estiver ativo.');
  }

  async function handleBackup() {
    if (!storageBase || busy) return;
    setBusy(true);
    try { const info = await createBackup(storageBase); setStatus(`BACKUP CRIADO: ${info.timestamp}`); }
    catch { setStatus('FALHA NO BACKUP'); }
    finally { setBusy(false); setSaveStatus(getAutoSaveStatus()); }
  }

  async function handleCleanLogs() {
    if (!storageBase || busy) return;
    setBusy(true);
    try {
      const logs = await cleanupOldLogs(storageBase);
      const readings = await cleanupOldReadings(storageBase);
      setStatus(`REMOVIDOS: ${logs} LOGS, ${readings} LEITURAS`);
    } catch { setStatus('FALHA NA LIMPEZA'); }
    finally { setBusy(false); setSaveStatus(getAutoSaveStatus()); }
  }

  async function handleBluetoothReport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exportBluetoothDiagnosticTxt();
      if (result.ok) setStatus(`RELATÓRIO BLUETOOTH EXPORTADO: ${result.fileName}`);
      else if (result.reason === 'CANCELADO') setStatus('EXPORTAÇÃO CANCELADA');
      else setStatus(`FALHA NO RELATÓRIO BLUETOOTH: ${result.message ?? result.reason}`);
    } finally { setBusy(false); setSaveStatus(getAutoSaveStatus()); }
  }


  async function handleDailyHistoryExport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exportDailyObdHistoryTxt();
      if (result.ok) setStatus(`HISTÓRICO DIÁRIO EXPORTADO: ${result.fileName}`);
      else if (result.reason === 'CANCELADO') setStatus('EXPORTAÇÃO CANCELADA');
      else setStatus(`FALHA NO HISTÓRICO DIÁRIO: ${result.message ?? result.reason}`);
    } finally { setBusy(false); setSaveStatus(getAutoSaveStatus()); }
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exportAutoSaveTxt(getAutoSaveState(), appVersion);
      if (result.ok) setStatus(`EXPORTADO: ${result.fileName}`);
      else if (result.reason === 'CANCELADO') setStatus('EXPORTAÇÃO CANCELADA');
      else setStatus(`FALHA NA EXPORTAÇÃO: ${result.message ?? result.reason}`);
    } finally { setBusy(false); setSaveStatus(getAutoSaveStatus()); }
  }

  return (
    <SafeAreaView style={{flex:1,backgroundColor:COLORS.screen}} edges={["top","bottom","left","right"]}>
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, paddingVertical: layout.compact ? 12 : 16, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={[styles.title,{fontSize:layout.titleSize-3}]}>CONFIGURAÇÕES</Text>
      <Text style={styles.status}>{status}</Text>

      {settings && (
        <>
          <View style={[styles.settingsGrid,layout.landscape&&styles.settingsGridLandscape,{gap:layout.gap}]}>
          <Text style={[styles.section,styles.sectionFullWidth]}>PREFERÊNCIAS BÁSICAS</Text>
          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Combustível</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.choice, settings.fuelType === 'FLEX' && styles.choiceActive]} onPress={() => void updateSetting('fuelType', 'FLEX')}>
                <Text style={styles.choiceText}>FLEX</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, settings.fuelType === 'ETANOL' && styles.choiceActive]} onPress={() => void updateSetting('fuelType', 'ETANOL')}>
                <Text style={styles.choiceText}>ETANOL</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, settings.fuelType === 'GASOLINA' && styles.choiceActive]} onPress={() => void updateSetting('fuelType', 'GASOLINA')}>
                <Text style={styles.choiceText}>GASOLINA</Text>
              </TouchableOpacity>
            </View>
            <Text style={styles.note}>
              {settings.fuelType === 'FLEX'
                ? 'No modo FLEX, a estimativa MAF/MAP exige composição de etanol válida via PID 0152; sem ela, o consumo estimado fica indisponível em vez de assumir gasolina.'
                : settings.fuelType === 'ETANOL'
                  ? 'Estimativa MAF/MAP usa parâmetros aproximados de etanol.'
                  : 'Estimativa MAF/MAP usa parâmetros aproximados de gasolina.'}
              {' '}A leitura medida PID 015E sempre tem precedência.
            </Text>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Unidade de distância</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.choice, settings.distanceUnit === 'KM' && styles.choiceActive]} onPress={() => void updateSetting('distanceUnit', 'KM')}>
                <Text style={styles.choiceText}>KM</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, settings.distanceUnit === 'MI' && styles.choiceActive]} onPress={() => void updateSetting('distanceUnit', 'MI')}>
                <Text style={styles.choiceText}>MILHAS</Text>
              </TouchableOpacity>
            </View>
          </View>

          <SettingSwitch label="Usar GPS para distância e viagens" value={settings.gpsTrackingEnabled} onChange={(v) => void updateGpsTrackingPreference(v)} landscapeCard={layout.landscape} />
          <SettingSwitch label="Rastrear GPS com a tela apagada" value={settings.backgroundGpsEnabled} onChange={(v) => void updateBackgroundGpsPreference(v)} landscapeCard={layout.landscape} />
          <Text style={[styles.note,styles.noteFullWidth]}>GPS é opcional e não interfere no Bluetooth/OBD. A permissão em primeiro plano só é solicitada ao ativar a primeira opção; segundo plano exige que ela já esteja ativa e uma segunda autorização. Desativar GPS encerra o rastreamento sem bloquear as leituras OBD.</Text>
          <SettingSwitch label="Inicialização forçada do ELM (ATZ + ATE0)" value={settings.elmForceInitialization} onChange={(v) => void updateSetting('elmForceInitialization', v)} landscapeCard={layout.landscape} />
          <SettingSwitch label="Alertas de diagnóstico" value={settings.diagnosticAlerts} onChange={(v) => void updateSetting('diagnosticAlerts', v)} landscapeCard={layout.landscape} />

          <Text style={[styles.section,styles.sectionFullWidth]}>COMPATIBILIDADE ELM327</Text>
          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Tempo de espera de entrada/saída</Text>
            <View style={styles.row}>
              {[5000, 10000, 15000].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmIoTimeoutMs === value && styles.choiceActive]} onPress={() => void updateSetting('elmIoTimeoutMs', value)}>
                  <Text style={styles.choiceText}>{value / 1000}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Tempo limite Bluetooth</Text>
            <View style={styles.row}>
              {[3000, 5000, 10000].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmBluetoothTimeoutMs === value && styles.choiceActive]} onPress={() => void updateSetting('elmBluetoothTimeoutMs', value)}>
                  <Text style={styles.choiceText}>{value / 1000}s</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Atraso antes de enviar comando</Text>
            <View style={styles.row}>
              {[0, 20, 50].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmCommandDelayMs === value && styles.choiceActive]} onPress={() => void updateSetting('elmCommandDelayMs', value)}>
                  <Text style={styles.choiceText}>{value} ms</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Tentativas de conexão</Text>
            <View style={styles.row}>
              {[3, 10, 20].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmMaxConnectionAttempts === value && styles.choiceActive]} onPress={() => void updateSetting('elmMaxConnectionAttempts', value)}>
                  <Text style={styles.choiceText}>{String(value)}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.note}>O limite é finito para evitar ciclos de conexão indefinidos. A opção 20 corresponde ao limite operacional padrão.</Text>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Adaptive Timing do ELM</Text>
            <SettingSwitch label="Ajustar timeout conforme a resposta" value={settings.elmAdaptiveTiming} onChange={(v) => void updateSetting('elmAdaptiveTiming', v)} />
            <View style={styles.row}>
              {[3000, 5000, 10000].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmAdaptiveTimeoutMinMs === value && styles.choiceActive]} onPress={() => void updateSetting('elmAdaptiveTimeoutMinMs', value)}>
                  <Text style={styles.choiceText}>mín. {value / 1000}s</Text>
                </TouchableOpacity>
              ))}
            </View>
            <Text style={styles.note}>O app aumenta o tempo quando há timeout/erro e reduz gradualmente quando as respostas ficam rápidas.</Text>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>NO DATA antes de recuperação</Text>
            <View style={styles.row}>
              {[3, 4, 6].map((value) => (
                <TouchableOpacity key={value} style={[styles.choice, settings.elmNoDataReconnectThreshold === value && styles.choiceActive]} onPress={() => void updateSetting('elmNoDataReconnectThreshold', value)}>
                  <Text style={styles.choiceText}>{value}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={[styles.card,{padding:layout.cardPadding},layout.landscape&&styles.cardLandscape]}>
            <Text style={styles.label}>Resposta parcial</Text>
            <View style={styles.row}>
              <TouchableOpacity style={[styles.choice, settings.elmPartialResponseAction === 'RECONNECT_AND_INITIALIZE' && styles.choiceActive]} onPress={() => void updateSetting('elmPartialResponseAction', 'RECONNECT_AND_INITIALIZE')}>
                <Text style={styles.choiceText}>RECONEXÃO + INIT</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, settings.elmPartialResponseAction === 'RECONNECT' && styles.choiceActive]} onPress={() => void updateSetting('elmPartialResponseAction', 'RECONNECT')}>
                <Text style={styles.choiceText}>RECONEXÃO</Text>
              </TouchableOpacity>
              <TouchableOpacity style={[styles.choice, settings.elmPartialResponseAction === 'IGNORE' && styles.choiceActive]} onPress={() => void updateSetting('elmPartialResponseAction', 'IGNORE')}>
                <Text style={styles.choiceText}>IGNORAR</Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.note,styles.noteFullWidth]}>Os parâmetros são inspirados no comportamento observado no Car Scanner e em implementações públicas de ELM327. Eles não garantem compatibilidade com todo clone.</Text>
          <Text style={[styles.note,styles.noteFullWidth]}>O GPS permanece desativado até você ativar seu uso para distância e viagens. A conexão e o diagnóstico OBD funcionam independentemente dessa preferência.</Text>
          </View>
        </>
      )}

      <Text style={[styles.section,styles.sectionFullWidth]}>DADOS E MANUTENÇÃO</Text>
      <Text style={styles.info}>VERSÃO: {appVersion}</Text>
      
      <Text style={styles.info}>SALVAMENTO AUTOMÁTICO: ATIVO</Text>
      <Text style={styles.info}>ÚLTIMO SALVAMENTO: {formatTime(saveStatus.lastSavedAt)}</Text>
      {saveStatus.lastError ? <Text style={styles.error}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text> : null}

      <View style={[styles.actionsGrid,layout.landscape&&styles.actionsGridLandscape,{gap:layout.gap}]}>
      <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} onPress={handleBackup} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'FAZER BACKUP'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} onPress={handleCleanLogs} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'LIMPAR LOGS ANTIGOS'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} onPress={handleBluetoothReport} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'EXPORTAR RELATÓRIO BLUETOOTH (.TXT)'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} onPress={handleDailyHistoryExport} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'EXPORTAR HISTÓRICO DIÁRIO ECU (.TXT)'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} onPress={handleExport} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'EXPORTAR SALVAMENTO (.TXT)'}</Text>
      </TouchableOpacity>
      {profile ? (
        <Link href="/veiculo" asChild>
          <TouchableOpacity style={[styles.button,layout.landscape&&styles.buttonLandscape]} accessibilityRole="button" accessibilityLabel="Abrir perfil do veículo">
            <Text style={styles.buttonText}>VER PERFIL DO VEÍCULO</Text>
          </TouchableOpacity>
        </Link>
      ) : <Text style={styles.info}>Veículo: N/D</Text>}

      </View>
      <Link href="/mais" asChild><TouchableOpacity style={styles.backButton} accessibilityRole="button" accessibilityLabel="Voltar aos recursos"><Text style={styles.backButtonText}>VOLTAR AOS RECURSOS</Text></TouchableOpacity></Link>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

function SettingSwitch({ label, value, onChange, landscapeCard = false }: { label: string; value: boolean; onChange: (value: boolean) => void; landscapeCard?: boolean }) {
  return (
    <View style={[styles.switchRow,landscapeCard&&styles.switchRowLandscape]}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: COLORS.screen },
  title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },
  section: { width: '100%', fontSize: 12, fontWeight: '900', color: COLORS.accent, letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  sectionFullWidth: { width: '100%' },
  settingsGrid: { width: '100%' },
  settingsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'flex-start' },
  cardLandscape: { width: '48.5%', minWidth: 0 },
  noteFullWidth: { width: '100%' },
  actionsGrid: { width: '100%' },
  actionsGridLandscape: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'stretch' },
  buttonLandscape: { width: '48.5%', minHeight: 48, justifyContent: 'center' },
  backButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, marginTop: 10, padding: 12 },
  backButtonText: { color: COLORS.accent, fontWeight: '900', fontSize: 11 },
  status: { color: COLORS.primary, fontWeight: '700', marginBottom: 12 },
  card: { backgroundColor: COLORS.surfaceRaised, borderRadius: 8, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: '#243652' },
  label: { flex: 1, color: COLORS.text, fontWeight: '600' },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 10 },
  choice: { flexGrow: 1, flexBasis: 86, minWidth: 86, minHeight: 48, borderWidth: 1, borderColor: COLORS.border, borderRadius: 8, padding: 11, alignItems: 'center', justifyContent: 'center' },
  choiceActive: { backgroundColor: '#172f52', borderColor: '#3b82f6' },
  choiceText: { color: COLORS.text, fontWeight: '700', flexShrink: 1, textAlign: 'center', lineHeight: 16 },
  switchRow: { minHeight: 48, backgroundColor: COLORS.surfaceRaised, borderRadius: 8, padding: 11, marginBottom: 9, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#243652' },
  switchRowLandscape: { width: '48.5%', minWidth: 0 },
  info: { color: COLORS.text, marginBottom: 6, fontSize: 12 },
  note: { color: '#8da2bd', fontSize: 10, lineHeight: 15, marginTop: -2, marginBottom: 8 },
  error: { color: '#dc2626', fontWeight: '600', marginBottom: 12 },
  button: { minHeight: 48, backgroundColor: COLORS.primary, borderRadius: 10, padding: 14, alignItems: 'center', justifyContent: 'center', marginBottom: 10, marginTop: 6 },
  buttonText: { color: COLORS.white, fontWeight: '700' },
});