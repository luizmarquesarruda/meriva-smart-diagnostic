import React, { useEffect, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { checkStorageQuota, getStorageBreakdown, StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { getMidLayout } from '../src/ui/midLayout';
import { readDriveCycles } from '../src/storage/driveCycleStorage';
import type { DriveCycle } from '../src/data/driveCycles';

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
  const [cycles, setCycles] = useState<DriveCycle[]>([]);

  async function refresh(path: string) {
    const status = await checkStorageQuota(path, DEFAULT_QUOTA);
    setQuota(status);
    const breakdown = await getStorageBreakdown(path);
    setUsageBreakdown(breakdown);
    setCycles((await readDriveCycles(path)).sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
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
      <Text style={styles.title}>HISTÓRICO E DADOS</Text>
      <Text style={styles.subtitle}>O app salva as viagens e leituras automaticamente. Esta tela serve para acompanhar o espaço usado e fazer limpeza quando necessário.</Text>
      <Text style={[styles.status, quota?.critical ? styles.critical : quota?.warning ? styles.warning : styles.ok]}>
        {quota?.message || 'VERIFICANDO'}
      </Text>
      {!!message && <Text style={styles.cleanMessage}>{message}</Text>}
      <View style={styles.card}>
        <Text style={styles.cardTitle}>ESPAÇO UTILIZADO</Text>
        {Object.entries(usageBreakdown).map(([dir, sizesMb]) => (
          <View key={dir} style={styles.row}>
            <Text style={styles.label}>{dir}</Text>
            <Text style={styles.value}>{sizesMb} MB</Text>
          </View>
        ))}
        <Text style={styles.note}>Limite configurado: 2 GB. A limpeza remove somente dados antigos permitidos pelo sistema.</Text>
      </View>
      <View style={styles.historyCard}>
        <Text style={styles.cardTitle}>VIAGENS SALVAS</Text>
        {cycles.length ? cycles.slice(0, 6).map((cycle) => (
          <View key={cycle.id} style={styles.historyRow}>
            <View style={styles.historyMain}>
              <Text style={styles.historyDate}>{cycle.startedAt}</Text>
              <Text style={styles.historyMeta}>{cycle.distanceTotalKm.toFixed(2)} km • {cycle.avgFuelConsumptionKml.toFixed(2)} km/L</Text>
            </View>
            <Text style={cycle.source === 'REAL_OBD' ? styles.real : styles.reference}>{cycle.source === 'REAL_OBD' ? 'REAL' : 'REF.'}</Text>
          </View>
        )) : <Text style={styles.empty}>Nenhuma viagem salva ainda.</Text>}
      </View>

      <TouchableOpacity style={styles.button} onPress={handleClean} disabled={!basePath || busy}>
        <Text style={styles.buttonText}>{busy ? 'LIMPANDO...' : 'LIMPAR DADOS ANTIGOS'}</Text>
      </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: '#eef3fb' },
  title: { fontSize: 23, fontWeight: '900', color: '#1557a6', letterSpacing: 0.5, marginBottom: 5 },
  subtitle: { color: '#64748b', fontSize: 11, lineHeight: 16, marginBottom: 12 },
  status: { fontWeight: '700', marginBottom: 16 },
  ok: { color: '#16a34a' },
  warning: { color: '#d97706' },
  critical: { color: '#dc2626' },
  cleanMessage: { color: '#374151', marginBottom: 12 },
  historyCard: { backgroundColor: '#fff', borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#d1d9e2', marginBottom: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  historyMain: { flex: 1 },
  historyDate: { color: '#1f2937', fontWeight: '800', fontSize: 11 },
  historyMeta: { color: '#64748b', fontSize: 10, marginTop: 2 },
  real: { color: '#15803d', fontWeight: '900', fontSize: 9 },
  reference: { color: '#b45309', fontWeight: '900', fontSize: 9 },
  empty: { color: '#64748b', fontSize: 11 },
  card: { backgroundColor: '#fff', borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#d1d9e2', marginBottom: 10 },
  cardTitle: { color: '#1f2937', fontSize: 12, fontWeight: '900', marginBottom: 7 },
  row: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#e5e7eb', flexDirection: 'row', justifyContent: 'space-between' },
  note: { color: '#64748b', fontSize: 10, lineHeight: 15, marginTop: 8 },
  label: { color: '#1f2937', fontWeight: '600' },
  value: { color: '#2563eb', fontWeight: '700' },
  button: { backgroundColor: '#1557a6', borderRadius: 7, padding: 13, alignItems: 'center', marginTop: 4 },
  buttonText: { color: '#fff', fontWeight: '700' },
});
