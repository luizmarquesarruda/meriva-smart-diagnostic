import React, { useEffect, useState } from 'react';
import { cockpitTheme } from '../src/ui/cockpitTheme';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { flushCsvLogs } from '../src/database/csvLogger';
import { checkStorageQuota, getStorageBreakdown, StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { getMidLayout } from '../src/ui/midLayout';
import { readDriveCycles } from '../src/storage/driveCycleStorage';
import type { DriveCycle } from '../src/data/driveCycles';
import { exportDiagnosticsJson, exportDriveCyclesCsv } from '../src/storage/exportDiagnostics';

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
    setCycles((await readDriveCycles(path)).filter((cycle) => cycle.source === 'REAL_OBD').sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()));
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
      await flushCsvLogs();
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



  async function handleExport(format: 'JSON' | 'CSV') {
    if (!basePath || busy) return;
    setBusy(true);
    setMessage('EXPORTANDO...');
    try {
      await flushCsvLogs();
      const path = format === 'JSON'
        ? await exportDiagnosticsJson(basePath)
        : await exportDriveCyclesCsv(basePath);
      setMessage(`EXPORTADO ${format}: ${path}`);
    } catch {
      setMessage(`FALHA AO EXPORTAR ${format}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <SafeAreaView style={{flex:1,backgroundColor: cockpitTheme.background}} edges={["bottom","left","right"]}>
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={styles.title}>HISTÓRICO E DADOS</Text>
      <Text style={styles.subtitle}>O app salva as viagens e leituras automaticamente. Esta tela serve para acompanhar o espaço usado e fazer limpeza quando necessário.</Text>
      <Text style={[styles.status, quota?.critical ? styles.critical : quota?.warning ? styles.warning : styles.ok]}>
        {quota?.message || 'VERIFICANDO'}
      </Text>
      {!!message && <Text style={styles.cleanMessage}>{message}</Text>}
      <View style={[styles.dataColumns, layout.landscape && styles.dataColumnsLandscape]}>
      <View style={[styles.card, layout.landscape && styles.dataColumnCard]}>
        <Text style={styles.cardTitle}>ESPAÇO UTILIZADO</Text>
        {Object.entries(usageBreakdown).map(([dir, sizesMb]) => (
          <View key={dir} style={styles.row}>
            <Text style={styles.label}>{dir}</Text>
            <Text style={styles.value}>{sizesMb} MB</Text>
          </View>
        ))}
        <Text style={styles.note}>Limite configurado: 2 GB. A limpeza remove somente dados antigos permitidos pelo sistema.</Text>
      </View>
      <View style={[styles.historyCard, layout.landscape && styles.dataColumnCard]}>
        <Text style={styles.cardTitle}>VIAGENS SALVAS</Text>
        {cycles.length ? cycles.slice(0, 6).map((cycle) => (
          <View key={cycle.id} style={styles.historyRow}>
            <View style={styles.historyMain}>
              <Text style={styles.historyDate}>{cycle.startedAt}</Text>
              <Text style={styles.historyMeta}>{cycle.distanceTotalKm.toFixed(2)} km • {(cycle.fuelDataValid !== false && Number.isFinite(cycle.fuelUsedL) && cycle.fuelUsedL >= 0.05 && Number.isFinite(cycle.avgFuelConsumptionKml) && cycle.avgFuelConsumptionKml > 0) ? `${cycle.avgFuelConsumptionKml.toFixed(2)} km/L` : 'Consumo: N/D'}</Text>
            </View>
            <Text style={cycle.source === 'REAL_OBD' ? styles.real : styles.reference}>{cycle.source === 'REAL_OBD' ? 'REAL' : 'REF.'}</Text>
          </View>
        )) : <Text style={styles.empty}>Nenhuma viagem salva ainda.</Text>}
      </View>
      </View>

      <View style={styles.exportRow}>
        <TouchableOpacity style={styles.button} onPress={() => void handleExport('JSON')} disabled={!basePath || busy}><Text style={styles.buttonText}>EXPORTAR JSON</Text></TouchableOpacity>
        <TouchableOpacity style={styles.button} onPress={() => void handleExport('CSV')} disabled={!basePath || busy}><Text style={styles.buttonText}>EXPORTAR CSV</Text></TouchableOpacity>
      </View>

      <TouchableOpacity style={styles.button} onPress={handleClean} disabled={!basePath || busy}>
        <Text style={styles.buttonText}>{busy ? 'LIMPANDO...' : 'LIMPAR DADOS ANTIGOS'}</Text>
      </TouchableOpacity>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 14, backgroundColor: cockpitTheme.background },
  dataColumns: { width: '100%' },
  dataColumnsLandscape: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dataColumnCard: { flex: 1, minWidth: 0 },
  title: { fontSize: 23, fontWeight: '900', color: cockpitTheme.text, letterSpacing: 0.5, marginBottom: 5 },
  subtitle: { color: cockpitTheme.accent, fontSize: 11, lineHeight: 16, marginBottom: 12 },
  status: { fontWeight: '700', marginBottom: 16 },
  ok: { color: cockpitTheme.success },
  warning: { color: cockpitTheme.warning },
  critical: { color: cockpitTheme.danger },
  cleanMessage: { color: cockpitTheme.textStrong, marginBottom: 12 },
  historyCard: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: cockpitTheme.border, marginBottom: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: cockpitTheme.border },
  historyMain: { flex: 1, minWidth: 0 },
  historyDate: { color: cockpitTheme.textStrong, fontWeight: '800', fontSize: 11 },
  historyMeta: { color: cockpitTheme.muted, fontSize: 10, marginTop: 2 },
  real: { color: cockpitTheme.success, fontWeight: '900', fontSize: 9 },
  reference: { color: cockpitTheme.warning, fontWeight: '900', fontSize: 9 },
  empty: { color: cockpitTheme.muted, fontSize: 11 },
  card: { backgroundColor: cockpitTheme.surface, borderRadius: 14, padding: 11, borderWidth: 1, borderColor: cockpitTheme.border, marginBottom: 10 },
  cardTitle: { color: cockpitTheme.textStrong, fontSize: 12, fontWeight: '900', marginBottom: 7 },
  row: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: cockpitTheme.border, flexDirection: 'row', justifyContent: 'space-between' },
  note: { color: cockpitTheme.muted, fontSize: 10, lineHeight: 15, marginTop: 8 },
  label: { color: cockpitTheme.textStrong, fontWeight: '600' },
  value: { color: cockpitTheme.accent, fontWeight: '700' },
  exportRow: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, backgroundColor: cockpitTheme.primary, borderRadius: 7, padding: 13, alignItems: 'center', marginTop: 4 },
  buttonText: { color: cockpitTheme.text, fontWeight: '700' },
});
