import React, { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { flushCsvLogs, getCsvQueueStatus } from '../src/database/csvLogger';
import { checkStorageQuota, getStorageBreakdown, StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { getMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { AppIcon } from '../src/ui/AppIcon';
import { SourceStatusLegend } from '../src/ui/SourceStatusLegend';
import { exportDiagnosticsJson, exportDriveCyclesCsv } from '../src/storage/exportDiagnostics';
import { exportHistoryBenchmarkTxt, measureHistoryStorage, type HistoryStorageMeasurement } from '../src/storage/historyBenchmark';
import { recordStorageHealthIssue, clearStorageHealthIssue } from '../src/storage/storageHealth';

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
  const [csvQueueStatus, setCsvQueueStatus] = useState(getCsvQueueStatus());
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [benchmark, setBenchmark] = useState<HistoryStorageMeasurement | null>(null);

  async function refresh(path: string) {
    setCsvQueueStatus(getCsvQueueStatus());
    try {
      const status = await checkStorageQuota(path, DEFAULT_QUOTA);
      setQuota(status);
      setUsageBreakdown(await getStorageBreakdown(path));
    } catch (cause) {
      setQuota({
        warning: true,
        critical: true,
        message: 'NÃO FOI POSSÍVEL VERIFICAR O ARMAZENAMENTO COM SEGURANÇA: ' +
          (cause instanceof Error ? cause.message : String(cause)),
      });
      setUsageBreakdown({});
    }
  }

  useEffect(() => {
    async function checkQuota() {
      const path = `${FileSystem.documentDirectory}MERIVA_SMART`;
      setBasePath(path);
      await refresh(path);
    }

    void checkQuota();
  }, []);

  async function handleBenchmark() {
    if (!basePath || busy) return;
    setBusy(true);
    setMessage('MEDINDO HISTÓRICO NO DISPOSITIVO...');
    try {
      await flushCsvLogs();
      const result = await measureHistoryStorage(basePath, Platform.OS, Platform.Version);
      setBenchmark(result);
      clearStorageHealthIssue('CLEANUP_FAILED');
      setMessage('MEDIÇÃO CONCLUÍDA. O ÍNDICE REAL E A CÓPIA ANTERIOR NÃO FORAM ALTERADOS.');
    } catch (cause) {
      setMessage('FALHA NA MEDIÇÃO: ' + (cause instanceof Error ? cause.message : String(cause)));
    } finally {
      setBusy(false);
    }
  }

  async function handleExportBenchmark() {
    if (!benchmark || busy) return;
    setBusy(true);
    try {
      const result = await exportHistoryBenchmarkTxt(benchmark);
      setMessage(result.ok
        ? 'RELATÓRIO TXT EXPORTADO: ' + result.fileName
        : result.reason === 'CANCELADO' ? 'EXPORTAÇÃO CANCELADA.'
          : 'FALHA AO EXPORTAR RELATÓRIO: ' + (result.message ?? result.reason ?? 'ERRO'));
    } finally {
      setBusy(false);
    }
  }

  async function handleClean() {
    if (!basePath || busy) return;
    setBusy(true);
    setMessage('LIMPANDO...');
    try {
      await flushCsvLogs();
      setCsvQueueStatus(getCsvQueueStatus());
      const logs = await cleanupOldLogs(basePath);
      const readings = await cleanupOldReadings(basePath);
      setMessage(`REMOVIDOS: ${logs} LOGS, ${readings} LEITURAS`);
      clearStorageHealthIssue('CLEANUP_FAILED');
      await refresh(basePath);
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      recordStorageHealthIssue('CLEANUP_FAILED', 'Falha na limpeza do armazenamento', detail, 'warning');
      setMessage('FALHA NA LIMPEZA: ' + detail);
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
      setCsvQueueStatus(getCsvQueueStatus());
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
    <SafeAreaView style={{flex:1,backgroundColor:COLORS.screen}} edges={["top","bottom","left","right"]}>
    <ScrollView contentContainerStyle={[styles.container, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
      <View style={{ width: '100%', maxWidth: layout.maxContentWidth }}>
      <Text style={[styles.title,{fontSize:layout.titleSize-3}]}>ARMAZENAMENTO E EXPORTAÇÃO</Text>
      <Text style={styles.subtitle}>Arquivos locais, fila de registros, espaço usado e exportações. Para ver trajetos, métricas e detalhes, abra Viagens.</Text>
      <SourceStatusLegend compact />
      <Text style={[styles.status, quota?.critical ? styles.critical : quota?.warning ? styles.warning : styles.ok]}>
        {quota?.message || 'VERIFICANDO'}
      </Text>
      {!!message && <Text style={styles.cleanMessage}>{message}</Text>}
      <View style={[styles.dataColumns, layout.landscape && styles.dataColumnsLandscape]}>
      <View style={[styles.card, layout.landscape && styles.dataColumnCard]}>
        <Text style={styles.cardTitle}>ESPAÇO UTILIZADO</Text>
        {Object.entries(usageBreakdown).filter(([dir]) => dir !== 'BACKUP').map(([dir, sizesMb]) => (
          <View key={dir} style={styles.row}>
            <Text style={styles.label}>{dir}</Text>
            <Text style={styles.value}>{sizesMb} MB</Text>
          </View>
        ))}
        <Text style={styles.note}>Limite configurado: 2 GB. A limpeza remove somente dados antigos permitidos pelo sistema.</Text>
        <View style={styles.row}>
          <Text style={styles.label}>BACKUP (uso separado)</Text>
          <Text style={styles.value}>{usageBreakdown.BACKUP ?? 0} MB</Text>
        </View>
        <Text style={styles.note}>Novos backups incluem configurações, banco, viagens, manutenção e aprendizado. CSVs brutos de LEITURAS e LOGS ficam fora dos novos backups; restaurações antigas continuam compatíveis e preservam diretórios ausentes no snapshot.</Text>
        <Text style={styles.note}>
          Fila CSV: {csvQueueStatus.pendingRows}/{csvQueueStatus.maxPendingRows} pendentes.
          Registros descartados por saturação: {csvQueueStatus.droppedRows}.
        </Text>
      </View>
      <View style={[styles.historyCard, layout.landscape && styles.dataColumnCard]}>
        <Text style={styles.cardTitle}>RELATÓRIOS DE VIAGENS</Text>
        <Text style={styles.note}>A lista completa, os detalhes por percurso e os gráficos históricos ficam na área Viagens. Esta tela concentra o armazenamento local e as exportações.</Text>
        <Link href="/viagens" asChild>
          <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} accessibilityRole="button" accessibilityLabel="Abrir relatórios de viagens">
            <AppIcon name="trips" size={18} color={COLORS.white} />
            <Text style={styles.buttonText}>ABRIR HISTÓRICO DE VIAGENS</Text>
          </TouchableOpacity>
        </Link>
      </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>MEDIÇÃO DO HISTÓRICO NO APARELHO</Text>
        <Text style={styles.note}>Mede volume, leitura, gravação temporária e cópia de restauração em teste. O índice principal e sua cópia anterior não são modificados. A medição não compara SQLite.</Text>
        <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} onPress={() => void handleBenchmark()} disabled={!basePath || busy}>
          <AppIcon name="data" size={18} color={COLORS.white} />
          <Text style={styles.buttonText}>{busy ? 'MEDINDO...' : 'MEDIR HISTÓRICO JSON'}</Text>
        </TouchableOpacity>
        {benchmark && <>
          <View style={styles.row}><Text style={styles.label}>Viagens / IDs únicos</Text><Text style={styles.value}>{benchmark.trips} / {benchmark.uniqueTripIds}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Amostras / IDs duplicados</Text><Text style={styles.value}>{benchmark.telemetrySamples} / {benchmark.duplicateTripIds}</Text></View>
          <View style={styles.row}><Text style={styles.label}>Índice JSON / pasta VIAGENS / CSV</Text><Text style={styles.value}>{(benchmark.jsonBytes / 1024).toFixed(1)} / {(benchmark.tripDirectoryBytes / 1024).toFixed(1)} / {(benchmark.csvBytes / 1024).toFixed(1)} KB</Text></View>
          <View style={styles.row}><Text style={styles.label}>Leitura + parse P95</Text><Text style={styles.value}>{benchmark.readParseMs.p95} ms (limiar {benchmark.thresholds.historyReadParseP95Ms} ms)</Text></View>
          <View style={styles.row}><Text style={styles.label}>Escrita + read-back P95</Text><Text style={styles.value}>{benchmark.scratchWriteReadbackMs.p95} ms (limiar {benchmark.thresholds.scratchWriteReadbackP95Ms} ms)</Text></View>
          <View style={styles.row}><Text style={styles.label}>Restauração em teste P95</Text><Text style={styles.value}>{benchmark.restoreDryRunMs.p95} ms</Text></View>
          <Text style={styles.note}>Memória do processo: N/D pela API Expo. Integridade: {benchmark.integrity}. Abertura de tela e memória exigem medição externa no Galaxy A06.</Text>
          <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} onPress={() => void handleExportBenchmark()} disabled={busy}>
            <AppIcon name="history" size={18} color={COLORS.white} />
            <Text style={styles.buttonText}>EXPORTAR RELATÓRIO TXT</Text>
          </TouchableOpacity>
        </>}
      </View>

      <View style={styles.exportRow}>
        <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} onPress={() => void handleExport('JSON')} disabled={!basePath || busy}>
          <AppIcon name="history" size={18} color={COLORS.white} /><Text style={styles.buttonText}>EXPORTAR JSON</Text>
        </TouchableOpacity>
        <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} onPress={() => void handleExport('CSV')} disabled={!basePath || busy}>
          <AppIcon name="data" size={18} color={COLORS.white} /><Text style={styles.buttonText}>EXPORTAR CSV</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity style={[styles.button, styles.buttonWithIcon]} onPress={handleClean} disabled={!basePath || busy}>
        <AppIcon name="warning" size={18} color={COLORS.white} />
        <Text style={styles.buttonText}>{busy ? 'LIMPANDO...' : 'LIMPAR DADOS ANTIGOS'}</Text>
      </TouchableOpacity>
      <Link href="/mais" asChild><TouchableOpacity style={styles.backButton} accessibilityRole="button" accessibilityLabel="Voltar aos recursos"><Text style={styles.backButtonText}>VOLTAR AOS RECURSOS</Text></TouchableOpacity></Link>
      </View>
    </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flexGrow: 1, paddingVertical: 16, backgroundColor: COLORS.screen },
  dataColumns: { width: '100%' },
  dataColumnsLandscape: { flexDirection: 'row', gap: 10, alignItems: 'flex-start' },
  dataColumnCard: { flex: 1, minWidth: 0 },
  title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },
  subtitle: { color: '#8da2bd', fontSize: 11, lineHeight: 16, marginBottom: 12 },
  status: { fontWeight: '700', marginBottom: 16 },
  ok: { color: '#16a34a' },
  warning: { color: '#d97706' },
  critical: { color: '#dc2626' },
  cleanMessage: { color: COLORS.text, marginBottom: 12 },
  historyCard: { backgroundColor: COLORS.surfaceRaised, borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#243652', marginBottom: 10 },
  historyRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#243652' },
  historyMain: { flex: 1, minWidth: 0 },
  historyDate: { color: COLORS.text, fontWeight: '800', fontSize: 11 },
  historyMeta: { color: '#8da2bd', fontSize: 10, marginTop: 2 },
  real: { color: '#15803d', fontWeight: '900', fontSize: 9 },
  reference: { color: '#b45309', fontWeight: '900', fontSize: 9 },
  empty: { color: '#8da2bd', fontSize: 11 },
  card: { backgroundColor: COLORS.surfaceRaised, borderRadius: 8, padding: 11, borderWidth: 1, borderColor: '#243652', marginBottom: 10 },
  cardTitle: { color: COLORS.text, fontSize: 12, fontWeight: '900', marginBottom: 7 },
  row: { paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#243652', flexDirection: 'row', justifyContent: 'space-between' },
  note: { color: '#8da2bd', fontSize: 10, lineHeight: 15, marginTop: 8 },
  label: { color: COLORS.text, fontWeight: '600' },
  value: { color: COLORS.primary, fontWeight: '700' },
  exportRow: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 4 },
  button: { flex: 1, minHeight: 48, backgroundColor: '#1557a6', borderRadius: 7, padding: 13, alignItems: 'center', justifyContent: 'center', marginTop: 4 },
  buttonWithIcon: { flexDirection: 'row', justifyContent: 'center', gap: 7 },
  buttonText: { color: COLORS.white, fontWeight: '700' },
  backButton: { minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: COLORS.border, borderRadius: 10, padding: 12, marginTop: 10 },
  backButtonText: { color: COLORS.accent, fontSize: 11, fontWeight: '900' },
});
