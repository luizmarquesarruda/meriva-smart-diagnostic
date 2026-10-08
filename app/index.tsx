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
import { createLearningProfile, initializeCarScannerSeed, readLearningProfile } from '../src/database/learningProfile';
import { readAppSettings, type AppSettings } from '../src/database/appSettings';
import { connectPreferredElm, getSharedObdConnection, getSharedObdLastError, getSharedObdStatus, subscribeSharedObd } from '../src/obd/sharedConnection';
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
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const windowSize = useWindowDimensions();
  const layout = getMidLayout(windowSize);

  useEffect(() => gpsTracker.subscribe(setGpsState), []);
  useEffect(() => autoTripService.subscribe(setTripState), []);
  useEffect(() => subscribeSharedObd(() => setConnectionStatus(getSharedObdStatus())), []);

  const syncLiveState = useCallback(() => {
    const state = getAutoSaveState();
    const live = getSharedObdConnection();
    const liveConnected = Boolean(live?.ecuValidated);
    setDtcCount(state.dtcs.length);
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
      const live = getSharedObdConnection();
      setConnectionStatus(getSharedObdStatus());
      setObd({ ...restored.obd, connected: Boolean(live?.ecuValidated) });
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

  // Conecta automaticamente. O aplicativo escolhe o candidato entre os dispositivos
  // Classic pareados e só aceita um ELM após inicialização + resposta OBD válida.
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
  const availableConsumptionKml = tripState.averageConsumptionKml > 0 ? tripState.averageConsumptionKml : realConsumptionKml;
  const distanceUnit = settings?.distanceUnit ?? 'KM';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding, alignItems: 'center' }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.header}>
            <View><Text style={styles.brand}>MERIVA SMART</Text><Text style={styles.subtitle}>COCKPIT DE DIAGNÓSTICO</Text></View>
            <View style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionStatus.ecuConnected ? 'ECU' : connectionStatus.bluetoothConnected ? 'BLUETOOTH' : bluetoothSearching ? 'CONECTANDO' : 'OFFLINE'}</Text></View>
          </View>
          <View style={styles.heroCard}>
            <Text style={styles.heroEyebrow}>{connectionStatus.ecuConnected ? 'MOTOR • ECU CONECTADA' : 'ESTADO DO VEÍCULO'}</Text>
            <Text style={styles.heroValue}>{connectionStatus.ecuConnected && getAutoSaveState().lastReadings.find((item) => /rpm/i.test(item.name) && item.value != null) ? (Math.round(getAutoSaveState().lastReadings.find((item) => /rpm/i.test(item.name) && item.value != null)?.value ?? 0) + ' RPM') : getAutoSaveState().autonomy.estimatedRangeKm > 0 ? (getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km') : 'PRONTO'}</Text>
            <Text style={styles.heroState}>{connectionStatus.ecuConnected ? 'DADOS OBD EM TEMPO REAL' : 'CONECTE O ELM327 PARA INICIAR'}</Text>
            <View style={styles.metricRow}>
              <CockpitMetric label="VELOCIDADE" value={gpsState.currentSpeedKmh.toFixed(0) + ' km/h'} />
              <CockpitMetric label="CONSUMO" value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
              <CockpitMetric label="AUTONOMIA" value={getAutoSaveState().autonomy.estimatedRangeKm > 0 ? getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
            </View>
          </View>
          <View style={styles.healthCard}>
            <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>SAÚDE DO VEÍCULO</Text><Text style={styles.sectionHint}>{dtcCount > 0 ? 'Falhas requerem atenção' : 'Nenhuma falha ativa registrada'}</Text></View><Text style={dtcCount > 0 ? styles.danger : styles.ok}>{dtcCount > 0 ? (dtcCount + ' DTC') : 'NORMAL'}</Text></View>
            <Link href="/saude" asChild><TouchableOpacity style={styles.outlineButton}><Text style={styles.outlineText}>ABRIR CENTRAL DE SAÚDE →</Text></TouchableOpacity></Link>
          </View>
          <View style={styles.connectionCard}>
            <Text style={styles.sectionTitle}>CADEIA DE CONEXÃO</Text>
            <View style={styles.chain}><ChainStep label="BLUETOOTH" ok={connectionStatus.bluetoothConnected} /><Text style={styles.chainArrow}>›</Text><ChainStep label="ELM327" ok={Boolean(connectionStatus.bluetoothConnected && (obd.protocol || connectionStatus.ecuConnected))} /><Text style={styles.chainArrow}>›</Text><ChainStep label="ECU" ok={connectionStatus.ecuConnected} /></View>
          </View>
          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.primaryButton, layout.landscape && styles.actionButtonLandscape]}><Text style={styles.buttonText}>🔧 DIAGNÓSTICO</Text><Text style={styles.buttonSubtext}>SCAN • DTC • ECU</Text></TouchableOpacity></Link>
            <Link href="/dados" asChild><TouchableOpacity style={[styles.secondaryButton, layout.landscape && styles.actionButtonLandscape]}><Text style={styles.secondaryButtonText}>📊 DADOS EM TEMPO REAL</Text><Text style={styles.buttonSubtextDark}>PIDs • TENDÊNCIAS</Text></TouchableOpacity></Link>
          </View>
          <View style={styles.statusGrid}>
            <StatusCard label="GPS" value={gpsState.running ? 'ATIVO' : 'AGUARDANDO'} ok={gpsState.running} />
            <StatusCard label="FALHAS" value={dtcCount ? String(dtcCount) : 'OK'} danger={dtcCount > 0} ok={dtcCount === 0} />
            <StatusCard label="VIAGEM" value={formatDistance(gpsState.distanceKm, distanceUnit)} />
            <StatusCard label="AUTOSAVE" value={isHydrated ? 'ATIVO' : 'CARREGANDO'} ok={isHydrated} />
          </View>
          <Link href="/mais" asChild><TouchableOpacity style={styles.moreButton}><Text style={styles.moreIcon}>⋯</Text><View style={{ flex: 1 }}><Text style={styles.moreTitle}>MAIS RECURSOS</Text><Text style={styles.moreHint}>Veículo • Viagens • Aprendizado • Bluetooth • Arquivos</Text></View><Text style={styles.moreArrow}>›</Text></TouchableOpacity></Link>
          {bluetoothError ? <Text style={styles.error}>BLUETOOTH/ELM327: {bluetoothError}</Text> : null}{gpsState.error ? <Text style={styles.error}>GPS: {gpsState.error}</Text> : null}{saveStatus.lastError ? <Text style={styles.error}>AUTOSAVE: {saveStatus.lastError}</Text> : null}
          <View style={styles.bottomNav}><Link href="/" asChild><TouchableOpacity style={[styles.bottomNavItem, styles.bottomNavActive]}><Text style={styles.bottomNavIcon}>🚗</Text><Text style={styles.bottomNavActiveText}>CARRO</Text></TouchableOpacity></Link><Link href="/bluetooth" asChild><TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavIcon}>🔵</Text><Text style={styles.bottomNavText}>BLUETOOTH</Text></TouchableOpacity></Link></View>
          <Text style={styles.footerStatus}>{isHydrated ? 'DADOS SALVOS AUTOMATICAMENTE' : 'CARREGANDO DADOS...'}</Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function CockpitMetric({ label, value }: { label: string; value: string }) { return <View style={styles.cockpitMetric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }
function ChainStep({ label, ok }: { label: string; ok: boolean }) { return <View style={styles.chainStep}><View style={[styles.chainCircle, ok && styles.chainCircleOk]}><Text style={[styles.chainCircleText, ok && styles.chainCircleTextOk]}>{ok ? '✓' : '•'}</Text></View><Text style={styles.chainLabel}>{label}</Text></View>; }
function StatusCard({ label, value, danger = false, ok = false }: { label: string; value: string; danger?: boolean; ok?: boolean }) { return <View style={styles.statusCard}><Text style={styles.metricLabel}>{label}</Text><Text style={danger ? styles.danger : ok ? styles.ok : styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%'},
  header:{backgroundColor:'#0e1b2d',borderRadius:16,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},brand:{color:'#f8fafc',fontSize:18,fontWeight:'900',letterSpacing:1.2},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  connectionPill:{flexDirection:'row',alignItems:'center',gap:6,backgroundColor:'#091526',borderRadius:20,borderWidth:1,borderColor:'#29415f',paddingHorizontal:10,paddingVertical:7},dot:{width:8,height:8,borderRadius:4},dotOk:{backgroundColor:'#4ade80'},dotWarn:{backgroundColor:'#fbbf24'},dotDanger:{backgroundColor:'#fb7185'},connectionText:{color:'#dbeafe',fontSize:9,fontWeight:'900'},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:18,alignItems:'center',marginBottom:10},heroEyebrow:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1.4},heroValue:{color:'#f8fafc',fontSize:40,lineHeight:46,fontWeight:'900',marginTop:4,fontVariant:['tabular-nums']},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5},
  metricRow:{width:'100%',flexDirection:'row',gap:7,marginTop:14},cockpitMetric:{flex:1,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b',padding:10,alignItems:'center'},metricLabel:{color:'#7185a1',fontSize:8,fontWeight:'900',letterSpacing:.6},metricValue:{color:'#e5edf7',fontSize:14,fontWeight:'900',marginTop:3},
  healthCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{color:'#f1f5f9',fontWeight:'900',fontSize:12,letterSpacing:.6},sectionHint:{color:'#7185a1',fontSize:9,marginTop:3},ok:{color:'#4ade80',fontSize:11,fontWeight:'900'},danger:{color:'#fb7185',fontSize:11,fontWeight:'900'},outlineButton:{borderWidth:1,borderColor:'#315579',borderRadius:9,padding:10,alignItems:'center',marginTop:10},outlineText:{color:'#9fc5f7',fontSize:9,fontWeight:'900'},
  connectionCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},chain:{flexDirection:'row',alignItems:'center',marginTop:10},chainStep:{flex:1,alignItems:'center'},chainCircle:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#3b516b',backgroundColor:'#0a1727'},chainCircleOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},chainCircleText:{color:'#7185a1',fontSize:11,fontWeight:'900'},chainCircleTextOk:{color:'#4ade80'},chainLabel:{color:'#9fb4cf',fontSize:8,fontWeight:'900',marginTop:4},chainArrow:{color:'#526a86',fontSize:24,paddingHorizontal:4},
  actionGrid:{gap:8,marginBottom:10},actionGridLandscape:{flexDirection:'row'},actionButtonLandscape:{flex:1},primaryButton:{backgroundColor:'#2563eb',borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:11},buttonSubtext:{color:'#bfdbfe',fontWeight:'800',fontSize:8,marginTop:3},secondaryButton:{backgroundColor:'#0e1b2d',borderRadius:13,padding:13,alignItems:'center',borderWidth:1,borderColor:'#34506f'},secondaryButtonText:{color:'#dbeafe',fontWeight:'900',fontSize:11},buttonSubtextDark:{color:'#7185a1',fontWeight:'800',fontSize:8,marginTop:3},
  statusGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:2},statusCard:{width:'48%',backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:8},moreButton:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:13,marginTop:2},moreIcon:{color:'#7db3ff',fontSize:24,fontWeight:'900'},moreTitle:{color:'#e5edf7',fontSize:11,fontWeight:'900'},moreHint:{color:'#7185a1',fontSize:8,marginTop:3},moreArrow:{color:'#7db3ff',fontSize:24},
  error:{color:'#fb7185',fontWeight:'800',fontSize:10,marginTop:8},bottomNav:{flexDirection:'row',backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',marginTop:12,padding:5},bottomNavItem:{flex:1,alignItems:'center',paddingVertical:8,borderRadius:10},bottomNavActive:{backgroundColor:'#152a45'},bottomNavIcon:{fontSize:17,marginBottom:2},bottomNavActiveText:{color:'#7db3ff',fontSize:9,fontWeight:'900'},bottomNavText:{color:'#9fb4cf',fontSize:9,fontWeight:'900'},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
