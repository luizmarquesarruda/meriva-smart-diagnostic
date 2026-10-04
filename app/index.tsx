import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { getMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { gpsTracker, type GpsTripState } from '../src/gps';
import { ensureMerivaVehicleProfile } from '../src/database/vehicleConfig';
import { readAppSettings, type AppSettings } from '../src/database/appSettings';
import { MERIVA_MANUAL } from '../src/database/merivaManual';

function formatDistance(km: number, unit: AppSettings['distanceUnit']): string {
  if (!Number.isFinite(km) || km < 0) return 'N/D';
  if (unit === 'MI') return `${(km * 0.621371).toFixed(2)} mi`;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [fuelLevelPercent, setFuelLevelPercent] = useState<number | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);

  useEffect(() => gpsTracker.subscribe(setGpsState), []);

  const syncLiveState = useCallback(() => {
    const state = getAutoSaveState();
    const reading = state.obd.connected ? state.lastReadings.find((item) => item.pid === '012F') : undefined;
    setFuelLevelPercent(reading?.value != null && reading.value >= 0 && reading.value <= 100 ? reading.value : null);
    setDtcCount(state.dtcs.length);
    setObd(state.obd);
    setSaveStatus(getAutoSaveStatus());
  }, []);

  useEffect(() => {
    syncLiveState();
    const timer = setInterval(syncLiveState, 1000);
    return () => clearInterval(timer);
  }, [syncLiveState]);

  const reloadStoredState = useCallback(async () => {
    const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
    try {
      const nextSettings = await readAppSettings(basePath);
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

      setSettings(nextSettings);
      setCycles(loaded);
      setObd(restored.obd);
      setSaveStatus(getAutoSaveStatus());
      setDtcCount(restored.dtcs.length);
      const reading = restored.obd.connected ? restored.lastReadings.find((item) => item.pid === '012F') : undefined;
      setFuelLevelPercent(reading?.value != null && reading.value >= 0 && reading.value <= 100 ? reading.value : null);
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
  const fuelLiters = fuelLevelPercent == null ? null : (MERIVA_MANUAL.capacities.fuelTankL * fuelLevelPercent) / 100;
  const autonomyKm = obd.connected && fuelLiters != null && realConsumptionKml != null ? fuelLiters * realConsumptionKml : null;
  const distanceUnit = settings?.distanceUnit ?? 'KM';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.midHeader, { paddingHorizontal: layout.cardPadding }]}>
            <Text style={styles.midBrand}>CHEVROLET</Text>
            <Text style={styles.midModel}>MERIVA MAXX 1.4</Text>
            <Text style={styles.midStatus}>{obd.connected ? 'OBD • ONLINE' : 'OBD • AGUARDANDO'}</Text>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>AUTONOMIA ESTIMADA</Text>
            <Text style={styles.heroValue}>{autonomyKm == null ? 'N/D' : Math.round(autonomyKm)}</Text>
            <Text style={styles.heroUnit}>km restantes</Text>
            <Text style={styles.heroHelp}>
              {fuelLevelPercent == null ? 'Aguardando nível real da ECU (PID 012F).' : `${fuelLevelPercent.toFixed(1)}% informado pela ECU • tanque de ${MERIVA_MANUAL.capacities.fuelTankL} L.`}
            </Text>
          </View>

          <View style={[styles.statusGrid, layout.landscape && styles.statusGridLandscape]}>
            <StatusCard label="OBD" value={obd.connected ? 'ONLINE' : 'AGUARDANDO'} landscape={layout.landscape} />
            <StatusCard label="GPS" value={gpsState.running ? 'ATIVO' : 'AGUARDANDO'} landscape={layout.landscape} />
            <StatusCard label="CONSUMO" value={realConsumptionKml == null ? 'N/D' : `${realConsumptionKml.toFixed(1)} km/L`} landscape={layout.landscape} />
            <StatusCard label="FALHAS" value={dtcCount ? String(dtcCount) : 'OK'} danger={dtcCount > 0} landscape={layout.landscape} />
          </View>

          <View style={styles.tripCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>VIAGEM ATUAL</Text>
              <Text style={gpsState.running ? styles.live : styles.muted}>{gpsState.running ? 'AUTOMÁTICA' : 'AGUARDANDO GPS'}</Text>
            </View>
            <View style={[styles.tripGrid, layout.landscape && styles.tripGridLandscape]}>
              <Metric label="DISTÂNCIA" value={formatDistance(gpsState.distanceKm, distanceUnit)} />
              <Metric label="ÚLTIMO CONSUMO" value={summary.lastRealCycle ? `${summary.lastRealCycle.avgFuelConsumptionKml.toFixed(2)} km/L` : 'N/D'} />
              <Metric label="PRECISÃO GPS" value={gpsState.lastAccuracyM == null ? 'N/D' : `${gpsState.lastAccuracyM.toFixed(0)} m`} />
            </View>
            <Text style={styles.tripHelp}>Registro automático. Nenhum botão de iniciar é necessário.</Text>
          </View>

          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/laboratorio" asChild>
              <TouchableOpacity style={[styles.primaryButton, layout.landscape && styles.actionButtonLandscape]}>
                <Text style={styles.buttonText}>DIAGNÓSTICO OBD</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/armazenamento" asChild>
              <TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionButtonLandscape]}>
                <Text style={styles.secondaryButtonText}>HISTÓRICO E DADOS</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/configuracoes" asChild>
              <TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionButtonLandscape]}>
                <Text style={styles.secondaryButtonText}>CONFIGURAÇÕES</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {gpsState.error ? <Text style={styles.error}>GPS: {gpsState.error}</Text> : null}
          {saveStatus.lastError ? <Text style={styles.error}>AUTOSAVE: {saveStatus.lastError}</Text> : null}
          <Text style={styles.footerStatus}>{isHydrated ? 'DADOS SALVOS AUTOMATICAMENTE' : 'CARREGANDO DADOS...'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function StatusCard({ label, value, danger = false, landscape = false }: { label: string; value: string; danger?: boolean; landscape?: boolean }) {
  return (
    <View style={[styles.statusCard, landscape && styles.statusCardLandscape]}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={danger ? styles.metricDanger : styles.metricValue}>{value}</Text>
    </View>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.tripMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={styles.metricValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef3fb' },
  content: { flexGrow: 1, paddingVertical: 12, paddingBottom: 24 },
  screenFrame: { width: '100%' },
  midHeader: { backgroundColor: '#d9d9d9', borderRadius: 5, borderWidth: 1, borderColor: '#9fa6ad', paddingVertical: 10, marginBottom: 8 },
  midBrand: { color: '#1557a6', fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  midModel: { color: '#1557a6', fontSize: 20, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 1 },
  midStatus: { color: '#1557a6', fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 3 },
  heroCard: { backgroundColor: '#e6edf5', borderRadius: 6, borderWidth: 1, borderColor: '#9aa9b8', paddingVertical: 14, paddingHorizontal: 12, alignItems: 'center', marginBottom: 8 },
  heroLabel: { color: '#1557a6', fontSize: 11, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#0b4a91', fontSize: 46, lineHeight: 52, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 1 },
  heroUnit: { color: '#334155', fontSize: 12, fontWeight: '800' },
  heroHelp: { color: '#64748b', fontSize: 10, textAlign: 'center', marginTop: 6 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 },
  statusGridLandscape: { flexWrap: 'nowrap', gap: 8 },
  statusCard: { width: '48%', backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#d1d9e2', padding: 9, marginBottom: 8 },
  statusCardLandscape: { flex: 1, width: undefined },
  metricLabel: { color: '#64748b', fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginBottom: 2 },
  metricValue: { color: '#1f2937', fontWeight: '900', fontSize: 15 },
  metricDanger: { color: '#b91c1c', fontWeight: '900', fontSize: 15 },
  tripCard: { backgroundColor: '#fff', borderRadius: 6, borderWidth: 1, borderColor: '#d1d9e2', padding: 11, marginBottom: 8 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  sectionTitle: { color: '#1f2937', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  live: { color: '#15803d', fontWeight: '900', fontSize: 9 },
  muted: { color: '#64748b', fontWeight: '900', fontSize: 9 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tripGridLandscape: { flexWrap: 'nowrap', gap: 12 },
  tripMetric: { width: '31%', minWidth: 90 },
  tripHelp: { color: '#64748b', fontSize: 10, marginTop: 5 },
  actionGrid: { gap: 7 },
  actionGridLandscape: { flexDirection: 'row' },
  actionButtonLandscape: { flex: 1 },
  primaryButton: { backgroundColor: '#1557a6', borderRadius: 6, padding: 13, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },
  secondaryButton: { backgroundColor: '#fff', borderRadius: 6, padding: 12, alignItems: 'center', borderWidth: 1, borderColor: '#8fa1b3' },
  secondaryButtonText: { color: '#1f2937', fontWeight: '900', fontSize: 11 },
  error: { color: '#b91c1c', fontWeight: '800', fontSize: 10, marginTop: 7 },
  footerStatus: { color: '#64748b', textAlign: 'center', fontSize: 9, marginTop: 7 },
});
