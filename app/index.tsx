import { Link } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { AppState } from 'react-native';
import { SafeAreaView, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import * as FileSystem from 'expo-file-system';
import { INITIAL_DRIVE_CYCLES, getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveStatus, getAutoSaveState, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveTypes';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { bootstrapBluetooth, requestBluetoothEnable, subscribeBluetoothState } from '../src/obd/bluetoothManager';

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
  const [bluetoothState, setBluetoothState] = useState('BLUETOOTH DESLIGADO');
  const [bluetoothError, setBluetoothError] = useState('');

  useEffect(() => {
    let mounted = true;
    const initializeBluetooth = async () => {
      try {
        const state = await bootstrapBluetooth();
        if (mounted) setBluetoothState(state);
        if (state === 'BLUETOOTH DESLIGADO') setBluetoothError('Bluetooth necessário para diagnóstico do veículo.');
        if (state === 'PERMISSÃO BLUETOOTH NEGADA') setBluetoothError('Permissão Bluetooth negada.');
      } catch (cause) {
        if (mounted) { setBluetoothState('BLUETOOTH DESLIGADO'); setBluetoothError(cause instanceof Error ? cause.message : 'Falha ao iniciar Bluetooth'); }
      }
    };
    void initializeBluetooth();
    let subscription: { remove: () => void } | undefined;
    try {
      subscription = subscribeBluetoothState((enabled) => {
        if (!mounted) return;
        setBluetoothState(enabled ? 'BLUETOOTH LIGADO' : 'BLUETOOTH DESLIGADO');
        if (!enabled) setBluetoothError('Bluetooth necessário para diagnóstico do veículo.');
      });
    } catch {}
    const appStateSubscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') void initializeBluetooth();
    });
    async function restoreState() {
      const basePath = `${FileSystem.documentDirectory}MERIVA_SMART`;
      const restored = await initAutoSave(basePath);

      let loaded = restored.driveCycles;
      if (!loaded.length) {
        try {
          const content = await FileSystem.readAsStringAsync(`${basePath}/VIAGENS/index.json`, {
            encoding: FileSystem.EncodingType.UTF8,
          });
          const parsed = JSON.parse(content);
          loaded = Array.isArray(parsed?.cycles) ? parsed.cycles : [];
        } catch {
          loaded = [];
        }
        if (!loaded.length) loaded = INITIAL_DRIVE_CYCLES; // REFERÊNCIA Car Scanner — não é histórico real
        updateAutoSaveState((state) => {
          state.driveCycles = loaded;
        });
      }

      setCycles(loaded);
      setObd(restored.obd);
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }

    void restoreState();
    return () => { mounted = false; subscription?.remove(); appStateSubscription.remove(); };
  }, []);

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.card}>
          <Text style={styles.title}>MERIVA SMART</Text>
          <Text style={styles.subtitle}>DIAGNOSTIC</Text>
          <Text style={styles.sectionTitleDark}>STATUS</Text>
          <Text style={styles.statusLine}>BLUETOOTH: {bluetoothState}</Text>
          {bluetoothError ? <Text style={styles.autosaveError}>{bluetoothError}</Text> : null}
          {bluetoothState === 'BLUETOOTH DESLIGADO' ? <TouchableOpacity style={styles.button} onPress={async () => { const ok = await requestBluetoothEnable(); if (ok) { setBluetoothState('BLUETOOTH LIGADO'); setBluetoothError(''); } else setBluetoothError('Bluetooth continua desligado.'); }}><Text style={styles.buttonText}>ATIVAR BLUETOOTH</Text></TouchableOpacity> : null}
          <Text style={styles.statusLine}>OBD: {obd.connected ? 'CONECTADO' : 'DESCONECTADO'}</Text>
          <Text style={styles.statusLine}>ECU: {obd.ecuAddress ?? 'N/D'}</Text>
          <Text style={styles.statusLine}>PROTOCOLO: {obd.protocol ?? 'N/D'}</Text>
          <Text style={styles.sectionTitleDark}>SALVAMENTO</Text>
          <Text style={styles.statusLine}>AUTOMÁTICO: ATIVO</Text>
          <Text style={styles.statusLine}>ÚLTIMO SAVE: {formatTime(saveStatus.lastSavedAt)}</Text>
          {saveStatus.lastError ? (
            <Text style={styles.autosaveError}>FALHA NO AUTOSAVE: {saveStatus.lastError}</Text>
          ) : null}
          <Text style={styles.status}>{isHydrated ? 'ESTADO RESTAURADO' : 'CARREGANDO...'}</Text>
        </View>

        <View style={styles.summaryGrid}>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Ciclos</Text>
            <Text style={styles.metricValue}>{cycles.length}</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Distância</Text>
            <Text style={styles.metricValue}>{summary.totalDistanceKm.toFixed(2)} km</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Consumo</Text>
            <Text style={styles.metricValue}>{summary.avgConsumptionKml.toFixed(2)} km/L</Text>
          </View>
          <View style={styles.metricCard}>
            <Text style={styles.metricLabel}>Média</Text>
            <Text style={styles.metricValue}>{summary.avgSpeedKmh.toFixed(1)} km/h</Text>
          </View>
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>ÚLTIMO CICLO</Text>
          {summary.lastCycle ? (
            <>
              <Text style={styles.row}><Text style={styles.label}>Início:</Text> {summary.lastCycle.startedAt}</Text>
              <Text style={styles.row}><Text style={styles.label}>Fim:</Text> {summary.lastCycle.finishedAt}</Text>
              <Text style={styles.row}><Text style={styles.label}>Distância:</Text> {summary.lastCycle.distanceTotalKm.toFixed(2)} km</Text>
              <Text style={styles.row}><Text style={styles.label}>Consumo:</Text> {summary.lastCycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text>
              <View style={styles.sourceRow}>
                <Text style={styles.row}><Text style={styles.label}>Fonte:</Text> {summary.lastCycle.source}</Text>
                <Text style={summary.lastCycle.source === 'REAL_OBD' ? styles.sourceReal : styles.sourceRef}>
                  {summary.lastCycle.source === 'REAL_OBD' ? 'REAL' : 'REFERÊNCIA'}
                </Text>
              </View>
            </>
          ) : (
            <Text style={styles.empty}>Sem ciclos carregados.</Text>
          )}
        </View>

        <View style={styles.sectionCard}>
          <Text style={styles.sectionTitle}>HISTÓRICO</Text>
          {cycles.map((cycle) => (
            <View key={cycle.id} style={styles.historyItem}>
              <View style={styles.historyHeader}>
                <Text style={styles.historyDate}>{cycle.startedAt}</Text>
                <Text style={cycle.source === 'REAL_OBD' ? styles.sourceReal : styles.sourceRef}>
                  {cycle.source === 'REAL_OBD' ? 'REAL' : 'REFERÊNCIA'}
                </Text>
              </View>
              <Text style={styles.historyMeta}>{cycle.distanceTotalKm.toFixed(2)} km • {cycle.avgFuelConsumptionKml.toFixed(3)} km/L</Text>
            </View>
          ))}
        </View>

        <Link href="/laboratorio" asChild>
          <TouchableOpacity style={styles.button}><Text style={styles.buttonText}>LABORATÓRIO OBD</Text></TouchableOpacity>
        </Link>
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
  button: { backgroundColor: '#2563eb', padding: 16, borderRadius: 12, alignItems: 'center', marginTop: 8 },
  buttonText: { color: '#fff', fontWeight: '700' },
});