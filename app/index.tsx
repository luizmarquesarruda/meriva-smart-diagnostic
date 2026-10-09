import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { gpsTracker, type GpsTripState } from '../src/gps';
import { ensureMerivaVehicleProfile } from '../src/database/vehicleConfig';
import { createLearningProfile, initializeCarScannerSeed, readLearningProfile } from '../src/database/learningProfile';
import { readAppSettings, type AppSettings } from '../src/database/appSettings';
import { connectPreferredElm, getSharedObdConnection, getSharedObdLastError, getSharedObdStatus, subscribeSharedObd, subscribeSharedObdStatus } from '../src/obd/sharedConnection';
import { autoTripService, type AutoTripServiceState } from '../src/trip/autoTripService';

function formatDistance(km: number, unit: AppSettings['distanceUnit']): string {
  if (!Number.isFinite(km) || km < 0) return 'N/D';
  if (unit === 'MI') return `${(km * 0.621371).toFixed(2)} mi`;
  if (km < 1) return `${Math.round(km * 1000)} m`;
  return `${km.toFixed(2)} km`;
}

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [obd, setObd] = useState<ObdConnectionState>({ connected: false });
  const [connectionStatus, setConnectionStatus] = useState(getSharedObdStatus());
  const [bluetoothSearching, setBluetoothSearching] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null, obdSessionActive: false });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const layout = useMidLayout();

  useEffect(() => gpsTracker.subscribe(setGpsState), []);
  useEffect(() => autoTripService.subscribe(setTripState), []);
  useEffect(() => {
    const unsubscribeConnection = subscribeSharedObd(() => setConnectionStatus(getSharedObdStatus()));
    const unsubscribeHealth = subscribeSharedObdStatus((status) => setConnectionStatus(status));
    return () => { unsubscribeConnection(); unsubscribeHealth(); };
  }, []);

  const syncLiveState = useCallback(() => {
    const state = getAutoSaveState();
    const live = getSharedObdConnection();
    const liveConnected = getSharedObdStatus().ecuConnected;
    setDtcCount(state.dtcs.filter((item) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status)).length);
    setConnectionStatus(getSharedObdStatus());
    setObd({
      ...state.obd,
      connected: liveConnected,
      adapterName: live?.device.name ?? state.obd.adapterName,
    });
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
      const learningProfile = await readLearningProfile(basePath);
      if (!learningProfile) await createLearningProfile(basePath, '2026-09-24T14:48:00.000Z');
      await initializeCarScannerSeed(basePath);
      const storedCycles = await readDriveCycles(basePath);
      const loaded = restored.driveCycles.length ? restored.driveCycles : storedCycles;

      if (!restored.driveCycles.length && loaded.length) {
        updateAutoSaveState((state) => {
          state.driveCycles = loaded;
        });
      }

      setSettings(nextSettings);
      setCycles(loaded);
      setConnectionStatus(getSharedObdStatus());
      setObd({ ...restored.obd, connected: getSharedObdStatus().ecuConnected });
      setSaveStatus(getAutoSaveStatus());
      setDtcCount(restored.dtcs.filter((item) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status)).length);
      setIsHydrated(true);
    } catch {
      setSaveStatus(getAutoSaveStatus());
      setIsHydrated(true);
    }
  }, []);

  useEffect(() => {
    void reloadStoredState();
  }, [reloadStoredState]);

  // Conecta automaticamente. O aplicativo escolhe o candidato entre os dispositivos
  // Classic pareados e só aceita um ELM após inicialização + resposta OBD válida.
  useEffect(() => {
    if (!isHydrated || !settings) return;

    let cancelled = false;
    const unsubscribe = subscribeSharedObd((connection) => {
      if (cancelled || !connection) return;
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
    void connectPreferredElm(settings.selectedAdapterAddress, {
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
        setBluetoothSearching(false);
        updateAutoSaveState((state) => {
          state.obd = { ...state.obd, connected: false };
        });
        const detail = cause instanceof Error ? cause.message : getSharedObdLastError() ?? String(cause ?? 'ERRO DESCONHECIDO');
        setBluetoothError(detail);
        setObd((current) => ({ ...current, connected: false }));
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
  const historicalConsumptionKml = realConsumptionKml ?? (tripState.averageConsumptionKml > 0 ? tripState.averageConsumptionKml : null);
  const historicalConsumptionSource = realConsumptionKml != null ? 'REAL_OBD' : tripState.averageConsumptionKml > 0 ? 'CARSCANNER_BASELINE' : 'SEM DADOS';
  const distanceUnit = settings?.distanceUnit ?? 'KM';
  const liveReadings = getAutoSaveState().lastReadings;
  const getFreshRealPid = (pid: string) => {
    const reading = liveReadings
      .filter((item) => item.pid === pid && item.source === 'REAL' && item.status === 'RESPONDEU' && item.value != null)
      .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
    if (!reading) return null;
    const timestamp = Date.parse(reading.timestamp);
    const ageMs = Date.now() - timestamp;
    return Number.isFinite(timestamp) && ageMs >= 0 && ageMs <= 10_000 ? reading : null;
  };
  const liveRpm = getFreshRealPid('010C');
  const liveSpeed = getFreshRealPid('010D');

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}
        showsHorizontalScrollIndicator={false}
        showsVerticalScrollIndicator={false}
        bounces={false}
      >
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
            <View style={styles.headerTitle}>
              <Text style={styles.brand} numberOfLines={1}>MERIVA SMART</Text>
              <Text style={styles.subtitle} numberOfLines={1}>COCKPIT DE DIAGNÓSTICO</Text>
            </View>
          </View>
          <View style={styles.connectionSegments}>
            <View style={[styles.connectionSegment, connectionStatus.bluetoothConnected ? styles.segmentOk : bluetoothError ? styles.segmentCritical : bluetoothSearching ? styles.segmentWarn : styles.segmentIdle]}>
              <Text style={styles.segmentLabel}>LINK BT</Text>
              <Text style={styles.segmentValue}>{connectionStatus.bluetoothConnected ? 'CONECTADO' : bluetoothSearching ? 'CONECTANDO' : 'OFFLINE'}</Text>
            </View>
            <View style={[styles.connectionSegment, connectionStatus.bluetoothConnected && (obd.protocol || connectionStatus.ecuConnected) ? styles.segmentOk : connectionStatus.bluetoothConnected ? styles.segmentWarn : styles.segmentIdle]}>
              <Text style={styles.segmentLabel}>ELM327</Text>
              <Text style={styles.segmentValue}>{connectionStatus.bluetoothConnected && (obd.protocol || connectionStatus.ecuConnected) ? 'DETECTADO' : connectionStatus.bluetoothConnected ? 'AGUARDANDO' : 'SEM LINK'}</Text>
            </View>
            <View style={[styles.connectionSegment, connectionStatus.ecuConnected ? styles.segmentOk : connectionStatus.ecuResponseState === 'NO_RESPONSE' ? styles.segmentCritical : connectionStatus.ecuResponseState === 'RECOVERING' ? styles.segmentWarn : styles.segmentIdle]}>
              <Text style={styles.segmentLabel}>ECU / K-LINE</Text>
              <Text style={styles.segmentValue}>{connectionStatus.ecuConnected ? 'RESPONDENDO' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'SEM RESPOSTA' : 'AGUARDANDO'}</Text>
            </View>
          </View>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'ADAPTADOR OK • ECU SEM RESPOSTA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO PROTOCOLO ECU' : connectionStatus.ecuConnected && liveRpm ? 'RPM REAL • ECU RESPONDENDO' : connectionStatus.ecuConnected ? 'ECU CONECTADA • AGUARDANDO RPM' : 'ESTADO DO VEÍCULO'}</Text>
            <Text style={styles.heroValue}>{connectionStatus.ecuConnected && liveRpm ? Math.round(liveRpm.value ?? 0) + ' RPM' : connectionStatus.ecuResponseState === 'NO_RESPONSE' ? '— RPM' : 'AGUARDANDO'}</Text>
            <Text style={styles.heroState}>{connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'POLLING PAUSADO • RECUPERAÇÃO AUTOMÁTICA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'REINICIALIZANDO PROTOCOLO' : liveRpm ? 'PID 010C • RESPOSTA REAL RECENTE' : connectionStatus.ecuConnected ? 'AGUARDANDO LEITURA RECENTE' : 'CONECTE O ELM327 PARA INICIAR'}</Text>
            <View style={styles.metricRow}>
              <CockpitMetric label="VELOCIDADE OBD" value={liveSpeed ? Math.round(liveSpeed.value ?? 0) + ' km/h' : 'AGUARDANDO'} />
              <CockpitMetric label="AUTONOMIA ESTIMADA" value={getAutoSaveState().autonomy.estimatedRangeKm > 0 ? getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
            </View>
          </View>
          <View style={styles.healthCard}>
            <Text style={styles.sectionTitle}>CONSUMO — FONTES SEPARADAS</Text>
            <Text style={styles.sectionHint}>Instantâneo: {tripState.instantaneousConsumptionKml != null ? tripState.instantaneousConsumptionKml.toFixed(2) + ' km/L' : 'SEM DADOS'} • {tripState.instantaneousConsumptionSource}</Text>
            <Text style={styles.sectionHint}>Viagem atual: {tripState.consumptionKml != null ? tripState.consumptionKml.toFixed(2) + ' km/L' : 'SEM DADOS'} • {tripState.tripConsumptionSource}</Text>
            <Text style={styles.sectionHint}>Média histórica: {historicalConsumptionKml != null ? historicalConsumptionKml.toFixed(2) + ' km/L' : 'SEM DADOS'} • {historicalConsumptionSource}</Text>
          </View>
          <View style={styles.healthCard}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>SAÚDE DO VEÍCULO</Text><Text style={styles.sectionHint}>{dtcCount > 0 ? 'Falhas requerem atenção' : 'Nenhuma falha ativa registrada'}</Text></View><Text style={dtcCount > 0 ? styles.danger : styles.ok}>{dtcCount > 0 ? (dtcCount + ' DTC') : 'NORMAL'}</Text></View>
            <Link href="/saude" asChild><TouchableOpacity style={styles.outlineButton}><Text style={styles.outlineText}>ABRIR CENTRAL DE SAÚDE →</Text></TouchableOpacity></Link>
          </View>
          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.primaryButton, layout.landscape && styles.actionButtonLandscape]}><Text style={styles.buttonText} numberOfLines={1}>🔧 DIAGNÓSTICO</Text><Text style={styles.buttonSubtext}>SCAN • DTC • ECU</Text></TouchableOpacity></Link>
            <Link href="/dados" asChild><TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionButtonLandscape]}><Text style={styles.secondaryButtonText} numberOfLines={2}>📊 DADOS EM TEMPO REAL</Text><Text style={styles.buttonSubtextDark}>PIDs • TENDÊNCIAS</Text></TouchableOpacity></Link>
          </View>
          <View style={[styles.statusGrid, layout.landscape && styles.statusGridLandscape]}>
            <StatusCard landscape={layout.landscape} label="GPS" value={gpsState.running ? 'ATIVO' : 'AGUARDANDO'} ok={gpsState.running} />
            <StatusCard landscape={layout.landscape} label="FALHAS" value={dtcCount ? String(dtcCount) : 'OK'} danger={dtcCount > 0} ok={dtcCount === 0} />
            <StatusCard landscape={layout.landscape} label="VIAGEM" value={formatDistance(gpsState.distanceKm, distanceUnit)} />
            <StatusCard landscape={layout.landscape} label="AUTOSAVE" value={!isHydrated ? 'CARREGANDO' : saveStatus.obdSessionActive ? 'GRAVANDO ECU' : 'AGUARDANDO ECU'} ok={isHydrated && saveStatus.obdSessionActive} />
          </View>
          <Link href="/mais" asChild><TouchableOpacity style={styles.moreButton}><Text style={styles.moreIcon}>⋯</Text><View style={styles.moreBody}><Text style={styles.moreTitle}>MAIS RECURSOS</Text><Text style={styles.moreHint}>Veículo • Viagens • Aprendizado • Bluetooth • Arquivos</Text></View><Text style={styles.moreArrow}>›</Text></TouchableOpacity></Link>
          {bluetoothError ? <Text style={styles.error}>BLUETOOTH/ELM327: {bluetoothError}</Text> : null}{gpsState.error ? <Text style={styles.error}>GPS: {gpsState.error}</Text> : null}{saveStatus.lastError ? <Text style={styles.error}>AUTOSAVE: {saveStatus.lastError}</Text> : null}
          <View style={styles.bottomNav}><Link href="/" asChild><TouchableOpacity style={[styles.bottomNavItem, styles.bottomNavActive]}><Text style={styles.bottomNavIcon}>🚗</Text><Text style={styles.bottomNavActiveText}>CARRO</Text></TouchableOpacity></Link><Link href="/bluetooth" asChild><TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavIcon}>🔵</Text><Text style={styles.bottomNavText}>BLUETOOTH</Text></TouchableOpacity></Link></View>
          <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO DADOS...' : saveStatus.obdSessionActive ? 'SESSÃO ECU SALVA AUTOMATICAMENTE' : 'AUTOSAVE AGUARDANDO ECU'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CockpitMetric({ label, value }: { label: string; value: string }) {
  const macro = label === 'VELOCIDADE OBD';
  return (
    <View style={styles.cockpitMetric}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, macro && styles.metricValueMacro]}>{value}</Text>
    </View>
  );
}
function StatusCard({ label, value, danger = false, ok = false, landscape = false }: { label: string; value: string; danger?: boolean; ok?: boolean; landscape?: boolean }) { return <View style={[styles.statusCard, landscape && styles.statusCardLandscape]}><Text style={styles.metricLabel}>{label}</Text><Text style={danger ? styles.danger : ok ? styles.ok : styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: '#0A0A0C' },
  scroll: { flex: 1 },
  content: { flexGrow: 1, width: '100%', paddingVertical: 12, paddingBottom: 28 },
  screenFrame: { width: '100%', alignSelf: 'center' },
  header: { backgroundColor: '#111115', borderRadius: 16, borderWidth: 1, borderColor: '#2A2A31', padding: 14, marginBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'flex-start', gap: 10 },
  headerLandscape: { paddingVertical: 12 },
  headerTitle: { flex: 1, minWidth: 0 },
  brand: { color: '#F9FAFB', fontSize: 18, fontWeight: '900', letterSpacing: 1.2 },
  subtitle: { color: '#0EA5E9', fontSize: 9, fontWeight: '900', letterSpacing: 1, marginTop: 3 },
  connectionSegments: { flexDirection: 'row', gap: 6, marginBottom: 10 },
  connectionSegment: { flex: 1, minWidth: 0, borderRadius: 11, borderWidth: 1, paddingHorizontal: 8, paddingVertical: 10 },
  segmentLabel: { color: '#9CA3AF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5 },
  segmentValue: { color: '#F3F4F6', fontSize: 9, fontWeight: '900', marginTop: 4 },
  segmentOk: { backgroundColor: '#09231C', borderColor: '#10B981' },
  segmentWarn: { backgroundColor: '#2C210B', borderColor: '#F59E0B' },
  segmentCritical: { backgroundColor: '#2C1012', borderColor: '#EF4444' },
  segmentIdle: { backgroundColor: '#141418', borderColor: '#303039' },
  heroCard: { backgroundColor: '#111115', borderRadius: 18, borderWidth: 1, borderColor: '#303039', padding: 18, alignItems: 'center', marginBottom: 10 },
  heroEyebrow: { color: '#0EA5E9', fontSize: 9, fontWeight: '900', letterSpacing: 1.2, textAlign: 'center' },
  heroValue: { color: '#F9FAFB', fontSize: 42, lineHeight: 48, fontWeight: '900', marginTop: 4, fontVariant: ['tabular-nums'] },
  heroState: { color: '#9CA3AF', fontSize: 9, fontWeight: '800', letterSpacing: 0.4, textAlign: 'center' },
  metricRow: { width: '100%', flexDirection: 'row', gap: 8, marginTop: 14 },
  cockpitMetric: { flex: 1, backgroundColor: '#09090B', borderRadius: 11, borderWidth: 1, borderColor: '#292930', padding: 11, alignItems: 'center', justifyContent: 'center' },
  metricLabel: { color: '#9CA3AF', fontSize: 8, fontWeight: '900', letterSpacing: 0.5, textAlign: 'center' },
  metricValue: { color: '#E5E7EB', fontSize: 14, fontWeight: '900', marginTop: 4, textAlign: 'center', fontVariant: ['tabular-nums'] },
  metricValueMacro: { color: '#F9FAFB', fontSize: 22, lineHeight: 26 },
  healthCard: { backgroundColor: '#111115', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A31', padding: 13, marginBottom: 10 },
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: 8 },
  sectionTitle: { color: '#F3F4F6', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  sectionHint: { color: '#9CA3AF', fontSize: 9, marginTop: 4, lineHeight: 14 },
  ok: { color: '#10B981', fontSize: 11, fontWeight: '900' },
  danger: { color: '#EF4444', fontSize: 11, fontWeight: '900' },
  outlineButton: { borderWidth: 1, borderColor: '#0EA5E9', borderRadius: 9, padding: 10, alignItems: 'center', marginTop: 10 },
  outlineText: { color: '#7DD3FC', fontSize: 9, fontWeight: '900' },
  actionGrid: { gap: 8, marginBottom: 10 },
  actionGridLandscape: { flexDirection: 'row' },
  actionButtonLandscape: { flex: 1, minWidth: 0 },
  primaryButton: { backgroundColor: '#0284C7', borderRadius: 13, padding: 14, alignItems: 'center' },
  buttonText: { color: '#FFFFFF', fontWeight: '900', fontSize: 11 },
  buttonSubtext: { color: '#E0F2FE', fontWeight: '800', fontSize: 8, marginTop: 3 },
  secondaryButton: { backgroundColor: '#15151A', borderRadius: 13, padding: 13, alignItems: 'center', borderWidth: 1, borderColor: '#33333D' },
  secondaryButtonText: { color: '#E5E7EB', fontWeight: '900', fontSize: 11 },
  buttonSubtextDark: { color: '#9CA3AF', fontWeight: '800', fontSize: 8, marginTop: 3 },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 2 },
  statusGridLandscape: { flexWrap: 'nowrap', gap: 8 },
  statusCardLandscape: { width: 'auto', flex: 1 },
  statusCard: { width: '48%', minWidth: 0, backgroundColor: '#111115', borderRadius: 12, borderWidth: 1, borderColor: '#2A2A31', padding: 11, marginBottom: 8 },
  moreButton: { flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#111115', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A31', padding: 13, marginTop: 2 },
  moreIcon: { color: '#0EA5E9', fontSize: 24, fontWeight: '900' },
  moreBody: { flex: 1, minWidth: 0 },
  moreTitle: { color: '#E5E7EB', fontSize: 11, fontWeight: '900' },
  moreHint: { color: '#9CA3AF', fontSize: 8, marginTop: 3, flexShrink: 1 },
  moreArrow: { color: '#0EA5E9', fontSize: 24 },
  error: { color: '#EF4444', fontWeight: '800', fontSize: 10, marginTop: 8 },
  bottomNav: { flexDirection: 'row', backgroundColor: '#111115', borderRadius: 14, borderWidth: 1, borderColor: '#2A2A31', marginTop: 12, padding: 5 },
  bottomNavItem: { flex: 1, alignItems: 'center', paddingVertical: 8, borderRadius: 10 },
  bottomNavActive: { backgroundColor: '#082F49' },
  bottomNavIcon: { fontSize: 17, marginBottom: 2 },
  bottomNavActiveText: { color: '#7DD3FC', fontSize: 9, fontWeight: '900' },
  bottomNavText: { color: '#9CA3AF', fontSize: 9, fontWeight: '900' },
  footerStatus: { color: '#71717A', textAlign: 'center', fontSize: 9, marginTop: 9 },
});
