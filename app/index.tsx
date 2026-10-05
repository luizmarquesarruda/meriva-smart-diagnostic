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
import { connectPreferredElm, getSharedObdLastError, subscribeSharedObd } from '../src/obd/sharedConnection';

function formatDistance(km: number, unit: AppSettings['distanceUnit']): string {
  if (!Number.isFinite(km) || km < 0) return 'N/D';
  if (unit === 'MI') return `${(km * 0.621371).toFixed(2)} mi`;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [bluetoothSearching, setBluetoothSearching] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);

  useEffect(() => gpsTracker.subscribe(setGpsState), []);

  const syncLiveState = useCallback(() => {
    const state = getAutoSaveState();
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
      setIsHydrated(true);
    } catch {
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    void reloadStoredState();
  }, [reloadStoredState]);

  // Conecta automaticamente o ELM327 pareado ao abrir o aplicativo.
  // O endereço conhecido é tentado primeiro e a sessão só é aceita após
  // ATZ/ATSP0 + PID 010C responderem corretamente.
  useEffect(() => {
    if (!isHydrated || !settings) return;

    let cancelled = false;
    const unsubscribe = subscribeSharedObd((connection) => {
      if (cancelled || !connection) return;
      updateAutoSaveState((state) => {
        state.obd = {
          connected: true,
          adapterName: connection.device.name,
          protocol: connection.protocol ?? undefined,
          lastConnectedAt: new Date().toISOString(),
        };
      });
      setObd((current) => ({
        ...current,
        connected: true,
        adapterName: connection.device.name,
        protocol: connection.protocol ?? undefined,
        lastConnectedAt: new Date().toISOString(),
      }));
    });

    setBluetoothSearching(true);
    setBluetoothError(null);
    if (settings?.autoConnectObd === false) {
      setBluetoothSearching(false);
      return () => { cancelled = true; unsubscribe(); };
    }

    const elmSettings = settings;
    void connectPreferredElm(elmSettings.selectedAdapterAddress, {
      ioTimeoutMs: elmSettings.elmIoTimeoutMs,
      bluetoothConnectTimeoutMs: elmSettings.elmBluetoothTimeoutMs,
      commandDelayMs: elmSettings.elmCommandDelayMs,
      maxConnectionAttempts: elmSettings.elmMaxConnectionAttempts,
      noDataReconnectThreshold: elmSettings.elmNoDataReconnectThreshold,
      partialResponseAction: elmSettings.elmPartialResponseAction,
      forceInitialization: elmSettings.elmForceInitialization,
      adaptiveTiming: elmSettings.elmAdaptiveTiming,
      adaptiveTimeoutMinMs: elmSettings.elmAdaptiveTimeoutMinMs,
      adaptiveTimeoutMaxMs: elmSettings.elmAdaptiveTimeoutMaxMs,
    })
      .then(() => {
        setBluetoothSearching(false);
        setBluetoothError(null);
      })
      .catch((cause) => {
        setBluetoothSearching(true);
        const detail = cause instanceof Error ? cause.message : getSharedObdLastError() ?? String(cause ?? 'ERRO DESCONHECIDO');
        setBluetoothError(detail);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [isHydrated, settings]);

  useFocusEffect(
    useCallback(() => {
      void reloadStoredState();
    }, [reloadStoredState]),
  );

  const summary = useMemo(() => getDriveCycleSummary(cycles), [cycles]);
  const realConsumptionKml = summary.avgConsumptionKml > 0 ? summary.avgConsumptionKml : null;
  const distanceUnit = settings?.distanceUnit ?? 'KM';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.midHeader, { paddingHorizontal: layout.cardPadding }]}>
            <Text style={styles.midBrand}>CHEVROLET</Text>
            <Text style={styles.midModel}>MERIVA MAXX 1.4</Text>
            <Text style={styles.midStatus}>
              {obd.connected ? 'OBD • ONLINE' : bluetoothError ? 'BLUETOOTH • FALHA DE CONEXÃO' : bluetoothSearching ? 'BLUETOOTH • BUSCANDO ELM327' : 'OBD • AGUARDANDO'}
            </Text>
          </View>

          <View style={styles.heroCard}>
            <Text style={styles.heroLabel}>VEÍCULO</Text>
            <Text style={styles.heroValue}>MERIVA MAXX</Text>
            <Text style={styles.heroUnit}>1.4 8V • FLEX • 2011/2012 • 4 CILINDROS</Text>
            <Text style={styles.heroHelp}>Painel principal do veículo. Dados OBD, GPS e consumo aparecem somente quando forem reais e válidos.</Text>
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

          {bluetoothError ? <Text style={styles.error}>BLUETOOTH/ELM327: {bluetoothError}</Text> : null}
          {gpsState.error ? <Text style={styles.error}>GPS: {gpsState.error}</Text> : null}
          {saveStatus.lastError ? <Text style={styles.error}>AUTOSAVE: {saveStatus.lastError}</Text> : null}

          <View style={styles.bottomNav}>
            <Link href="/" asChild>
              <TouchableOpacity style={styles.bottomNavItem}>
                <Text style={styles.bottomNavIcon}>🚗</Text>
                <Text style={styles.bottomNavActive}>CARRO</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/bluetooth" asChild>
              <TouchableOpacity style={styles.bottomNavItem}>
                <Text style={styles.bottomNavIcon}>🔵</Text>
                <Text style={styles.bottomNavText}>BLUETOOTH</Text>
              </TouchableOpacity>
            </Link>
          </View>
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
  container: { flex: 1, backgroundColor: '#0b1220' },
  content: { flexGrow: 1, paddingVertical: 14, paddingBottom: 30 },
  screenFrame: { width: '100%' },
  midHeader: { backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#29415f', paddingVertical: 14, marginBottom: 10 },
  midBrand: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 2, textAlign: 'center' },
  midModel: { color: '#f8fafc', fontSize: 22, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 1 },
  midStatus: { color: '#9fb4cf', fontSize: 10, fontWeight: '900', letterSpacing: 1, textAlign: 'center', marginTop: 4 },
  heroCard: { backgroundColor: '#121f33', borderRadius: 16, borderWidth: 1, borderColor: '#28415f', paddingVertical: 20, paddingHorizontal: 14, alignItems: 'center', marginBottom: 10 },
  heroLabel: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 1.5 },
  heroValue: { color: '#f8fafc', fontSize: 38, lineHeight: 44, fontWeight: '900', fontVariant: ['tabular-nums'], marginTop: 3, letterSpacing: 1 },
  heroUnit: { color: '#9fb4cf', fontSize: 12, fontWeight: '800' },
  heroHelp: { color: '#7185a1', fontSize: 10, textAlign: 'center', marginTop: 7 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 },
  statusGridLandscape: { flexWrap: 'nowrap', gap: 8 },
  statusCard: { width: '48%', backgroundColor: '#111c2e', borderRadius: 12, borderWidth: 1, borderColor: '#243652', padding: 11, marginBottom: 8 },
  statusCardLandscape: { flex: 1, width: undefined },
  metricLabel: { color: '#7185a1', fontSize: 9, fontWeight: '900', letterSpacing: 0.7, marginBottom: 2 },
  metricValue: { color: '#e5edf7', fontWeight: '900', fontSize: 15 },
  metricDanger: { color: '#b91c1c', fontWeight: '900', fontSize: 15 },
  tripCard: { backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#243652', padding: 13, marginBottom: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 7 },
  sectionTitle: { color: '#f1f5f9', fontWeight: '900', fontSize: 13, letterSpacing: 0.5 },
  live: { color: '#4ade80', fontWeight: '900', fontSize: 9 },
  muted: { color: '#7185a1', fontWeight: '900', fontSize: 9 },
  tripGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between' },
  tripGridLandscape: { flexWrap: 'nowrap', gap: 12 },
  tripMetric: { width: '31%', minWidth: 90 },
  tripHelp: { color: '#64748b', fontSize: 10, marginTop: 5 },
  actionGrid: { gap: 7 },
  actionGridLandscape: { flexDirection: 'row' },
  actionButtonLandscape: { flex: 1 },
  primaryButton: { backgroundColor: '#2563eb', borderRadius: 12, padding: 14, alignItems: 'center' },
  buttonText: { color: '#fff', fontWeight: '900', fontSize: 11, letterSpacing: 0.3 },
  secondaryButton: { backgroundColor: '#111c2e', borderRadius: 12, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#34506f' },
  secondaryButtonText: { color: '#dbeafe', fontWeight: '900', fontSize: 11 },
  error: { color: '#fb7185', fontWeight: '800', fontSize: 10, marginTop: 8 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#111c2e', borderRadius: 14, borderWidth: 1, borderColor: '#29415f', marginTop: 12, padding: 5 },
  bottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  bottomNavIcon: { fontSize: 17, marginBottom: 2 },
  bottomNavActive: { color: '#7db3ff', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  bottomNavText: { color: '#9fb4cf', fontSize: 9, fontWeight: '900', letterSpacing: 0.6 },
  footerStatus: { color: '#60748f', textAlign: 'center', fontSize: 9, marginTop: 9 },
});
