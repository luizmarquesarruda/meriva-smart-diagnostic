import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { checkStorageQuota, getStorageBreakdown, StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { getMidLayout } from '../src/ui/midLayout';

const DEFAULT_QUOTA: StorageQuotaConfig = {
  limitMb: 2048,
  warningThreshold: 0.9,
  cleanupTargetMb: 1536,
  autoCleanupEnabled: true,
};

export default function ArmazenamentoScreen() {
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
  const [basePath, setBasePath] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ warning: boolean; critical: boolean; message: string } | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<Record<string, number>>({});
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  async function refresh(path: string) {
    const status = await checkStorageQuota(path, DEFAULT_QUOTA);
    setQuota(status);
    const breakdown = await getStorageBreakdown(path);
    setUsageBreakdown(breakdown);
  }

  useEffect(() => {
    async function checkQuota() {
      const path = `${FileSystem.documentDirectory}MERIVA_SMART`;
      setBasePath(path);
      await refresh(path);
    }

    void checkQuota();
  }, []);

  async function handleClean() {
    if (!basePath || busy) return;
    setBusy(true);
    setMessage('LIMPANDO...');
    try {
      const logs = await cleanupOldLogs(basePath);
      const readings = await cleanupOldReadings(basePath);
      setMessage(`REMOVIDOS: ${logs} LOGS, ${readings} LEITURAS`);
      await refresh(basePath);
    } catch {
      setMessage('FALHA NA LIMPEZA');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={styles.title}>ARMAZENAMENTO</Text>
      <Text style={[styles.status, quota?.critical ? styles.critical : quota?.warning ? styles.warning : styles.ok]}>
        {quota?.message || 'VERIFICANDO'}
      </Text>
      {!!message && <Text style={styles.cleanMessage}>{message}</Text>}
      {Object.entries(usageBreakdown).map(([dir, sizesMb]) => (
        <View key={dir} style={styles.row}>
          <Text style={styles.label}>{dir}</Text>
          <Text style={styles.value}>{sizesMb} MB</Text>
        </View>
      ))}
      <TouchableOpacity style={styles.button} onPress={handleClean} disabled={!basePath || busy}>
        <Text style={styles.buttonText}>{busy ? 'LIMPANDO...' : 'LIMPAR DADOS ANTIGOS'}</Text>
      </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: '#eef3fb' },
  title: { fontSize: 24, fontWeight: '700', color: '#1f2937', marginBottom: 16 },
  status: { fontWeight: '700', marginBottom: 16 },
  ok: { color: '#16a34a' },
  warning: { color: '#d97706' },
  critical: { color: '#dc2626' },
  cleanMessage: { color: '#374151', marginBottom: 12 },
  row: { backgroundColor: '#fff', borderRadius: 10, padding: 12, marginBottom: 8, flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: '#1f2937', fontWeight: '600' },
  value: { color: '#2563eb', fontWeight: '700' },
  button: { backgroundColor: '#2563eb', borderRadius: 10, padding: 14, alignItems: 'center', marginTop: 12 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
