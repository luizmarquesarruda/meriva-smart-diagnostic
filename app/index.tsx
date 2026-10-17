import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Animated, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [, setObd] = useState<ObdConnectionState>({ connected: false });
  const [connectionStatus, setConnectionStatus] = useState(getSharedObdStatus());
  const [bluetoothSearching, setBluetoothSearching] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null, obdSessionActive: false });
  const [isHydrated, setIsHydrated] = useState(false);
  const [gpsState, setGpsState] = useState<GpsTripState>(gpsTracker.getState());
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const [activeHeroMetric, setActiveHeroMetric] = useState(0);
  const heroOpacity = useState(() => new Animated.Value(1))[0];
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
  const availableConsumptionKml = tripState.instantaneousConsumptionKml
    ?? (tripState.consumptionKml != null && tripState.consumptionKml > 0
      ? tripState.consumptionKml
      : tripState.averageConsumptionKml > 0 ? tripState.averageConsumptionKml : realConsumptionKml);
  const consumptionLabel = tripState.instantaneousConsumptionKml != null
    ? tripState.instantaneousConsumptionSource === 'MEASURED_015E' ? 'CONSUMO INSTANTÂNEO OBD' : 'INSTANTÂNEO ESTIMADO'
    : tripState.consumptionKml != null && tripState.consumptionKml > 0 ? 'MÉDIA DA VIAGEM' : 'MÉDIA HISTÓRICA';
  const liveReadings = getAutoSaveState().lastReadings;
  const freshRealReading = (matches: (item: (typeof liveReadings)[number]) => boolean) => liveReadings.find((item) => {
    if (!matches(item) || item.source !== 'REAL' || item.value == null || !Number.isFinite(item.value)) return false;
    const timestampMs = Date.parse(item.timestamp);
    const ageMs = Date.now() - timestampMs;
    return connectionStatus.ecuConnected && Number.isFinite(timestampMs) && ageMs >= 0 && ageMs <= 30_000;
  });
  const rpmReading = freshRealReading((item) => item.pid === '010C' || /rpm|rotação/i.test(item.name));
  const rpmValue = rpmReading?.value ?? null;
  const coolantReading = freshRealReading((item) => item.pid === '0105' || /coolant|arrefecimento|temperatura.*motor/i.test(item.name));
  const coolantValue = coolantReading?.value ?? null;
  const voltageReading = freshRealReading((item) => item.pid === '0142' || /module.*voltage|voltagem|tensão.*módulo/i.test(item.name));
  const voltageValue = voltageReading?.value ?? null;
  const throttleReading = freshRealReading((item) => item.pid === '0111' || /throttle|borboleta/i.test(item.name));
  const throttleValue = throttleReading?.value ?? null;
  const allHeroMetrics = [
    { id: 'SPEED', label: 'VELOCIDADE GPS', value: gpsState.running ? String(Math.round(gpsState.currentSpeedKmh)) : 'N/D', unit: gpsState.running ? 'km/h' : '', hint: gpsState.running ? 'SINAL GPS ATIVO' : 'AGUARDANDO GPS', tone: 'normal' },
    { id: 'TEMPERATURE', label: 'TEMPERATURA DO MOTOR', value: coolantValue != null ? String(Math.round(coolantValue)) : 'N/D', unit: coolantValue != null ? '°C' : '', hint: coolantValue != null ? 'LEITURA REAL • PID 0105' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0105' : 'ECU DESCONECTADA', tone: coolantValue != null && coolantValue >= 115 ? 'danger' : coolantValue != null && coolantValue >= 110 ? 'warning' : 'normal' },
    { id: 'VOLTAGE', label: 'VOLTAGEM DO SISTEMA', value: voltageValue != null ? voltageValue.toFixed(1) : 'N/D', unit: voltageValue != null ? 'V' : '', hint: voltageValue != null ? 'LEITURA REAL • PID 0142' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0142' : 'ECU DESCONECTADA', tone: 'normal' },
    { id: 'THROTTLE', label: 'POSIÇÃO DA BORBOLETA', value: throttleValue != null ? throttleValue.toFixed(1) : 'N/D', unit: throttleValue != null ? '%' : '', hint: throttleValue != null ? 'LEITURA REAL • PID 0111' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0111' : 'ECU DESCONECTADA', tone: 'normal' },
    { id: 'RPM', label: 'ROTAÇÃO DO MOTOR', value: rpmValue != null ? String(Math.round(rpmValue)) : 'N/D', unit: rpmValue != null ? 'RPM' : '', hint: rpmValue != null ? 'LEITURA REAL • PID 010C' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 010C' : 'ECU DESCONECTADA', tone: 'normal' },
  ];
  const heroMetrics = allHeroMetrics.filter((metric) => metric.id !== 'SPEED' || settings?.showSpeedMetric === true || settings?.homePrimaryMetric === 'SPEED');
  const configuredMetricIndex = Math.max(0, heroMetrics.findIndex((metric) => metric.id === (settings?.homePrimaryMetric ?? 'TEMPERATURE')));
  const safeActiveHeroMetric = Math.min(activeHeroMetric, Math.max(0, heroMetrics.length - 1));

  useEffect(() => {
    setActiveHeroMetric(configuredMetricIndex);
  }, [configuredMetricIndex]);

  useEffect(() => {
    if (!settings?.homeAutoRotate || heroMetrics.length < 2) return;
    const timer = setInterval(
      () => setActiveHeroMetric((current) => (current + 1) % heroMetrics.length),
      10_000,
    );
    return () => clearInterval(timer);
  }, [settings?.homeAutoRotate, heroMetrics.length]);

  useEffect(() => {
    if (!settings?.animationsEnabled) {
      heroOpacity.setValue(1);
      return;
    }
    heroOpacity.setValue(0.72);
    Animated.timing(heroOpacity, { toValue: 1, duration: 180, useNativeDriver: true }).start();
  }, [activeHeroMetric, settings?.animationsEnabled, heroOpacity]);

  const selectedHeroMetric = heroMetrics[safeActiveHeroMetric] ?? heroMetrics[0];
  const coolantStatus = coolantValue != null && coolantValue >= 115
    ? 'TEMPERATURA ALTA'
    : coolantValue != null && coolantValue >= 110
      ? 'ATENÇÃO'
      : coolantValue != null ? 'LEITURA REAL • PID 0105' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0105' : 'ECU DESCONECTADA';

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
            <View style={styles.headerTitle}>
              <Text style={styles.brand} numberOfLines={1}>MERIVA SMART</Text>
              <Text style={styles.subtitle} numberOfLines={1}>COCKPIT DE DIAGNÓSTICO</Text>
            </View>
            <Link href="/bluetooth" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir conexão Bluetooth e estado da ECU" style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'ECU SEM RESPOSTA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : connectionStatus.ecuConnected ? 'ECU' : connectionStatus.bluetoothConnected ? 'BLUETOOTH' : bluetoothSearching ? 'CONECTANDO' : 'OFFLINE'}</Text></TouchableOpacity></Link>
          </View>
          <View style={[styles.heroCard, layout.landscape && styles.heroCardLandscape]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedHeroMetric.label + '. Toque para trocar o indicador'}
              onPress={() => setActiveHeroMetric((current) => (current + 1) % Math.max(1, heroMetrics.length))}
              activeOpacity={0.82}
              style={[styles.heroReadout, { opacity: heroOpacity }]}
            >
              <Text style={styles.heroEyebrow}>{selectedHeroMetric.label}</Text>
              <View style={styles.heroNumberRow}>
                <Text style={[styles.heroValue, settings?.largeText && styles.heroValueLarge, layout.landscape && styles.heroValueLandscape, selectedHeroMetric.tone === 'danger' && styles.danger, selectedHeroMetric.tone === 'warning' && styles.heroWarning]}>{selectedHeroMetric.value}</Text>
                {!!selectedHeroMetric.unit && <Text style={styles.heroUnit}>{selectedHeroMetric.unit}</Text>}
              </View>
              <Text style={styles.heroState}>{selectedHeroMetric.hint}</Text>
              <Text style={[styles.heroSwitchHint, settings?.largeText && styles.heroSwitchHintLarge]}>{safeActiveHeroMetric + 1}/{heroMetrics.length}  •  TOQUE PARA TROCAR{settings?.homeAutoRotate ? ' • 10 S' : ''}</Text>
            </TouchableOpacity>
            <View style={[styles.metricRow, layout.landscape && styles.metricRowLandscape]}>
              <CockpitMetric compact={layout.landscape} label={consumptionLabel} value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
              <CockpitMetric compact={layout.landscape} label="AUTONOMIA" value={getAutoSaveState().autonomy.estimatedRangeKm > 0 ? getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
              <CockpitMetric compact={layout.landscape} label="FALHAS ATIVAS" value={dtcCount > 0 ? String(dtcCount) + ' DTC' : 'NORMAL'} />
            </View>
            <View style={[styles.coolantCard, layout.landscape && styles.coolantCardLandscape]}>
              <View style={styles.coolantCopy}>
                <Text style={styles.coolantLabel}>🌡️ LÍQUIDO DE ARREFECIMENTO</Text>
                <Text style={styles.coolantStatus}>{coolantStatus}</Text>
              </View>
              <Text style={[styles.coolantValue, coolantValue != null && coolantValue >= 115 ? styles.danger : coolantValue != null && coolantValue >= 110 ? styles.coolantWarning : styles.coolantOk]}>
                {coolantValue != null ? `${Math.round(coolantValue)} °C` : 'N/D'}
              </Text>
            </View>
          </View>
          {!layout.landscape && (
            <View style={styles.healthCard}>
              <View style={styles.sectionHeader}><View><Text style={styles.sectionTitle}>SAÚDE DO VEÍCULO</Text><Text style={styles.sectionHint}>{dtcCount > 0 ? 'Falhas requerem atenção' : 'Nenhuma falha ativa registrada'}</Text></View><Text style={dtcCount > 0 ? styles.danger : styles.ok}>{dtcCount > 0 ? (dtcCount + ' DTC') : 'NORMAL'}</Text></View>
            </View>
          )}
          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/mais" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Abrir todos os recursos" style={[styles.secondaryButton, styles.resourceButton, layout.landscape && styles.resourceButtonLandscape]}><Text style={styles.secondaryButtonText} numberOfLines={1}>☷ TODOS OS RECURSOS</Text></TouchableOpacity></Link>
          </View>
          <View style={[styles.bottomNav, layout.landscape && styles.bottomNavLandscape]}>
            <Link href="/" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Painel principal" style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]}><Text style={[styles.bottomNavIcon, layout.landscape && styles.bottomNavIconLandscape]}>⌂</Text><Text style={[styles.bottomNavText, layout.landscape && styles.bottomNavTextLandscape]}>PAINEL</Text></TouchableOpacity></Link>
            <Link href="/laboratorio" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Diagnóstico OBD" style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]}><Text style={[styles.bottomNavIcon, layout.landscape && styles.bottomNavIconLandscape]}>🔧</Text><Text style={[styles.bottomNavText, layout.landscape && styles.bottomNavTextLandscape]}>DIAGNÓSTICO</Text></TouchableOpacity></Link>
            <Link href="/viagens" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Viagens e relatórios" style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]}><Text style={[styles.bottomNavIcon, layout.landscape && styles.bottomNavIconLandscape]}>🛣️</Text><Text style={[styles.bottomNavText, layout.landscape && styles.bottomNavTextLandscape]}>VIAGENS</Text></TouchableOpacity></Link>
            <Link href="/veiculo" asChild><TouchableOpacity accessibilityRole="button" accessibilityLabel="Perfil do veículo" style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]}><Text style={[styles.bottomNavIcon, layout.landscape && styles.bottomNavIconLandscape]}>🚗</Text><Text style={[styles.bottomNavText, layout.landscape && styles.bottomNavTextLandscape]}>VEÍCULO</Text></TouchableOpacity></Link>
          </View>
          {!layout.landscape && <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO...' : saveStatus.obdSessionActive ? 'DIÁRIO DE BORDO • GRAVANDO' : 'DIÁRIO DE BORDO • AGUARDANDO ECU'}</Text>}
        </View>
      </View>
    </SafeAreaView>
  );
}

function CockpitMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) { return <View style={[styles.cockpitMetric, compact && styles.cockpitMetricCompact]}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flex:1,width:'100%',paddingVertical:6,paddingBottom:6},screenFrame:{width:'100%',flex:1,alignSelf:'center',justifyContent:'space-between'},
  header:{backgroundColor:'#0e1b2d',borderRadius:16,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerLandscape:{paddingVertical:8},headerTitle:{flex:1,minWidth:0},brand:{color:'#f8fafc',fontSize:18,fontWeight:'900',letterSpacing:1.2},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  connectionPill:{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0,backgroundColor:'#091526',borderRadius:20,borderWidth:1,borderColor:'#29415f',paddingHorizontal:10,paddingVertical:7},dot:{width:8,height:8,borderRadius:4},dotOk:{backgroundColor:'#4ade80'},dotWarn:{backgroundColor:'#fbbf24'},dotDanger:{backgroundColor:'#fb7185'},connectionText:{color:'#dbeafe',fontSize:9,fontWeight:'900'},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:12,alignItems:'center',marginBottom:8},heroCardLandscape:{padding:7,marginBottom:4},heroReadout:{width:'100%',alignItems:'center',paddingVertical:1},heroEyebrow:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1.4,textAlign:'center'},heroNumberRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:6},heroUnit:{color:'#a9c8ef',fontSize:18,fontWeight:'900'},heroSwitchHint:{color:'#8ea8c8',fontSize:10,fontWeight:'900',letterSpacing:.4,marginTop:6},heroSwitchHintLarge:{fontSize:12,lineHeight:18},heroWarning:{color:'#fbbf24'},heroValue:{color:'#f8fafc',fontSize:50,lineHeight:56,fontWeight:'900',marginTop:2,fontVariant:['tabular-nums']},heroValueLarge:{fontSize:56,lineHeight:62},heroValueLandscape:{fontSize:36,lineHeight:40,marginTop:0},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5,textAlign:'center'},
  metricRow:{width:'100%',flexDirection:'row',gap:6,marginTop:10},metricRowLandscape:{marginTop:4},cockpitMetric:{flex:1,minWidth:0,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b',paddingVertical:9,paddingHorizontal:5,alignItems:'center'},cockpitMetricCompact:{paddingVertical:4,paddingHorizontal:3},metricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3,textAlign:'center'},metricValue:{color:'#e5edf7',fontSize:12,fontWeight:'900',marginTop:3,textAlign:'center'},
  coolantCard:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:9,paddingHorizontal:13,paddingVertical:11,backgroundColor:'#091626',borderRadius:12,borderWidth:1,borderColor:'#315579'},coolantCardLandscape:{marginTop:4,paddingVertical:5,paddingHorizontal:9},coolantCopy:{flex:1,minWidth:0},coolantLabel:{color:'#c5d8f2',fontSize:9,fontWeight:'900',letterSpacing:.4},coolantStatus:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:4},coolantValue:{fontSize:23,fontWeight:'900',fontVariant:['tabular-nums']},coolantOk:{color:'#4ade80'},coolantWarning:{color:'#fbbf24'},
  healthCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:11,marginBottom:8},sectionHeader:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},sectionTitle:{color:'#f1f5f9',fontWeight:'900',fontSize:12,letterSpacing:.6},sectionHint:{color:'#7185a1',fontSize:9,marginTop:3},ok:{color:'#4ade80',fontSize:11,fontWeight:'900'},danger:{color:'#fb7185',fontSize:11,fontWeight:'900'},
  actionGrid:{flexDirection:'row',gap:7,marginBottom:8},actionGridLandscape:{flexDirection:'row',marginBottom:4},resourceButton:{flex:1,paddingVertical:10,paddingHorizontal:8},resourceButtonLandscape:{paddingVertical:6},secondaryButton:{backgroundColor:'#0e1b2d',borderRadius:13,padding:13,alignItems:'center',borderWidth:1,borderColor:'#34506f'},secondaryButtonText:{color:'#dbeafe',fontWeight:'900',fontSize:10,textAlign:'center'},bottomNav:{flexDirection:'row',backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',marginTop:0,padding:3},bottomNavLandscape:{padding:2},bottomNavItem:{flex:1,minWidth:0,minHeight:44,alignItems:'center',justifyContent:'center',paddingVertical:8,borderRadius:10},bottomNavItemLandscape:{minHeight:40,paddingVertical:3},bottomNavIconLandscape:{fontSize:12,marginBottom:0},bottomNavTextLandscape:{fontSize:7},bottomNavIcon:{fontSize:17,marginBottom:2},bottomNavText:{color:'#c0d1e6',fontSize:10,fontWeight:'900'},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
