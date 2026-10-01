import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { createBackup } from '../src/storage/backup';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { VehicleProfile } from '../src/database/vehicleConfig';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave } from '../src/meriva/autosaveManager';
import { exportAutoSaveTxt } from '../src/meriva/exportAutoSaveTxt';
import type { AutoSaveStatus } from '../src/meriva/autosaveTypes';

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR');
  } catch {
    return 'N/D';
  }
}

export default function ConfiguracaoScreen() {
  const [storageBase, setStorageBase] = useState<string | null>(null);
  const [profile, setProfile] = useState<VehicleProfile | null>(null);
  const [status, setStatus] = useState('INICIALIZANDO...');
  const [busy, setBusy] = useState(false);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });

  useEffect(() => {
    async function initStorage() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const state = await initAutoSave(basePath);
      setProfile(state.vehicle);
      setSaveStatus(getAutoSaveStatus());
      setStatus('ARMAZENAMENTO PRONTO');
      setStorageBase(basePath);
    }

    void initStorage();
  }, []);

  async function handleBackup() {
    if (!storageBase || busy) return;
    setBusy(true);
    try {
      const info = await createBackup(storageBase);
      setStatus(`BACKUP CRIADO: ${info.timestamp}`);
    } catch (cause) {
      setStatus('FALHA NO BACKUP');
    } finally {
      setBusy(false);
      setSaveStatus(getAutoSaveStatus());
    }
  }

  async function handleCleanLogs() {
    if (!storageBase || busy) return;
    setBusy(true);
    try {
      const logs = await cleanupOldLogs(storageBase);
      const readings = await cleanupOldReadings(storageBase);
      setStatus(`REMOVIDOS: ${logs} LOGS, ${readings} LEITURAS`);
    } catch (cause) {
      setStatus('FALHA NA LIMPEZA');
    } finally {
      setBusy(false);
      setSaveStatus(getAutoSaveStatus());
    }
  }

  async function handleExport() {
    if (busy) return;
    setBusy(true);
    try {
      const result = await exportAutoSaveTxt(getAutoSaveState(), '1.0.0');
      if (result.ok) {
        setStatus(`EXPORTADO: ${result.fileName}`);
      } else if (result.reason === 'CANCELADO') {
        setStatus('EXPORTAÇÃO CANCELADA');
      } else {
        setStatus(`FALHA NA EXPORTAÇÃO: ${result.message ?? result.reason}`);
      }
    } finally {
      setBusy(false);
      setSaveStatus(getAutoSaveStatus());
    }
  }

  return (
    <View style={styles.container}>
      <Text style={styles.title}>CONFIGURAÇÕES</Text>
      <Text style={styles.status}>{status}</Text>
      <Text style={styles.info}>Local: {storageBase || 'INICIALIZANDO'}</Text>
      <Text style={styles.info}>SALVAMENTO AUTOMÁTICO: ATIVO</Text>
      <Text style={styles.info}>ÚLTIMO SALVAMENTO: {formatTime(saveStatus.lastSavedAt)}</Text>
      {saveStatus.lastError ? <Text style={styles.error}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text> : null}
      <TouchableOpacity style={[styles.button, styles.disabled]} disabled>
        <Text style={styles.buttonText}>DEFINIR VEÍCULO — EM DESENVOLVIMENTO</Text>
      </TouchableOpacity>
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
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, padding: 20, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  status: { color: '#2563eb', fontWeight: '700', marginBottom: 12 },
  info: { color: '#374151', marginBottom: 6 },
  error: { color: '#dc2626', fontWeight: '600', marginBottom: 12 },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginBottom: 10, marginTop: 6 },
  buttonText: { color: '#fff', fontWeight: '700' },
  disabled: { backgroundColor: '#94a3b8' },
});