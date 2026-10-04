import React, { useEffect, useState } from 'react';
import Constants from 'expo-constants';
import { StyleSheet, Switch, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { createBackup } from '../src/storage/backup';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { VehicleProfile } from '../src/database/vehicleConfig';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave } from '../src/meriva/autosaveManager';
import { exportAutoSaveTxt } from '../src/meriva/exportAutoSaveTxt';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import { DEFAULT_SCREEN_PREFERENCES, loadScreenPreferences, saveScreenPreferences, type ScreenPreferences } from '../src/ui/screenPreferences';

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return 'N/D'; }
}

export default function ConfiguracaoScreen() {
  const [storageBase, setStorageBase] = useState<string | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [status, setStatus] = useState('INICIALIZANDO...');
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [screenPrefs, setScreenPrefs] = useState<ScreenPreferences>(DEFAULT_SCREEN_PREFERENCES);
  const appVersion = Constants.expoConfig?.version ?? '1.0.1';

  useEffect(() => {
    async function initStorage() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const state = await initAutoSave(basePath);
      setProfile(state.vehicle);
      setScreenPrefs(await loadScreenPreferences(basePath));
      setSaveStatus(getAutoSaveStatus());
      setStatus('ARMAZENAMENTO PRONTO');
      setStorageBase(basePath);
    }
    void initStorage();
  }, []);

  async function updateScreen(key: keyof ScreenPreferences, value: boolean) {
    if (!storageBase) return;
    if (!value && Object.values(screenPrefs).filter(Boolean).length === 1) {
      setStatus('MANTENHA PELO MENOS UMA TELA ATIVA');
      return;
    }
    const next = { ...screenPrefs, [key]: value };
    setScreenPrefs(next);
    try {
      await saveScreenPreferences(storageBase, next);
      setStatus('TELAS SALVAS');
    } catch {
      setStatus('FALHA AO SALVAR TELAS');
    }
  }

  async function handleBackup() {
    if (!storageBase || busy) return;
    setBusy(true);
    try {
      const info = await createBackup(storageBase);
      setStatus(`BACKUP CRIADO: ${info.timestamp}`);
    } catch { setStatus('FALHA NO BACKUP'); }
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
    } finally {
      setBusy(false);
      setSaveStatus(getAutoSaveStatus());
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CONFIGURAÇÕES</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.info}>VERSÃO: {appVersion}</Text>
      <Text style={styles.info}>Local: {storageBase || 'INICIALIZANDO'}</Text>

      <View style={styles.card}>
        <Text style={styles.sectionTitle}>TELAS DO MENU PRINCIPAL</Text>
        <Text style={styles.help}>Escolha quais telas aparecem no painel inicial. A configuração fica salva no celular.</Text>
        <View style={styles.row}><Text style={styles.rowText}>LABORATÓRIO OBD</Text><Switch value={screenPrefs.laboratorio} onValueChange={(v) => void updateScreen('laboratorio', v)} /></View>
        <View style={styles.row}><Text style={styles.rowText}>ARMAZENAMENTO</Text><Switch value={screenPrefs.armazenamento} onValueChange={(v) => void updateScreen('armazenamento', v)} /></View>
        <View style={styles.row}><Text style={styles.rowText}>CONFIGURAÇÕES</Text><Switch value={screenPrefs.configuracoes} onValueChange={(v) => void updateScreen('configuracoes', v)} /></View>
      </View>

      <Text style={styles.info}>SALVAMENTO AUTOMÁTICO: ATIVO</Text>
      <Text style={styles.info}>ÚLTIMO SALVAMENTO: {formatTime(saveStatus.lastSavedAt)}</Text>
      {saveStatus.lastError ? <Text style={styles.error}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text> : null}
      <TouchableOpacity style={styles.button} onPress={handleBackup} disabled={busy}><Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'FAZER BACKUP'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleCleanLogs} disabled={busy}><Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'LIMPAR LOGS ANTIGOS'}</Text></TouchableOpacity>
      <TouchableOpacity style={styles.button} onPress={handleExport} disabled={busy}><Text style={styles.buttonText}>{busy ? 'AGUARDE...' : 'EXPORTAR SALVAMENTO (.TXT)'}</Text></TouchableOpacity>
      {profile ? <Text style={styles.info}>Veículo: {profile.vehicleName}</Text> : <Text style={styles.info}>Veículo: N/D</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 12 },
  info: { color: '#374151', marginBottom: 6 },
  error: { color: '#dc2626', fontWeight: '600', marginBottom: 12 },
  card: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 16 },
  sectionTitle: { fontSize: 16, fontWeight: '800', color: '#1f2937', marginBottom: 6 },
  help: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  row: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  rowText: { color: '#1f2937', fontWeight: '700' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
