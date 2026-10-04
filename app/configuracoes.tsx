import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { createBackup } from '../src/storage/backup';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { VehicleProfile } from '../src/database/vehicleConfig';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave } from '../src/meriva/autosaveManager';
import { exportAutoSaveTxt } from '../src/meriva/exportAutoSaveTxt';
import { AppSettings, readAppSettings, writeAppSettings } from '../src/database/appSettings';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import { getMidLayout } from '../src/ui/midLayout';

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
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
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
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={styles.title}>CONFIGURAÇÕES</Text>
      <Text style={styles.status}>{status}</Text>

      {settings && (
        <>
          <Text style={styles.section}>PREFERÊNCIAS BÁSICAS</Text>
          <View style={styles.card}>
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
          </View>

          <View style={styles.card}>
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

          <SettingSwitch label="Conectar ao ELM327 automaticamente" value={settings.autoConnectObd} onChange={(v) => void updateSetting('autoConnectObd', v)} />
          <SettingSwitch label="Alertas de diagnóstico" value={settings.diagnosticAlerts} onChange={(v) => void updateSetting('diagnosticAlerts', v)} />
          <Text style={styles.note}>O GPS inicia automaticamente quando o aplicativo entra em uso. Essa função é controlada pelo sistema para manter a viagem automática.</Text>
        </>
      )}

      <Text style={styles.section}>DADOS E MANUTENÇÃO</Text>
      <Text style={styles.info}>VERSÃO: {appVersion}</Text>
      
      <Text style={styles.info}>SALVAMENTO AUTOMÁTICO: ATIVO</Text>
      <Text style={styles.info}>ÚLTIMO SALVAMENTO: {formatTime(saveStatus.lastSavedAt)}</Text>
      {saveStatus.lastError ? <Text style={styles.error}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text> : null}

      <TouchableOpacity style={styles.button} onPress={handleBackup} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'FAZER BACKUP'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleCleanLogs} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'LIMPAR LOGS ANTIGOS'}</Text>
      </TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleExport} disabled={busy}>
        <Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'EXPORTAR SALVAMENTO (.TXT)'}</Text>
      </TouchableOpacity>
      {profile ? <Text style={styles.info}>Veículo: {profile.vehicleName}</Text> : <Text style={styles.info}>Veículo: N/D</Text>}
      </View>
    </ScrollView>
  );
}

function SettingSwitch({ label, value, onChange }: { label: string; value: boolean; onChange: (value: boolean) => void }) {
  return (
    <View style={styles.switchRow}>
      <Text style={styles.label}>{label}</Text>
      <Switch value={value} onValueChange={onChange} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: '#eef3fb' },
  title: { fontSize: 23, fontWeight: '900', color: '#1557a6', letterSpacing: 0.5, marginBottom: 6 },
  section: { fontSize: 12, fontWeight: '900', color: '#1557a6', letterSpacing: 0.8, marginTop: 16, marginBottom: 8 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 11, marginBottom: 9, borderWidth: 1, borderColor: '#d1d9e2' },
  label: { flex: 1, color: '#374151', fontWeight: '600' },
  row: { flexDirection: 'row', gap: 8, marginTop: 10 },
  choice: { flex: 1, borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 11, alignItems: 'center' },
  choiceActive: { backgroundColor: '#dbeafe', borderColor: '#2563eb' },
  choiceText: { color: '#1f2937', fontWeight: '700' },
  switchRow: { backgroundColor: '#fff', borderRadius: 8, padding: 11, marginBottom: 9, flexDirection: 'row', alignItems: 'center', borderWidth: 1, borderColor: '#d1d9e2' },
  info: { color: '#374151', marginBottom: 6, fontSize: 12 },
  note: { color: '#64748b', fontSize: 10, lineHeight: 15, marginTop: -2, marginBottom: 8 },
  error: { color: '#dc2626', fontWeight: '600', marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700' },
});