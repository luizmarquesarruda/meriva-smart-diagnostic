import React, { useCallback, useEffect, useState } from 'react';
import { ScrollView, Share, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { flushCsvLogs } from '../src/database/csvLogger';
import { checkStorageQuota, getStorageBreakdown, type StorageQuotaConfig } from '../src/storage/quotaManager';
import { cleanupOldLogs, cleanupOldReadings } from '../src/storage/cleanup';
import { getMidLayout } from '../src/ui/midLayout';
import BottomNavigation from '../src/ui/BottomNavigation';
import { exportDiagnosticsTxt, exportDriveCyclesTxt } from '../src/storage/exportDiagnostics';
import { DAILY_OBD_HISTORY_FILE } from '../src/meriva/dailyObdHistory';
import { AUTOSAVE_HISTORY_FILE } from '../src/meriva/autosaveHistoryTxt';
import { getSqliteStorageOverview, type SqliteStorageOverview } from '../src/storage/merivaDatabase';

const DEFAULT_QUOTA: StorageQuotaConfig = { limitMb: 2048, warningThreshold: 0.9, cleanupTargetMb: 1536, autoCleanupEnabled: true };
const MAX_PREVIEW_CHARS = 18000;
const MAX_SHARE_CHARS = 18000;

type TxtReport = { name: string; path: string; category: string; sizeBytes: number; modifiedAt: number };

function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 B';
  if (bytes < 1024) return bytes + ' B';
  if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
  return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
}
function categoryFor(path: string): string {
  const name = path.split('/').pop() ?? path;
  const lowered = path.toLowerCase();
  if (lowered.includes('/testes/') || lowered.includes('/testes-sensores/') || name.toLowerCase().startsWith('teste-sensores-')) return 'TESTE DE SENSORES';
  if (name === DAILY_OBD_HISTORY_FILE) return 'HISTÓRICO DIÁRIO ECU';
  if (name === AUTOSAVE_HISTORY_FILE) return 'HISTÓRICO DE AUTOSAVE';
  if (name === 'pids_meriva_confirmados.txt') return 'PIDs CONFIRMADOS';
  return 'RELATÓRIO TXT';
}
async function addTxtReport(path: string, reports: TxtReport[], seen: Set<string>): Promise<void> {
  if (seen.has(path) || !path.toLowerCase().endsWith('.txt')) return;
  try {
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (!info.exists || info.isDirectory) return;
    seen.add(path);
    reports.push({ name: path.split('/').pop() ?? path, path, category: categoryFor(path), sizeBytes: info.size ?? 0, modifiedAt: (info.modificationTime ?? 0) * 1000 });
  } catch { /* Arquivo ausente ou inacessível: continuar listando os demais. */ }
}
async function scanTxtDirectory(root: string, reports: TxtReport[], seen: Set<string>, depth = 0): Promise<void> {
  if (depth > 4) return;
  try {
    const info = await FileSystem.getInfoAsync(root);
    if (!info.exists) return;
    if (!info.isDirectory) { await addTxtReport(root, reports, seen); return; }
    for (const item of await FileSystem.readDirectoryAsync(root)) {
      await scanTxtDirectory(root + '/' + item, reports, seen, depth + 1);
    }
  } catch { /* Uma pasta indisponível não bloqueia a central. */ }
}
async function listTxtReports(basePath: string): Promise<TxtReport[]> {
  const reports: TxtReport[] = [];
  const seen = new Set<string>();
  await scanTxtDirectory(basePath + '/RELATORIOS', reports, seen);
  await scanTxtDirectory(basePath + '/testes-sensores', reports, seen);
  await addTxtReport(basePath + '/VIAGENS/' + DAILY_OBD_HISTORY_FILE, reports, seen);
  await addTxtReport(basePath + '/CONFIG/' + AUTOSAVE_HISTORY_FILE, reports, seen);
  await addTxtReport(basePath + '/BANCO/pids_meriva_confirmados.txt', reports, seen);
  return reports.sort((a, b) => b.modifiedAt - a.modifiedAt || a.name.localeCompare(b.name));
}

export default function ArmazenamentoScreen() {
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
  const [basePath, setBasePath] = useState<string | null>(null);
  const [quota, setQuota] = useState<{ warning: boolean; critical: boolean; message: string } | null>(null);
  const [usageBreakdown, setUsageBreakdown] = useState<Record<string, number>>({});
  const [sqliteOverview, setSqliteOverview] = useState<SqliteStorageOverview | null>(null);
  const [sqliteError, setSqliteError] = useState('');
  const [reports, setReports] = useState<TxtReport[]>([]);
  const [previewPath, setPreviewPath] = useState('');
  const [previewContent, setPreviewContent] = useState('');
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(async (path: string) => {
    const results = await Promise.all([checkStorageQuota(path, DEFAULT_QUOTA), getStorageBreakdown(path), listTxtReports(path)]);
    setQuota(results[0]); setUsageBreakdown(results[1]); setReports(results[2]);
    try {
      setSqliteOverview(await getSqliteStorageOverview());
      setSqliteError('');
    } catch (cause) {
      setSqliteOverview(null);
      setSqliteError(cause instanceof Error ? cause.message : 'Banco SQLite ainda indisponível.');
    }
    return results[2];
  }, []);
  useEffect(() => {
    const path = (FileSystem.documentDirectory ?? '') + 'MERIVA_SMART';
    setBasePath(path);
    void refresh(path);
  }, [refresh]);

  async function openReport(report: TxtReport) {
    try {
      const fullContent = await FileSystem.readAsStringAsync(report.path, { encoding: FileSystem.EncodingType.UTF8 });
      const truncated = fullContent.length > MAX_PREVIEW_CHARS;
      setPreviewContent(truncated ? fullContent.slice(-MAX_PREVIEW_CHARS) : fullContent);
      setPreviewTruncated(truncated); setPreviewPath(report.path);
      setMessage('TXT aberto. O arquivo completo permanece salvo no caminho exibido.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível abrir o relatório TXT.'); }
  }
  async function shareReport(report: TxtReport) {
    setBusy(true);
    try {
      const fullContent = await FileSystem.readAsStringAsync(report.path, { encoding: FileSystem.EncodingType.UTF8 });
      const truncated = fullContent.length > MAX_SHARE_CHARS;
      const excerpt = truncated ? fullContent.slice(-MAX_SHARE_CHARS) : fullContent;
      const note = truncated ? '\n\n[Arquivo longo: compartilhado somente o trecho final para evitar bloquear o Android.]' : '';
      await Share.share({ title: report.name, message: report.name + '\n\n' + excerpt + note });
      setMessage('Conteúdo TXT enviado ao menu de compartilhamento do Android.');
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Não foi possível compartilhar o conteúdo TXT.'); }
    finally { setBusy(false); }
  }
  async function generateReport(kind: 'diagnostico' | 'viagens') {
    if (!basePath || busy) return;
    setBusy(true); setMessage('GERANDO RELATÓRIO TXT...');
    try {
      const path = kind === 'diagnostico' ? await exportDiagnosticsTxt(basePath) : await exportDriveCyclesTxt(basePath);
      const items = await refresh(basePath);
      setMessage('RELATÓRIO TXT SALVO: ' + path);
      const report = items.find((item) => item.path === path);
      if (report) await openReport(report);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Falha ao gerar relatório TXT.'); }
    finally { setBusy(false); }
  }
  async function handleClean() {
    if (!basePath || busy) return;
    setBusy(true); setMessage('LIMPANDO LOGS INTERNOS ANTIGOS...');
    try {
      await flushCsvLogs();
      const logs = await cleanupOldLogs(basePath);
      const readings = await cleanupOldReadings(basePath);
      setMessage('LIMPEZA CONCLUÍDA: ' + logs + ' LOGS INTERNOS E ' + readings + ' ARQUIVOS DE LEITURA ANTIGOS');
      await refresh(basePath);
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : 'Falha na limpeza de dados antigos.'); }
    finally { setBusy(false); }
  }

  return (
    <SafeAreaView style={styles.root} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]} showsVerticalScrollIndicator>
        <View style={[styles.frame, { maxWidth: layout.maxContentWidth }]}>
          <Text style={styles.title}>CENTRAL DE RELATÓRIOS TXT</Text>
          <Text style={styles.subtitle}>Exportações legíveis são TXT UTF-8. JSON continua reservado ao estado interno, configurações e catálogos técnicos do aplicativo.</Text>
          <View style={[styles.statusCard, quota?.critical ? styles.statusCritical : quota?.warning ? styles.statusWarning : styles.statusOk]}>
            <Text style={styles.statusTitle}>{quota?.message ?? 'VERIFICANDO ARMAZENAMENTO...'}</Text>
            <Text style={styles.statusCaption}>A limpeza de logs antigos não remove os relatórios TXT.</Text>
          </View>
          {!!message && <Text selectable style={styles.message}>{message}</Text>}
          <Text style={styles.sectionTitle}>GERAR NOVO RELATÓRIO</Text>
          <View style={[styles.generateRow, layout.landscape && styles.generateRowLandscape]}>
            <TouchableOpacity style={[styles.primaryButton, layout.landscape && styles.generateButtonLandscape]} onPress={() => void generateReport('diagnostico')} disabled={!basePath || busy}>
              <Text style={styles.buttonTitle}>{busy ? 'AGUARDE...' : 'GERAR DIAGNÓSTICO TXT'}</Text>
              <Text style={styles.buttonHint}>Conexão, leituras reais e DTCs</Text>
            </TouchableOpacity>
            <TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.generateButtonLandscape]} onPress={() => void generateReport('viagens')} disabled={!basePath || busy}>
              <Text style={styles.buttonTitle}>GERAR VIAGENS TXT</Text>
              <Text style={styles.buttonHint}>Viagens reais e consumo disponível</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.sectionTitle}>RELATÓRIOS E HISTÓRICOS EXISTENTES</Text>
          {reports.length ? reports.map((report) => (
            <View key={report.path} style={styles.reportCard}>
              <View style={styles.reportInfo}>
                <Text style={styles.reportCategory}>{report.category}</Text>
                <Text style={styles.reportName}>{report.name}</Text>
                <Text style={styles.reportMeta}>{report.modifiedAt ? new Date(report.modifiedAt).toLocaleString('pt-BR') : 'Data N/D'} · {formatBytes(report.sizeBytes)}</Text>
              </View>
              <View style={styles.reportActions}>
                <TouchableOpacity style={styles.smallButton} disabled={busy} onPress={() => void openReport(report)}><Text style={styles.smallButtonText}>LER TXT</Text></TouchableOpacity>
                <TouchableOpacity style={styles.smallButton} disabled={busy} onPress={() => void shareReport(report)}><Text style={styles.smallButtonText}>COMPARTILHAR TEXTO</Text></TouchableOpacity>
              </View>
            </View>
          )) : <Text style={styles.empty}>Ainda não há relatórios TXT salvos. Execute um diagnóstico ou uma varredura de sensores para criar o primeiro.</Text>}
          {!!previewPath && (
            <View style={styles.previewCard}>
              <Text style={styles.sectionTitle}>PRÉ-VISUALIZAÇÃO TXT</Text>
              <Text selectable style={styles.previewPath}>{previewPath}</Text>
              {previewTruncated ? <Text style={styles.previewNotice}>Arquivo grande: a prévia mostra somente os caracteres finais. O TXT completo foi preservado.</Text> : null}
              <Text selectable style={styles.previewText}>{previewContent}</Text>
            </View>
          )}
          <Text style={styles.sectionTitle}>BANCO OPERACIONAL SQLITE</Text>
          <View style={styles.storageCard}>
            {sqliteOverview ? (
              <>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Esquema do banco</Text><Text style={styles.storageValue}>v{sqliteOverview.schemaVersion}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Sessões ECU abertas</Text><Text style={styles.storageValue}>{sqliteOverview.openSessions}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Amostras reais de PID</Text><Text style={styles.storageValue}>{sqliteOverview.recordedPidSamples}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Eventos DTC registrados</Text><Text style={styles.storageValue}>{sqliteOverview.recordedDtcEvents}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Testes de sensores</Text><Text style={styles.storageValue}>{sqliteOverview.recordedSensorTests}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Viagens reais</Text><Text style={styles.storageValue}>{sqliteOverview.recordedRealTrips}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>Achados diagnósticos</Text><Text style={styles.storageValue}>{sqliteOverview.recordedDiagnosticFindings}</Text></View>
                <View style={styles.storageRow}><Text style={styles.storageLabel}>PIDs aprendidos (reais)</Text><Text style={styles.storageValue}>{sqliteOverview.learnedPids}</Text></View>
              </>
            ) : <Text style={styles.note}>{sqliteError || 'Consultando o banco local…'}</Text>}
            <Text style={styles.note}>Contadores internos; simulação e histórico CarScanner não entram nas evidências reais.</Text>
          </View>
          <Text style={styles.sectionTitle}>USO DO ARMAZENAMENTO</Text>
          <View style={styles.storageCard}>
            {Object.entries(usageBreakdown).map(([directory, sizeMb]) => (
              <View key={directory} style={styles.storageRow}>
                <Text style={styles.storageLabel}>{directory}</Text>
                <Text style={styles.storageValue}>{sizeMb.toFixed(1)} MB</Text>
              </View>
            ))}
            <Text style={styles.note}>O estado interno JSON e os logs estruturados continuam sendo usados pelo app; os relatórios exportados ficam em TXT. A limpeza não apaga históricos TXT.</Text>
          </View>
          <TouchableOpacity style={styles.cleanButton} onPress={() => void handleClean()} disabled={!basePath || busy}>
            <Text style={styles.cleanButtonText}>{busy ? 'PROCESSANDO...' : 'LIMPAR LOGS INTERNOS ANTIGOS'}</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
      <BottomNavigation active="relatorios" />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#07111f' },
  content: { flexGrow: 1, width: '100%', alignItems: 'center', paddingVertical: 14, paddingBottom: 20 },
  frame: { width: '100%', alignSelf: 'center' },
  title: { color: '#f8fafc', fontSize: 22, fontWeight: '900', letterSpacing: 0.5, marginBottom: 5 },
  subtitle: { color: '#8da2bd', fontSize: 10, lineHeight: 15, marginBottom: 12 },
  statusCard: { borderRadius: 12, borderWidth: 1, padding: 12, marginBottom: 8 },
  statusOk: { backgroundColor: '#10261b', borderColor: '#28613e' },
  statusWarning: { backgroundColor: '#281f14', borderColor: '#8f6426' },
  statusCritical: { backgroundColor: '#28151c', borderColor: '#713043' },
  statusTitle: { color: '#e5edf7', fontSize: 11, fontWeight: '900' },
  statusCaption: { color: '#a3b4ca', fontSize: 9, lineHeight: 13, marginTop: 4 },
  message: { color: '#93c5fd', fontSize: 10, lineHeight: 15, marginVertical: 8 },
  sectionTitle: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 0.8, marginTop: 12, marginBottom: 7 },
  generateRow: { gap: 8 },
  generateRowLandscape: { flexDirection: 'row', alignItems: 'stretch' },
  generateButtonLandscape: { flex: 1, minWidth: 0 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 12, padding: 13, marginBottom: 7 },
  secondaryButton: { backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#34506f', padding: 13, marginBottom: 7 },
  buttonTitle: { color: '#f8fafc', fontSize: 10, fontWeight: '900' },
  buttonHint: { color: '#b6c7de', fontSize: 9, marginTop: 4 },
  reportCard: { backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#28415f', padding: 11, marginBottom: 8 },
  reportInfo: { flex: 1, minWidth: 0 },
  reportCategory: { color: '#7db3ff', fontSize: 8, fontWeight: '900', letterSpacing: 0.7 },
  reportName: { color: '#e5edf7', fontSize: 11, fontWeight: '800', marginTop: 3 },
  reportMeta: { color: '#7185a1', fontSize: 9, marginTop: 3 },
  reportActions: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 9 },
  smallButton: { backgroundColor: '#152a45', borderRadius: 8, paddingHorizontal: 10, paddingVertical: 8 },
  smallButtonText: { color: '#b6d5ff', fontSize: 8, fontWeight: '900' },
  empty: { color: '#9fb4cf', fontSize: 10, lineHeight: 15, padding: 12, backgroundColor: '#0e1b2d', borderRadius: 10 },
  previewCard: { marginTop: 12, backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#28415f', padding: 11 },
  previewPath: { color: '#93c5fd', fontSize: 8, marginBottom: 7 },
  previewNotice: { color: '#fbbf24', fontSize: 9, marginBottom: 7 },
  previewText: { color: '#e5edf7', fontSize: 9, lineHeight: 14, fontFamily: 'monospace' },
  storageCard: { backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#28415f', padding: 11 },
  storageRow: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 6, borderBottomWidth: 1, borderBottomColor: '#233a56' },
  storageLabel: { color: '#9fb4cf', fontSize: 10 },
  storageValue: { color: '#e5edf7', fontSize: 10, fontWeight: '800' },
  note: { color: '#7185a1', fontSize: 9, lineHeight: 14, marginTop: 8 },
  cleanButton: { backgroundColor: '#281f14', borderWidth: 1, borderColor: '#8f6426', borderRadius: 10, padding: 13, alignItems: 'center', marginTop: 8 },
  cleanButtonText: { color: '#fbbf24', fontSize: 9, fontWeight: '900' },
});
