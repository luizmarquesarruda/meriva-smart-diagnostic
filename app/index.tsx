import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { gpsTracker, hasReliableGpsFix, type GpsTripState } from '../src/gps';
import { DEFAULT_SCREEN_PREFERENCES, loadScreenPreferences, type ScreenPreferences } from '../src/ui/screenPreferences';

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try { return new Date(iso).toLocaleTimeString('pt-BR'); } catch { return 'N/D'; }
}

function formatDistance(distanceKm: number): string {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return '0 m';
  if (distanceKm < 1) return `${Math.round(distanceKm * 1000)} m`;
  return `${distanceKm.toFixed(2)} km`;
}

function statusColor(ok: boolean): string {
  return ok ? '#16a34a' : '#64748b';
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [screenPrefs, setScreenPrefs] = useState<ScreenPreferences>(DEFAULT_SCREEN_PREFERENCES);

  useEffect(() => gpsTracker.subscribe(setGpsState), []);

  const reloadStoredState = useCallback(async () => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    try {
      const restored = await initAutoSave(basePath);
      await initializeDriveCycles(basePath);
      const storedCycles = await readDriveCycles(basePath);
      const loaded = restored.driveCycles.length ? restored.driveCycles : storedCycles;
      if (!restored.driveCycles.length && loaded.length) {
        updateAutoSaveState((state) => { state.driveCycles = loaded; });
      }
      setCycles(loaded);
      setObd(restored.obd);
      setScreenPrefs(await loadScreenPreferences(basePath));
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    } catch {
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => { void reloadStoredState(); }, [reloadStoredState]);
  useFocusEffect(useCallback(() => { void reloadStoredState(); }, [reloadStoredState]));

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);
  const gpsReady = hasReliableGpsFix(gpsState);
  const gpsWaitingForFix = gpsState.running && gpsState.permissionGranted && !gpsReady;
  const obdReady = obd.connected;
  const hasRealCycle = Boolean(summary.lastRealCycle);
  const distanceLabel = formatDistance(gpsState.distanceKm);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.header}>
          <View>
            <Text style={styles.brand}>MERIVA SMART</Text>
            <Text style={styles.vehicle}>MAXX 1.4 8V</Text>
          </View>
          <View style={styles.headerState}>
            <Text style={styles.headerStateLabel}>ESTADO</Text>
            <Text style={styles.headerStateValue}>{obdReady ? 'OBD OK' : 'OBD OFF'}</Text>
          </View>
        </View>

        <View style={styles.statusBar}>
          <View style={styles.statusItem}>
            <View style={[styles.dot, { backgroundColor: statusColor(gpsReady) }]} />
            <Text style={styles.statusText}>GPS {gpsReady ? 'FIX OK' : 'AGUARDANDO'}</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.dot, { backgroundColor: statusColor(obdReady) }]} />
            <Text style={styles.statusText}>OBD {obdReady ? 'CONECTADO' : 'DESCONECTADO'}</Text>
          </View>
          <View style={styles.statusItem}>
            <View style={[styles.dot, { backgroundColor: statusColor(!saveStatus.lastError) }]} />
            <Text style={styles.statusText}>AUTO SAVE</Text>
          </View>
        </View>

        <View style={styles.speedPanel}>
          <Text style={styles.eyebrow}>VELOCIDADE REAL DO CELULAR</Text>
          <View style={styles.speedRow}>
            <Text style={styles.speedValue}>{gpsReady ? gpsState.currentSpeedKmh.toFixed(0) : '--'}</Text>
            <Text style={styles.speedUnit}>km/h</Text>
          </View>
          <Text style={styles.gpsHint}>
            {gpsState.error
              ? gpsState.error
              : gpsReady
                ? `Precisão ${gpsState.lastAccuracyM == null ? 'N/D' : `${gpsState.lastAccuracyM.toFixed(0)} m`} • atualização recente`
                : gpsWaitingForFix
                  ? 'Aguardando uma posição GPS confiável. Velocidade e distância ficam bloqueadas.'
                  : 'GPS não está disponível. Nenhuma velocidade é inventada.'}
          </Text>
        </View>

        <View style={styles.tripRow}>
          <View style={styles.tripBlock}>
            <Text style={styles.metricLabel}>DISTÂNCIA</Text>
            <Text style={styles.metricValue}>{distanceLabel}</Text>
            <Text style={styles.metricHint}>viagem atual</Text>
          </View>
          <View style={styles.tripBlock}>
            <Text style={styles.metricLabel}>MÁXIMA</Text>
            <Text style={styles.metricValue}>{gpsReady ? `${gpsState.maxSpeedKmh.toFixed(0)} km/h` : '--'}</Text>
            <Text style={styles.metricHint}>GPS confiável</Text>
          </View>
        </View>

        <View style={styles.healthSection}>
          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>SAÚDE DO VEÍCULO</Text>
            <Text style={obdReady ? styles.goodText : styles.waitText}>{obdReady ? 'ONLINE' : 'AGUARDANDO OBD'}</Text>
          </View>
          <View style={styles.healthRow}>
            <View>
              <Text style={styles.healthLabel}>ECU</Text>
              <Text style={styles.healthValue}>{obd.ecuAddress ?? 'N/D'}</Text>
            </View>
            <View>
              <Text style={styles.healthLabel}>PROTOCOLO</Text>
              <Text style={styles.healthValue}>{obd.protocol ?? 'N/D'}</Text>
            </View>
          </View>
          <Text style={styles.healthHint}>
            {obdReady ? 'OBD conectado. Consulte dados reais da ECU no Laboratório.' : 'Conecte um ELM327 Bluetooth Classic para liberar dados da ECU.'}
          </Text>
        </View>

        {hasRealCycle ? (
          <View style={styles.realDataSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>ÚLTIMO CICLO REAL</Text>
              <Text style={styles.goodText}>REAL</Text>
            </View>
            <View style={styles.realGrid}>
              <View><Text style={styles.metricLabel}>DISTÂNCIA</Text><Text style={styles.smallValue}>{summary.lastRealCycle!.distanceTotalKm.toFixed(2)} km</Text></View>
              <View><Text style={styles.metricLabel}>CONSUMO</Text><Text style={styles.smallValue}>{summary.lastRealCycle!.avgFuelConsumptionKml.toFixed(2)} km/L</Text></View>
            </View>
          </View>
        ) : (
          <View style={styles.noticeSection}>
            <Text style={styles.noticeTitle}>PRONTO PARA A PRIMEIRA VIAGEM</Text>
            <Text style={styles.noticeText}>O painel não usa dados de referência como se fossem dados atuais do carro.</Text>
          </View>
        )}

        <Link href="/laboratorio" asChild>
          <TouchableOpacity style={styles.primaryButton}>
            <Text style={styles.primaryButtonText}>ABRIR LABORATÓRIO OBD</Text>
          </TouchableOpacity>
        </Link>

        <View style={styles.secondaryActions}>
          {screenPrefs.armazenamento && (
            <Link href="/armazenamento" asChild>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>ARMAZENAMENTO</Text>
              </TouchableOpacity>
            </Link>
          )}
          {screenPrefs.configuracoes && (
            <Link href="/configuracoes" asChild>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>CONFIGURAÇÕES</Text>
              </TouchableOpacity>
            </Link>
          )}
        </View>

        <Text style={styles.footer}>{isHydrated ? `Autosave ativo • último save ${formatTime(saveStatus.lastSavedAt)}` : 'Carregando estado salvo...'}</Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#f4f7fb' },
  content: { flexGrow: 1, padding: 18, paddingBottom: 32 },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  brand: { color: '#1d4ed8', fontSize: 25, fontWeight: '800', letterSpacing: 0.4 },
  vehicle: { color: '#475569', fontSize: 14, fontWeight: '700', marginTop: 2 },
  headerState: { alignItems: 'flex-end' },
  headerStateLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '800', letterSpacing: 1 },
  headerStateValue: { color: '#1e293b', fontSize: 13, fontWeight: '800', marginTop: 2 },
  statusBar: { backgroundColor: '#e8eef8', borderRadius: 12, padding: 11, flexDirection: 'row', justifyContent: 'space-between', marginBottom: 14 },
  statusItem: { flexDirection: 'row', alignItems: 'center' },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 5 },
  statusText: { color: '#475569', fontSize: 10, fontWeight: '800' },
  speedPanel: { backgroundColor: '#fff', borderRadius: 18, padding: 20, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  eyebrow: { color: '#64748b', fontSize: 11, fontWeight: '800', letterSpacing: 0.7 },
  speedRow: { flexDirection: 'row', alignItems: 'baseline', marginTop: 4 },
  speedValue: { color: '#0f172a', fontSize: 64, lineHeight: 72, fontWeight: '800', letterSpacing: -2 },
  speedUnit: { color: '#2563eb', fontSize: 20, fontWeight: '800', marginLeft: 8 },
  gpsHint: { color: '#64748b', fontSize: 12, lineHeight: 17, marginTop: 3 },
  tripRow: { flexDirection: 'row', gap: 10, marginBottom: 12 },
  tripBlock: { flex: 1, backgroundColor: '#fff', borderRadius: 14, padding: 16, borderWidth: 1, borderColor: '#e2e8f0' },
  metricLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.5 },
  metricValue: { color: '#0f172a', fontSize: 21, fontWeight: '800', marginTop: 5 },
  metricHint: { color: '#94a3b8', fontSize: 11, marginTop: 2 },
  healthSection: { backgroundColor: '#fff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#e2e8f0' },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  sectionTitle: { color: '#1e293b', fontSize: 13, fontWeight: '800', letterSpacing: 0.4 },
  goodText: { color: '#15803d', fontSize: 11, fontWeight: '800' },
  waitText: { color: '#64748b', fontSize: 11, fontWeight: '800' },
  healthRow: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  healthLabel: { color: '#94a3b8', fontSize: 10, fontWeight: '800' },
  healthValue: { color: '#334155', fontSize: 13, fontWeight: '700', marginTop: 2 },
  healthHint: { color: '#64748b', fontSize: 12, lineHeight: 17 },
  realDataSection: { backgroundColor: '#ecfdf5', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#bbf7d0' },
  realGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  smallValue: { color: '#166534', fontSize: 17, fontWeight: '800', marginTop: 4 },
  noticeSection: { backgroundColor: '#eff6ff', borderRadius: 14, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: '#bfdbfe' },
  noticeTitle: { color: '#1e40af', fontSize: 12, fontWeight: '800', marginBottom: 4 },
  noticeText: { color: '#475569', fontSize: 12, lineHeight: 17 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 14, minHeight: 54, alignItems: 'center', justifyContent: 'center', marginTop: 4, marginBottom: 10 },
  primaryButtonText: { color: '#fff', fontSize: 14, fontWeight: '800', letterSpacing: 0.2 },
  secondaryActions: { flexDirection: 'row', gap: 10 },
  secondaryButton: { flex: 1, backgroundColor: '#fff', borderRadius: 12, minHeight: 48, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd5e1' },
  secondaryButtonText: { color: '#334155', fontSize: 11, fontWeight: '800' },
  footer: { color: '#94a3b8', fontSize: 10, textAlign: 'center', marginTop: 14 },
});
