import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { AppState, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { describeWeatherCode, loadDashboardWeather, type DashboardWeather } from '../src/weather/dashboardWeather';

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
  const [dashboardWeather, setDashboardWeather] = useState<DashboardWeather>({ status: 'LOADING', city: null, region: null, temperatureC: null, apparentTemperatureC: null, weatherCode: null, updatedAt: null });
  const layout = useMidLayout();

  useEffect(() => {
    let disposed = false;
    let inFlight = false;

    const refreshWeather = async () => {
      if (disposed || inFlight) return;
      inFlight = true;
      try {
        const next = await loadDashboardWeather();
        if (disposed) return;
        setDashboardWeather((current) => {
          if (next.status === 'READY' || next.status === 'LOCATION_PERMISSION' || next.status === 'LOCATION_UNAVAILABLE') {
            return next;
          }
          // Preserve the last valid temperature while offline, with its original timestamp.
          return {
            ...current,
            city: next.city ?? current.city,
            region: next.region ?? current.region,
            status: 'OFFLINE',
          };
        });
      } catch {
        if (!disposed) setDashboardWeather((current) => ({ ...current, status: 'OFFLINE' }));
      } finally {
        inFlight = false;
      }
    };

    void refreshWeather();
    const interval = setInterval(() => void refreshWeather(), 30 * 60 * 1000);
    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void refreshWeather();
    });

    return () => {
      disposed = true;
      clearInterval(interval);
      appStateSubscription.remove();
    };
  }, []);

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
  const heroMetrics = [
    { label: 'VELOCIDADE GPS', value: gpsState.running ? String(Math.round(gpsState.currentSpeedKmh)) : 'N/D', unit: gpsState.running ? 'km/h' : '', hint: gpsState.running ? 'SINAL GPS ATIVO' : 'AGUARDANDO GPS', tone: 'normal' },
    { label: 'TEMPERATURA DO MOTOR', value: coolantValue != null ? String(Math.round(coolantValue)) : 'N/D', unit: coolantValue != null ? '°C' : '', hint: coolantValue != null ? 'LEITURA REAL • PID 0105' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0105' : 'ECU DESCONECTADA', tone: coolantValue != null && coolantValue >= 115 ? 'danger' : coolantValue != null && coolantValue >= 110 ? 'warning' : 'normal' },
    { label: 'VOLTAGEM DO SISTEMA', value: voltageValue != null ? voltageValue.toFixed(1) : 'N/D', unit: voltageValue != null ? 'V' : '', hint: voltageValue != null ? 'LEITURA REAL • PID 0142' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0142' : 'ECU DESCONECTADA', tone: 'normal' },
    { label: 'POSIÇÃO DA BORBOLETA', value: throttleValue != null ? throttleValue.toFixed(1) : 'N/D', unit: throttleValue != null ? '%' : '', hint: throttleValue != null ? 'LEITURA REAL • PID 0111' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0111' : 'ECU DESCONECTADA', tone: 'normal' },
    { label: 'ROTAÇÃO DO MOTOR', value: rpmValue != null ? String(Math.round(rpmValue)) : 'N/D', unit: rpmValue != null ? 'RPM' : '', hint: rpmValue != null ? 'LEITURA REAL • PID 010C' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 010C' : 'ECU DESCONECTADA', tone: 'normal' },
  ];

  // The displayed metric count is the single source of truth for both timed
  // and touch-driven rotation; adding/removing metrics cannot desynchronize it.
  useEffect(() => {
    const timer = setInterval(
      () => setActiveHeroMetric((current) => (current + 1) % Math.max(1, heroMetrics.length)),
      10_000,
    );
    return () => clearInterval(timer);
  }, [heroMetrics.length]);

  const selectedHeroMetric = heroMetrics[activeHeroMetric] ?? heroMetrics[0];
  const coolantStatus = coolantValue != null && coolantValue >= 115
    ? 'TEMPERATURA ALTA'
    : coolantValue != null && coolantValue >= 110
      ? 'ATENÇÃO'
      : coolantValue != null ? 'LEITURA REAL • PID 0105' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0105' : 'ECU DESCONECTADA';
  const weatherStatusLabel = dashboardWeather.status === 'READY'
    ? 'ONLINE • ' + formatWeatherTime(dashboardWeather.updatedAt)
    : dashboardWeather.status === 'OFFLINE'
      ? dashboardWeather.updatedAt
        ? 'SEM INTERNET • ÚLTIMO DADO ' + formatWeatherTime(dashboardWeather.updatedAt)
        : 'SEM INTERNET • AGUARDANDO 4G/5G'
      : dashboardWeather.status === 'LOCATION_PERMISSION'
        ? 'ATIVE A LOCALIZAÇÃO DO CELULAR'
        : dashboardWeather.status === 'LOCATION_UNAVAILABLE'
          ? 'LOCALIZAÇÃO INDISPONÍVEL'
          : 'BUSCANDO CLIMA PELA INTERNET';
  const weatherLocationLabel = dashboardWeather.city
    ? dashboardWeather.city + (dashboardWeather.region && dashboardWeather.region !== dashboardWeather.city ? ' • ' + dashboardWeather.region : '')
    : dashboardWeather.status === 'LOCATION_PERMISSION'
      ? 'LOCALIZAÇÃO DESATIVADA'
      : dashboardWeather.status === 'LOCATION_UNAVAILABLE'
        ? 'CIDADE INDISPONÍVEL'
        : dashboardWeather.status === 'LOADING' ? 'DETECTANDO CIDADE' : 'CIDADE INDISPONÍVEL';

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
            <View style={styles.headerTitle}>
              <Text style={styles.brand} numberOfLines={1}>MERIVA SMART</Text>
              <Text style={styles.subtitle} numberOfLines={1}>COCKPIT DE DIAGNÓSTICO</Text>
            </View>
            <View style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'ECU SEM RESPOSTA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : connectionStatus.ecuConnected ? 'ECU' : connectionStatus.bluetoothConnected ? 'BLUETOOTH' : bluetoothSearching ? 'CONECTANDO' : 'OFFLINE'}</Text></View>
          </View>
          <View style={[styles.heroCard, layout.landscape && styles.heroCardLandscape]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedHeroMetric.label + '. Toque para trocar o indicador'}
              onPress={() => setActiveHeroMetric((current) => (current + 1) % Math.max(1, heroMetrics.length))}
              activeOpacity={0.82}
              style={styles.heroReadout}
            >
              <Text style={styles.heroEyebrow}>{selectedHeroMetric.label}</Text>
              <View style={styles.heroNumberRow}>
                <Text style={[styles.heroValue, layout.landscape && styles.heroValueLandscape, selectedHeroMetric.tone === 'danger' && styles.danger, selectedHeroMetric.tone === 'warning' && styles.heroWarning]}>{selectedHeroMetric.value}</Text>
                {!!selectedHeroMetric.unit && <Text style={styles.heroUnit}>{selectedHeroMetric.unit}</Text>}
              </View>
              <Text style={styles.heroState}>{selectedHeroMetric.hint}</Text>
              <Text style={styles.heroSwitchHint}>◉ {activeHeroMetric + 1}/{heroMetrics.length}  •  TOQUE PARA TROCAR  •  10 S</Text>
            </TouchableOpacity>
            <View style={[styles.metricRow, layout.landscape && styles.metricRowLandscape]}>
              <CockpitMetric label={consumptionLabel} value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
              <CockpitMetric label="AUTONOMIA" value={getAutoSaveState().autonomy.estimatedRangeKm > 0 ? getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
              <CockpitMetric label="FALHAS ATIVAS" value={dtcCount > 0 ? String(dtcCount) + ' DTC' : 'NORMAL'} />
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
          <View style={[styles.weatherCard, layout.landscape && styles.weatherCardLandscape]}>
            <View style={styles.weatherLocation}>
              <Text style={styles.weatherEyebrow}>📍 CLIMA EXTERNO</Text>
              <Text style={styles.weatherCity} numberOfLines={1}>{weatherLocationLabel}</Text>
              <Text style={styles.weatherStatus} numberOfLines={1}>{weatherStatusLabel}</Text>
            </View>
            <View style={styles.weatherTemperature}>
              <Text style={styles.weatherTemp}>{dashboardWeather.temperatureC != null ? Math.round(dashboardWeather.temperatureC) + '°' : '--°'}</Text>
              <Text style={styles.weatherCondition}>{dashboardWeather.temperatureC != null ? describeWeatherCode(dashboardWeather.weatherCode) : 'TEMPERATURA EXTERNA'}</Text>
              {dashboardWeather.apparentTemperatureC != null && (
                <Text style={styles.weatherFeels}>SENSAÇÃO {Math.round(dashboardWeather.apparentTemperatureC)}°</Text>
              )}
            </View>
          </View>
          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.primaryButton, styles.dashboardAction]}><Text style={styles.buttonText} numberOfLines={1}>🔧 DIAGNÓSTICO</Text></TouchableOpacity></Link>
            <Link href="/dados" asChild><TouchableOpacity style={[styles.secondaryButton, styles.dashboardAction]}><Text style={styles.secondaryButtonText} numberOfLines={1}>📊 DADOS</Text></TouchableOpacity></Link>
            <Link href="/viagens" asChild><TouchableOpacity style={[styles.secondaryButton, styles.dashboardAction]}><Text style={styles.secondaryButtonText} numberOfLines={1}>🛣️ VIAGENS</Text></TouchableOpacity></Link>
          </View>
          {!layout.landscape && (
            <>
              <View style={styles.bottomNav}>
                <Link href="/bluetooth" asChild><TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavIcon}>🔵</Text><Text style={styles.bottomNavText}>BLUETOOTH</Text></TouchableOpacity></Link>
                <Link href="/mais" asChild><TouchableOpacity style={styles.bottomNavItem}><Text style={styles.bottomNavIcon}>⋯</Text><Text style={styles.bottomNavText}>MAIS RECURSOS</Text></TouchableOpacity></Link>
              </View>
              <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO...' : saveStatus.obdSessionActive ? 'DIÁRIO DE BORDO • GRAVANDO' : 'DIÁRIO DE BORDO • AGUARDANDO ECU'}</Text>
            </>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

function formatWeatherTime(value: string | null): string {
  if (!value) return '--:--';
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }) : '--:--';
}

function CockpitMetric({ label, value }: { label: string; value: string }) { return <View style={styles.cockpitMetric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flex:1,width:'100%',paddingVertical:6,paddingBottom:6},screenFrame:{width:'100%',flex:1,alignSelf:'center',justifyContent:'space-between'},
  header:{backgroundColor:'#0e1b2d',borderRadius:16,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerLandscape:{paddingVertical:12},headerTitle:{flex:1,minWidth:0},brand:{color:'#f8fafc',fontSize:18,fontWeight:'900',letterSpacing:1.2},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  connectionPill:{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0,backgroundColor:'#091526',borderRadius:20,borderWidth:1,borderColor:'#29415f',paddingHorizontal:10,paddingVertical:7},dot:{width:8,height:8,borderRadius:4},dotOk:{backgroundColor:'#4ade80'},dotWarn:{backgroundColor:'#fbbf24'},dotDanger:{backgroundColor:'#fb7185'},connectionText:{color:'#dbeafe',fontSize:9,fontWeight:'900'},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:12,alignItems:'center',marginBottom:8},heroCardLandscape:{padding:7,marginBottom:4},heroReadout:{width:'100%',alignItems:'center',paddingVertical:1},heroEyebrow:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1.4,textAlign:'center'},heroNumberRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:6},heroUnit:{color:'#a9c8ef',fontSize:18,fontWeight:'900'},heroSwitchHint:{color:'#6884a6',fontSize:8,fontWeight:'900',letterSpacing:.6,marginTop:4},heroWarning:{color:'#fbbf24'},heroValue:{color:'#f8fafc',fontSize:50,lineHeight:56,fontWeight:'900',marginTop:2,fontVariant:['tabular-nums']},heroValueLandscape:{fontSize:36,lineHeight:40,marginTop:0},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5,textAlign:'center'},
  metricRow:{width:'100%',flexDirection:'row',gap:6,marginTop:10},metricRowLandscape:{marginTop:4},cockpitMetric:{flex:1,minWidth:0,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b',paddingVertical:9,paddingHorizontal:5,alignItems:'center'},metricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3,textAlign:'center'},metricValue:{color:'#e5edf7',fontSize:12,fontWeight:'900',marginTop:3,textAlign:'center'},
  coolantCard:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:9,paddingHorizontal:13,paddingVertical:11,backgroundColor:'#091626',borderRadius:12,borderWidth:1,borderColor:'#315579'},coolantCardLandscape:{marginTop:4,paddingVertical:5,paddingHorizontal:9},coolantCopy:{flex:1,minWidth:0},coolantLabel:{color:'#c5d8f2',fontSize:9,fontWeight:'900',letterSpacing:.4},coolantStatus:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:4},coolantValue:{fontSize:23,fontWeight:'900',fontVariant:['tabular-nums']},coolantOk:{color:'#4ade80'},coolantWarning:{color:'#fbbf24'},
  weatherCard:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10,backgroundColor:'#0e1b2d',borderRadius:13,borderWidth:1,borderColor:'#28415f',paddingHorizontal:13,paddingVertical:9,marginBottom:8,minHeight:60},weatherCardLandscape:{paddingVertical:5,marginBottom:4},weatherLocation:{flex:1,minWidth:0},weatherEyebrow:{color:'#7db3ff',fontSize:8,fontWeight:'900',letterSpacing:.8},weatherCity:{color:'#f1f5f9',fontSize:12,fontWeight:'900',marginTop:4},weatherStatus:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:3},weatherTemperature:{alignItems:'flex-end',justifyContent:'center',minWidth:72},weatherTemp:{color:'#f8fafc',fontSize:27,lineHeight:31,fontWeight:'900',fontVariant:['tabular-nums']},weatherCondition:{color:'#9fc5f7',fontSize:8,fontWeight:'900',letterSpacing:.3},weatherFeels:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:2},danger:{color:'#fb7185',fontSize:11,fontWeight:'900'},
  connectionCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},chain:{flexDirection:'row',alignItems:'center',marginTop:10},chainStep:{flex:1,alignItems:'center'},chainCircle:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#3b516b',backgroundColor:'#0a1727'},chainCircleOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},chainCircleText:{color:'#7185a1',fontSize:11,fontWeight:'900'},chainCircleTextOk:{color:'#4ade80'},chainLabel:{color:'#9fb4cf',fontSize:8,fontWeight:'900',marginTop:4},chainArrow:{color:'#526a86',fontSize:24,paddingHorizontal:4},
  actionGrid:{flexDirection:'row',gap:7,marginBottom:8},actionGridLandscape:{flexDirection:'row'},actionButtonLandscape:{flex:1,minWidth:0},dashboardAction:{flex:1,minWidth:0,paddingVertical:15,paddingHorizontal:4},primaryButton:{backgroundColor:'#2563eb',borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:10,textAlign:'center'},buttonSubtext:{color:'#bfdbfe',fontWeight:'800',fontSize:8,marginTop:3},secondaryButton:{backgroundColor:'#0e1b2d',borderRadius:13,padding:13,alignItems:'center',borderWidth:1,borderColor:'#34506f'},secondaryButtonText:{color:'#dbeafe',fontWeight:'900',fontSize:10,textAlign:'center'},buttonSubtextDark:{color:'#7185a1',fontWeight:'800',fontSize:8,marginTop:3},
  statusGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:2},statusGridLandscape:{flexWrap:'nowrap',gap:8},statusCardLandscape:{width:'auto',flex:1},statusCard:{width:'48%',minWidth:0,backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:8},moreButton:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:13,marginTop:2},moreIcon:{color:'#7db3ff',fontSize:24,fontWeight:'900'},moreBody:{flex:1,minWidth:0},moreTitle:{color:'#e5edf7',fontSize:11,fontWeight:'900'},moreHint:{color:'#7185a1',fontSize:8,marginTop:3,flexShrink:1},moreArrow:{color:'#7db3ff',fontSize:24},
  error:{color:'#fb7185',fontWeight:'800',fontSize:10,marginTop:8},bottomNav:{flexDirection:'row',backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',marginTop:0,padding:3},bottomNavItem:{flex:1,alignItems:'center',paddingVertical:8,borderRadius:10},bottomNavActive:{backgroundColor:'#152a45'},bottomNavIcon:{fontSize:17,marginBottom:2},bottomNavActiveText:{color:'#7db3ff',fontSize:9,fontWeight:'900'},bottomNavText:{color:'#9fb4cf',fontSize:9,fontWeight:'900'},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
