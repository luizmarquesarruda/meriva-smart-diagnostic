import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { gpsTracker, type GpsTripState } from '../src/gps';
import { ensureMerivaVehicleProfile } from '../src/database/vehicleConfig';
import { readAppSettings, type AppSettings } from '../src/database/appSettings';

function formatDistance(km: number): string {
  if (!Number.isFinite(km) || km < 0) return 'N/D';
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

function formatDistanceForUnit(km: number, unit: AppSettings['distanceUnit']): string {
  if (unit === 'MI') {
    if (!Number.isFinite(km) || km < 0) return 'N/D';
    return `${(km * 0.621371).toFixed(2)} mi`;
  }
  return formatDistance(km);
}

function formatTime(iso: string | null): string {
  if (!iso) return 'N/D';
  try {
    return new Date(iso).toLocaleTimeString('pt-BR');
  } catch {
    return 'N/D';
  }
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fuelLevelPercent, setFuelLevelPercent] = useState<number | null>(null);
  useEffect(() => gpsTracker.subscribe(setGpsState), []);
  useEffect(() => {
    const syncFuelLevel = () => {
      const reading = getAutoSaveState().lastReadings.find((item) => item.pid === '012F');
      setFuelLevelPercent(
        reading?.value != null && reading.value >= 0 && reading.value <= 100 ? reading.value : null,
      );
    };
    syncFuelLevel();
    const timer = setInterval(syncFuelLevel, 1000);
    return () => clearInterval(timer);
  }, []);

  const reloadStoredState = useCallback(async () => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    try {
      setSettings(await readAppSettings(basePath));
      const restored = await initAutoSave(basePath);
      await initializeDriveCycles(basePath);
      await ensureMerivaVehicleProfile(basePath);
      const storedCycles = await readDriveCycles(basePath);
      const loaded = restored.driveCycles.length ? restored.driveCycles : storedCycles;

      if (!restored.driveCycles.length && loaded.length) {
        updateAutoSaveState((state) => {
          state.driveCycles = loaded;
        });
      }

      setCycles(loaded);
      setObd(restored.obd);
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    } catch {
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    void reloadStoredState();
  }, [reloadStoredState]);

  useFocusEffect(
    useCallback(() => {
      void reloadStoredState();
    }, [reloadStoredState]),
  );

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);
  const realConsumptionKml = summary.avgConsumptionKml > 0 ? summary.avgConsumptionKml : null;
  const fuelLiters = fuelLevelPercent == null ? null : (56 * fuelLevelPercent) / 100;
  const autonomyKm = fuelLiters != null && realConsumptionKml != null
    ? fuelLiters * realConsumptionKml
    : null;

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>MERIVA SMART</Text>
          <Text style={styles.subtitle}>DIAGNOSTIC</Text>
          <Text style={styles.sectionTitleDark}>STATUS</Text>
          <Text style={styles.statusLine}>OBD: {obd.connected ? 'CONECTADO' : 'DESCONECTADO'}</Text>
          <Text style={styles.statusLine}>ECU: {obd.ecuAddress ?? 'N/D'}</Text>
          <Text style={styles.statusLine}>PROTOCOLO: {obd.protocol ?? 'N/D'}</Text>
          <Text style={styles.sectionTitleDark}>SALVAMENTO</Text>
          <Text style={styles.statusLine}>AUTOMÁTICO: ATIVO</Text>
          <Text style={styles.statusLine}>ÚLTIMO SAVE: {formatTime(saveStatus.lastSavedAt)}</Text>
          {saveStatus.lastError ? <Text style={styles.autosaveError}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text> : null}
          <Text style={styles.status}>{isHydrated ? 'ESTADO RESTAURADO' : 'CARREGANDO...'}</Text>
        </View>

        <View style={styles.gpsCard}>
          <View style={styles.gpsHeader}>
            <Text style={styles.sectionTitle}>GPS DO CELULAR</Text>
            <Text style={gpsState.running ? styles.gpsLive : styles.gpsOff}>
              {gpsState.running ? 'ATIVO AUTOMÁTICO' : 'AGUARDANDO GPS'}
            </Text>
          </View>
          <View style={styles.autonomyCard}>
            <Text style={styles.autonomyLabel}>AUTONOMIA</Text>
            <Text style={styles.autonomyValue}>{autonomyKm == null ? 'N/D' : Math.round(autonomyKm)}</Text>
            <Text style={styles.autonomyUnit}>km restantes</Text>
            <Text style={styles.autonomyHelp}>
              {fuelLevelPercent == null
                ? 'Aguardando nível de combustível real da ECU (PID 012F).'
                : `${fuelLevelPercent.toFixed(1)}% do nível de combustível ECU • ${fuelLiters?.toFixed(1)} L estimados de 56 L.`}
            </Text>
          </View>
          <View style={styles.gpsGrid}>
            <View style={styles.gpsMetric}><Text style={styles.metricLabel}>DISTÂNCIA</Text><Text style={styles.metricValue}>{formatDistanceForUnit(gpsState.distanceKm, settings?.distanceUnit ?? 'KM')}</Text></View>
            <View style={styles.gpsMetric}><Text style={styles.metricLabel}>PRECISÃO</Text><Text style={styles.metricValue}>{gpsState.lastAccuracyM == null ? 'N/D' : `${gpsState.lastAccuracyM.toFixed(0)} m`}</Text></View>
          </View>
          <Text style={styles.gpsHelp}>GPS inicia automaticamente. Velocidade continua sendo usada internamente para cálculos, mas não é mostrada na tela principal.</Text>
          <Text style={styles.fuelInfo}>COMBUSTÍVEL: {settings?.fuelType === 'GASOLINA' ? 'GASOLINA' : 'ETANOL'} • nível real da ECU via PID 012F quando a ECU suportar.</Text>
          <Text style={styles.fuelInfo}>Autonomia = nível de combustível ECU × tanque de 56 L × consumo real aprendido. Sem dado real, o app mostra N/D.</Text>
          {gpsState.error ? <Text style={styles.gpsError}>{gpsState.error}</Text> : null}
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.metricCard}><Text style={styles.metricLabel}>CICLOS REAIS</Text><Text style={styles.metricValue}>{summary.realCycleCount}</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricLabel}>DISTÂNCIA REAL</Text><Text style={styles.metricValue}>{formatDistanceForUnit(summary.totalDistanceKm, settings?.distanceUnit ?? 'KM')}</Text></View>
          <View style={styles.metricCard}><Text style={styles.metricLabel}>CONSUMO REAL</Text><Text style={styles.metricValue}>{summary.avgConsumptionKml.toFixed(2)} km/L</Text></View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ÚLTIMO CICLO</Text>
          {summary.lastRealCycle ? <><Text style={styles.row}><Text style={styles.label}>Início:</Text> {summary.lastRealCycle.startedAt}</Text><Text style={styles.row}><Text style={styles.label}>Fim:</Text> {summary.lastRealCycle.finishedAt}</Text><Text style={styles.row}><Text style={styles.label}>Distância:</Text> {formatDistanceForUnit(summary.lastRealCycle.distanceTotalKm, settings?.distanceUnit ?? 'KM')}</Text><Text style={styles.row}><Text style={styles.label}>Consumo:</Text> {summary.lastRealCycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text><View style={styles.sourceRow}><Text style={styles.row}><Text style={styles.label}>Fonte:</Text> {summary.lastRealCycle.source}</Text><Text style={summary.lastRealCycle.source === 'REAL_OBD' ? styles.sourceReal : styles.sourceRef}>{summary.lastRealCycle.source === 'REAL_OBD' ? 'REAL' : 'REFERÊNCIA'}</Text></View></> : <Text style={styles.empty}>Sem ciclos carregados.</Text>}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>HISTÓRICO</Text><Text style={styles.historyNote}>Referências Car Scanner: {summary.referenceCycleCount}. Elas não entram nas métricas reais.</Text>
          {cycles.map((cycle) => <View key={cycle.id} style={styles.historyItem}><View style={styles.historyHeader}><Text style={styles.historyDate}>{cycle.startedAt}</Text><Text style={cycle.source === 'REAL_OBD' ? styles.sourceReal : styles.sourceRef}>{cycle.source === 'REAL_OBD' ? 'REAL' : 'REFERÊNCIA'}</Text></View><Text style={styles.historyMeta}>{formatDistanceForUnit(cycle.distanceTotalKm, settings?.distanceUnit ?? 'KM')} • {cycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text></View>)}
        </View>

        <Link href="/laboratorio" asChild><TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LABORATÓRIO OBD</Text></TouchableOpacity></Link>
        <Link href="/armazenamento" asChild><TouchableOpacity style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>ARMAZENAMENTO</Text></TouchableOpacity></Link>
        <Link href="/configuracoes" asChild><TouchableOpacity style={styles.secondaryButton}><Text style={styles.secondaryButtonText}>CONFIGURAÇÕES</Text></TouchableOpacity></Link>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef3fb' },
  content: { flexGrow: 1, padding: 20, paddingBottom: 40 },
  card: { backgroundColor: '#1f2937', borderRadius: 18, padding: 24, marginBottom: 18 },
  title: { color: '#dbeafe', fontSize: 28, fontWeight: '700' },
  subtitle: { color: '#60a5fa', fontSize: 24, fontWeight: '700', marginBottom: 16 },
  sectionTitleDark: { color: '#93c5fd', fontSize: 12, fontWeight: '700', letterSpacing: 1, marginTop: 8, marginBottom: 4 },
  statusLine: { color: '#e5e7eb', marginTop: 2 },
  autosaveError: { color: '#fca5a5', marginTop: 6, fontWeight: '600' },
  status: { color: '#9ca3af', marginTop: 14, fontWeight: '700' },
  gpsCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 18 },
  gpsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  gpsGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  gpsMetric: { width: '48%', marginBottom: 10 },
  autonomyCard: { backgroundColor: '#eff6ff', borderRadius: 12, padding: 18, marginBottom: 14, alignItems: 'center', borderWidth: 1, borderColor: '#bfdbfe' },
  autonomyLabel: { color: '#1d4ed8', fontSize: 13, fontWeight: '800', letterSpacing: 1 },
  autonomyValue: { color: '#1e40af', fontWeight: '800', fontSize: 38, marginTop: 2 },
  autonomyUnit: { color: '#475569', fontSize: 13, fontWeight: '600' },
  autonomyHelp: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 8 },
  gpsLive: { color: '#16a34a', fontWeight: '800' },
  gpsOff: { color: '#64748b', fontWeight: '800' },
  gpsHelp: { color: '#64748b', fontSize: 12, marginBottom: 10 },
  fuelInfo: { color: '#475569', fontSize: 12, marginBottom: 6 },
  gpsError: { color: '#b91c1c', fontWeight: '700', marginBottom: 10 },
  summaryGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 18 },
  metricCard: { width: '48%', backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 10 },
  metricLabel: { color: '#6b7280', fontSize: 12, fontWeight: '600', marginBottom: 6 },
  metricValue: { color: '#1f2937', fontWeight: '700', fontSize: 18 },
  sectionCard: { backgroundColor: '#fff', borderRadius: 12, padding: 14, marginBottom: 18 },
  sectionTitle: { color: '#1f2937', fontWeight: '700', fontSize: 16, marginBottom: 10 },
  row: { color: '#374151', marginBottom: 6 },
  label: { fontWeight: '700' },
  sourceRow: { flexDirection: 'row', alignItems: 'center' },
  sourceReal: { color: '#16a34a', fontWeight: '700', marginLeft: 8 },
  sourceRef: { color: '#d97706', fontWeight: '700', marginLeft: 8 },
  empty: { color: '#6b7280' },
  historyItem: { paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#e5e7eb' },
  historyHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  historyDate: { color: '#1f2937', fontWeight: '600' },
  historyMeta: { color: '#6b7280', marginTop: 2 },
  historyNote: { color: '#64748b', fontSize: 12, marginBottom: 8 },
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
  secondaryButton: { backgroundColor: '#fff', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8, borderWidth: 1, borderColor: '#94a3b8' },
  secondaryButtonText: { color: '#1f2937', fontWeight: '700' },
});