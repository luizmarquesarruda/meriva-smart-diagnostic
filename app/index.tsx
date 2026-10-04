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
  const [dtcCount, setDtcCount] = useState(0);
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);
  useEffect(() => gpsTracker.subscribe(setGpsState), []);
  useEffect(() => {
    const syncFuelLevel = () => {
      const reading = getAutoSaveState().lastReadings.find((item) => item.pid === '012F');
      setFuelLevelPercent(
        reading?.value != null && reading.value >= 0 && reading.value <= 100 ? reading.value : null,
      );
    };
    syncFuelLevel();
    setDtcCount(getAutoSaveState().dtcs.length);
    const timer = setInterval(() => {
      syncFuelLevel();
      setDtcCount(getAutoSaveState().dtcs.length);
    }, 1000);
    const metricWidth = layout.landscape ? '23.5%' : '48%';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
        <View style={[styles.screenFrame, { width: '100%', maxWidth: layout.maxContentWidth }]}>
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
              {fuelLevelPercent == null ? 'Aguardando nível real da ECU (PID 012F).' : fuelLevelPercent.toFixed(1) + '% de combustível ECU • tanque de 56 L.'}
            </Text>
          </View>

          <View style={styles.statusGrid}>
            <View style={[styles.statusCard, { width: metricWidth }]}><Text style={styles.metricLabel}>OBD</Text><Text style={styles.metricValue}>{obd.connected ? 'ONLINE' : 'OFFLINE'}</Text></View>
            <View style={[styles.statusCard, { width: metricWidth }]}><Text style={styles.metricLabel}>GPS</Text><Text style={styles.metricValue}>{gpsState.running ? 'ATIVO' : 'AGUARDANDO'}</Text></View>
            <View style={[styles.statusCard, { width: metricWidth }]}><Text style={styles.metricLabel}>VIAGEM</Text><Text style={styles.metricValue}>{summary.lastRealCycle ? summary.lastRealCycle.avgFuelConsumptionKml.toFixed(1) + ' km/L' : 'N/D'}</Text></View>
            <View style={[styles.statusCard, { width: metricWidth }]}><Text style={styles.metricLabel}>FALHAS</Text><Text style={dtcCount ? styles.metricDanger : styles.metricValue}>{dtcCount || 'OK'}</Text></View>
          </View>

          <View style={styles.tripCard}>
            <View style={styles.cardHeaderRow}>
              <Text style={styles.sectionTitle}>VIAGEM ATUAL</Text>
              <Text style={gpsState.running ? styles.live : styles.muted}>{gpsState.running ? 'AUTOMÁTICA' : 'AGUARDANDO GPS'}</Text>
            </View>
            <View style={styles.tripGrid}>
              <View style={styles.tripMetric}><Text style={styles.metricLabel}>DISTÂNCIA</Text><Text style={styles.metricValue}>{formatDistanceForUnit(gpsState.distanceKm, settings?.distanceUnit ?? 'KM')}</Text></View>
              <View style={styles.tripMetric}><Text style={styles.metricLabel}>CONSUMO MÉDIO</Text><Text style={styles.metricValue}>{summary.avgConsumptionKml > 0 ? summary.avgConsumptionKml.toFixed(2) + ' km/L' : 'N/D'}</Text></View>
            </View>
            <Text style={styles.tripHelp}>Registro automático quando OBD + GPS válidos estão disponíveis.</Text>
          </View>

          <View style={[styles.actionGrid, { flexDirection: layout.landscape ? 'row' : 'column' }]}>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.primaryButton, layout.landscape && styles.actionGridButton]}><Text style={styles.buttonText}>DIAGNÓSTICO OBD</Text></TouchableOpacity></Link>
            <Link href="/armazenamento" asChild><TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionGridButton]}><Text style={styles.secondaryButtonText}>HISTÓRICO E DADOS</Text></TouchableOpacity></Link>
            <Link href="/configuracoes" asChild><TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionGridButton]}><Text style={styles.secondaryButtonText}>CONFIGURAÇÕES</Text></TouchableOpacity></Link>
          </View>

          {saveStatus.lastError ? <Text style={styles.error}>AUTOSAVE: {saveStatus.lastError}</Text> : null}
          <Text style={styles.footerStatus}>{isHydrated ? 'DADOS SALVOS AUTOMATICAMENTE' : 'CARREGANDO DADOS...'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#eef3fb' },
  content: { flexGrow: 1, paddingVertical: 14, paddingBottom: 28 },
  screenFrame: { width: '100%' },
  midHeader: { backgroundColor: '#d9d9d9', borderRadius: 6, borderWidth: 1, borderColor: '#a3a3a3', paddingVertical: 10, marginBottom: 10 },
  midBrand: { color: '#1557a6', fontSize: 11, fontWeight: '800', letterSpacing: 2, textAlign: 'center' },
  midModel: { color: '#1557a6', fontSize: 20, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 1 },
  midStatus: { color: '#1557a6', fontSize: 10, fontWeight: '800', letterSpacing: 1, textAlign: 'center', marginTop: 4 },
  heroCard: { backgroundColor: '#e6edf5', borderRadius: 8, borderWidth: 1, borderColor: '#9aa9b8', paddingVertical: 16, paddingHorizontal: 12, alignItems: 'center', marginBottom: 10 },
  heroLabel: { color: '#1557a6', fontSize: 12, fontWeight: '900', letterSpacing: 1.2 },
  heroValue: { color: '#0b4a91', fontSize: 46, lineHeight: 52, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 2 },
  heroUnit: { color: '#334155', fontSize: 13, fontWeight: '700' },
  heroHelp: { color: '#64748b', fontSize: 11, textAlign: 'center', marginTop: 7 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  statusCard: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d9e2', padding: 10, marginBottom: 8 },
  metricLabel: { color: '#64748b', fontSize: 10, fontWeight: '800', letterSpacing: 0.7, marginBottom: 3 },
  metricValue: { color: '#1f2937', fontWeight: '800', fontSize: 16 },
  metricDanger: { color: '#b91c1c', fontWeight: '900', fontSize: 16 },
  tripCard: { backgroundColor: '#fff', borderRadius: 8, borderWidth: 1, borderColor: '#d1d9e2', padding: 12, marginBottom: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 },
  sectionTitle: { color: '#1f2937', fontWeight: '900', fontSize: 14, letterSpacing: 0.5 },
  live: { color: '#15803d', fontWeight: '800', fontSize: 10 },
  muted: { color: '#64748b', fontWeight: '800', fontSize: 10 },
  tripGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  tripMetric: { width: '48%' },
  tripHelp: { color: '#64748b', fontSize: 11, marginTop: 8 },
  actionGrid: { gap: 8 },
  actionGridButton: { flex: 1 },
  primaryButton: { backgroundColor: '#1557a6', borderRadius: 8, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 12, letterSpacing: 0.3 },
  secondaryButton: { backgroundColor: '#fff', borderRadius: 8, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#8fa1b3' },
  secondaryButtonText: { color: '#1f2937', fontWeight: '800', fontSize: 12 },
  error: { color: '#b91c1c', fontWeight: '800', fontSize: 11, marginTop: 10 },
  footerStatus: { color: '#64748b', textAlign: 'center', fontSize: 10, marginTop: 10 },
});
