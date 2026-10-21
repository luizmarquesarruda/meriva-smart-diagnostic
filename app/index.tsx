import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS } from '../src/ui/theme';
import { AppIcon } from '../src/ui/AppIcon';
import { NetworkStatusIndicator } from '../src/ui/NetworkStatusIndicator';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles, initializeDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { getAutoSaveState, getAutoSaveStatus, initAutoSave, updateAutoSaveState } from '../src/meriva/autosaveManager';
import type { AutoSaveStatus } from '../src/meriva/autosaveManager';
import type { ObdConnectionState } from '../src/meriva/autosaveState';
import { ensureMerivaVehicleProfile } from '../src/database/vehicleConfig';
import { createLearningProfile, initializeCarScannerSeed, readLearningProfile } from '../src/database/learningProfile';
import { readAppSettings, type AppSettings } from '../src/database/appSettings';
import { connectPreferredElm, getSharedObdConnection, getSharedObdLastError, getSharedObdStatus, subscribeSharedObd, subscribeSharedObdStatus } from '../src/obd/sharedConnection';
import { autoTripService, type AutoTripServiceState } from '../src/trip/autoTripService';
import { loadCurrentConditions, type CurrentConditions } from '../src/weather/currentConditions';
import { StartupScreen } from '../src/ui/StartupScreen';
import { getStartupHideDelayMs, getStartupProgress, STARTUP_TIMEOUT_MS, type StartupTerminalState } from '../src/ui/startupProgress';
import { INITIAL_STARTUP_PID_PREFLIGHT, runStartupPidPreflight, type StartupPidPreflightSnapshot } from '../src/diagnostics/startupPidPreflight';

let startupScreenConsumed = false;

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [, setObd] = useState<ObdConnectionState>({ connected: false });
  const [connectionStatus, setConnectionStatus] = useState(getSharedObdStatus());
  const [bluetoothSearching, setBluetoothSearching] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null, obdSessionActive: false });
  const [isHydrated, setIsHydrated] = useState(false);
  const [showStartupScreen, setShowStartupScreen] = useState(() => !startupScreenConsumed);
  const [startupTimedOut, setStartupTimedOut] = useState(false);
  const [startupPidPreflight, setStartupPidPreflight] = useState<StartupPidPreflightSnapshot>(INITIAL_STARTUP_PID_PREFLIGHT);
  const startupStartedAt = useRef(Date.now());
  const startupTerminalRef = useRef<StartupTerminalState>('progress');
  const startupScreenShownRef = useRef(showStartupScreen);
  const startupPreflightCancelled = useRef(false);
  const startupPidCheckStarted = useRef(false);
  startupScreenShownRef.current = showStartupScreen;
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [dtcCount, setDtcCount] = useState(0);
  const [activeHeroMetric, setActiveHeroMetric] = useState(0);
  const [conditions, setConditions] = useState<CurrentConditions>({ city: null, temperatureC: null, description: 'CLIMA OPCIONAL', available: false });
  const layout = useMidLayout();

  useEffect(() => {
    let cancelled = false;
    void loadCurrentConditions().then((result) => {
      if (!cancelled) setConditions(result);
    });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => autoTripService.subscribe(setTripState), []);
  useEffect(() => {
    if (!showStartupScreen) startupPreflightCancelled.current = true;
  }, [showStartupScreen]);
  useEffect(() => () => {
    startupScreenShownRef.current = false;
    startupPreflightCancelled.current = true;
  }, []);
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
      .then(async (connection) => {
        setBluetoothSearching(false);
        setBluetoothError(null);
        if (!startupScreenShownRef.current || startupPidCheckStarted.current) return;
        startupPidCheckStarted.current = true;
        setStartupPidPreflight({ ...INITIAL_STARTUP_PID_PREFLIGHT, status: 'running' });
        try {
          const summary = await runStartupPidPreflight(connection, {
            onProgress: (snapshot) => {
              if (startupScreenShownRef.current && !startupPreflightCancelled.current) setStartupPidPreflight(snapshot);
            },
            shouldCancel: () => startupPreflightCancelled.current
              || !startupScreenShownRef.current
              || getSharedObdConnection() !== connection,
          });
          if (startupScreenShownRef.current && !startupPreflightCancelled.current) setStartupPidPreflight(summary);
        } catch (cause) {
          if (startupScreenShownRef.current && !startupPreflightCancelled.current) {
            setStartupPidPreflight({
              ...INITIAL_STARTUP_PID_PREFLIGHT,
              status: 'partial',
              message: cause instanceof Error ? cause.message : 'Falha inesperada na verificação inicial dos PIDs.',
            });
          }
        }
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
  }, [
    isHydrated,
    settings?.autoConnectObd,
    settings?.selectedAdapterAddress,
    settings?.elmIoTimeoutMs,
    settings?.elmBluetoothTimeoutMs,
    settings?.elmCommandDelayMs,
    settings?.elmMaxConnectionAttempts,
    settings?.elmNoDataReconnectThreshold,
    settings?.elmPartialResponseAction,
    settings?.elmForceInitialization,
    settings?.elmAdaptiveTiming,
    settings?.elmAdaptiveTimeoutMinMs,
    settings?.elmAdaptiveTimeoutMaxMs,
  ]);

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

  const startupProgress = getStartupProgress({
    hydrated: isHydrated,
    settingsLoaded: settings !== null,
    autoConnect: settings?.autoConnectObd !== false,
    searching: bluetoothSearching,
    ecuConnected: connectionStatus.ecuConnected,
    lifecycle: connectionStatus.lifecycle,
    error: bluetoothError,
    timedOut: startupTimedOut,
    pidPreflight: startupPidPreflight,
  });
  startupTerminalRef.current = startupProgress.terminal;

  // A tela acompanha a conexão já iniciada pelo fluxo proprietário da home.
  // O timeout libera a interface em modo offline sem alegar que a ECU respondeu.
  useEffect(() => {
    if (!showStartupScreen) return;
    const timer = setTimeout(() => {
      if (startupTerminalRef.current === 'progress') {
        startupPreflightCancelled.current = true;
        setStartupTimedOut(true);
      }
    }, STARTUP_TIMEOUT_MS);
    return () => clearTimeout(timer);
  }, [showStartupScreen]);

  useEffect(() => {
    if (!showStartupScreen) return;
    const delayMs = getStartupHideDelayMs({
      elapsedMs: Date.now() - startupStartedAt.current,
      terminal: startupProgress.terminal,
      timedOut: startupTimedOut,
    });
    if (delayMs === null) return;
    const timer = setTimeout(() => {
      startupScreenConsumed = true;
      setShowStartupScreen(false);
    }, delayMs);
    return () => clearTimeout(timer);
  }, [showStartupScreen, startupProgress.terminal, startupTimedOut]);

  if (showStartupScreen) return <StartupScreen progress={startupProgress} />;

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <View style={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.topSection}>
            <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
              <View style={styles.headerTitle}>
                <Text style={styles.brand} numberOfLines={1}>MERIVA SMART</Text>
                <Text style={styles.subtitle} numberOfLines={1}>COCKPIT DE DIAGNÓSTICO</Text>
              </View>
              <View style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'ECU SEM RESPOSTA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : connectionStatus.ecuConnected ? 'ECU' : connectionStatus.bluetoothConnected ? 'BLUETOOTH' : bluetoothSearching ? 'CONECTANDO' : 'OFFLINE'}</Text></View>
            </View>
            <View style={[styles.infoStrip, layout.landscape && styles.infoStripLandscape]}>
              <View style={styles.weatherContent}>
                <View style={[styles.weatherIconWrap, layout.landscape && styles.weatherIconWrapLandscape]}>
                  <AppIcon name="weather" size={24} color={COLORS.accent} />
                </View>
                <View style={styles.weatherDetails}>
                  <Text style={[styles.weatherCity, layout.landscape && styles.weatherCityLandscape]} numberOfLines={layout.landscape ? 1 : 2}>
                    {conditions.city ? conditions.city.toLocaleUpperCase('pt-BR') : 'CLIMA LOCAL'}
                  </Text>
                  <View style={styles.weatherMeta}>
                    <Text style={[styles.weatherTemperature, layout.landscape && styles.weatherTemperatureLandscape]} numberOfLines={1}>
                      {conditions.temperatureC != null ? Math.round(conditions.temperatureC) + '°' : 'N/D'}
                    </Text>
                    <Text style={[styles.weatherDescription, layout.landscape && styles.weatherDescriptionLandscape]} numberOfLines={2}>
                      {conditions.description || 'CONDIÇÃO INDISPONÍVEL'}
                    </Text>
                  </View>
                </View>
              </View>
              <Link href="/conectividade" asChild>
                <TouchableOpacity
                  style={[styles.networkChip, layout.landscape && styles.networkChipLandscape]}
                  accessibilityRole="button"
                  accessibilityLabel="Detalhes de conectividade Wi-Fi e dados móveis 4G ou 5G"
                  accessibilityHint="Abre o estado da conexão e da disponibilidade da internet"
                  activeOpacity={0.78}
                >
                  <NetworkStatusIndicator />
                </TouchableOpacity>
              </Link>
            </View>
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
              <View style={styles.heroSwitchHintRow}>
                <AppIcon name="refresh" size={10} color={COLORS.textSubtle} />
                <Text style={styles.heroSwitchHint}>{activeHeroMetric + 1}/{heroMetrics.length}  •  TOQUE PARA TROCAR  •  10 S</Text>
              </View>
            </TouchableOpacity>
            <View style={[styles.metricRow, layout.landscape && styles.metricRowLandscape]}>
              <CockpitMetric label={consumptionLabel} value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
              <CockpitMetric label="AUTONOMIA" value={getAutoSaveState().autonomy.estimatedRangeKm > 0 ? getAutoSaveState().autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
              <CockpitMetric label="FALHAS ATIVAS" value={!connectionStatus.ecuConnected ? 'N/D' : dtcCount > 0 ? String(dtcCount) + ' DTC' : 'SEM DTC'} />
            </View>
            <View style={[styles.coolantCard, layout.landscape && styles.coolantCardLandscape]}>
              <View style={styles.coolantCopy}>
                <View style={styles.coolantHeading}>
                  <AppIcon name="coolant" size={14} color={COLORS.accent} />
                  <Text style={styles.coolantLabel}>LÍQUIDO DE ARREFECIMENTO</Text>
                </View>
                <Text style={styles.coolantStatus}>{coolantStatus}</Text>
              </View>
              <Text style={[styles.coolantValue, coolantValue != null && coolantValue >= 115 ? styles.danger : coolantValue != null && coolantValue >= 110 ? styles.coolantWarning : styles.coolantOk]}>
                {coolantValue != null ? `${Math.round(coolantValue)} °C` : 'N/D'}
              </Text>
            </View>
          </View>
          <View style={[styles.actionGrid, layout.landscape && styles.actionGridLandscape]}>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.primaryButton, styles.dashboardAction]} accessibilityRole="button" accessibilityLabel="Abrir laboratório de diagnóstico OBD" accessibilityHint="Abre os testes e as consultas de diagnóstico" activeOpacity={0.78}><View style={styles.actionContent}><AppIcon name="diagnostic" size={18} color="#ffffff" /><Text style={styles.buttonText} numberOfLines={1}>DIAGNÓSTICO</Text></View></TouchableOpacity></Link>
            <Link href="/dados" asChild><TouchableOpacity style={[styles.secondaryButton, styles.dashboardAction]} accessibilityRole="button" accessibilityLabel="Abrir dados em tempo real" accessibilityHint="Abre gráficos e leituras de telemetria" activeOpacity={0.78}><View style={styles.actionContent}><AppIcon name="data" size={18} color={COLORS.accent} /><Text style={styles.secondaryButtonText} numberOfLines={1}>DADOS</Text></View></TouchableOpacity></Link>
            <Link href="/viagens" asChild><TouchableOpacity style={[styles.secondaryButton, styles.dashboardAction]} accessibilityRole="button" accessibilityLabel="Abrir viagens" accessibilityHint="Abre o histórico de trajetos registrados" activeOpacity={0.78}><View style={styles.actionContent}><AppIcon name="trips" size={18} color={COLORS.accent} /><Text style={styles.secondaryButtonText} numberOfLines={1}>VIAGENS</Text></View></TouchableOpacity></Link>
          </View>
          <View style={styles.layoutSpacer} />
          <View style={[styles.bottomNav, layout.landscape && styles.bottomNavLandscape]}>
            <Link href="/bluetooth" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Bluetooth" accessibilityHint="Abre as conexões do adaptador e da ECU" activeOpacity={0.72}><AppIcon name="bluetooth" size={25} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/conectividade" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Conectividade Wi-Fi e 4G/5G" accessibilityHint="Abre o estado da rede e da internet" activeOpacity={0.72}><AppIcon name="connectivity" size={25} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/mais" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Mais recursos" accessibilityHint="Abre os módulos adicionais do aplicativo" activeOpacity={0.72}><AppIcon name="more" size={25} color={COLORS.accent} /></TouchableOpacity></Link>
          </View>
          <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO...' : saveStatus.obdSessionActive ? 'DIÁRIO DE BORDO • GRAVANDO' : 'DIÁRIO DE BORDO • AGUARDANDO ECU'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function CockpitMetric({ label, value }: { label: string; value: string }) { return <View style={styles.cockpitMetric}><Text style={styles.metricLabel}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>; }

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.screen},content:{flex:1,width:'100%',paddingVertical:6,paddingBottom:6},screenFrame:{width:'100%',flex:1,alignSelf:'center'},topSection:{marginBottom:8},layoutSpacer:{flexGrow:1,minHeight:8},
  infoStrip:{minHeight:88,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,paddingVertical:8,backgroundColor:COLORS.surface,borderRadius:13,borderWidth:1,borderColor:COLORS.border},infoStripLandscape:{minHeight:60,paddingHorizontal:8,paddingVertical:5,gap:7},
  weatherContent:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:9},weatherIconWrap:{width:42,height:42,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.surfaceInset,borderWidth:1,borderColor:COLORS.border},weatherIconWrapLandscape:{width:34,height:34,borderRadius:10},weatherDetails:{flex:1,minWidth:0,gap:2},weatherCity:{color:COLORS.textStrong,fontSize:15,lineHeight:18,fontWeight:'900',letterSpacing:.35},weatherCityLandscape:{fontSize:13,lineHeight:15},weatherMeta:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},weatherTemperature:{color:COLORS.textStrong,fontSize:24,lineHeight:28,fontWeight:'900',fontVariant:['tabular-nums']},weatherTemperatureLandscape:{fontSize:20,lineHeight:23},weatherDescription:{flexShrink:1,color:COLORS.textMuted,fontSize:12,lineHeight:16,fontWeight:'800'},weatherDescriptionLandscape:{fontSize:10,lineHeight:13},
  
  networkChip:{minHeight:64,minWidth:96,maxWidth:112,alignItems:'stretch',justifyContent:'center',paddingHorizontal:7,paddingVertical:6,backgroundColor:COLORS.surfaceInset,borderRadius:11,borderWidth:1,borderColor:COLORS.border},networkChipLandscape:{minHeight:50,minWidth:82,maxWidth:92,paddingHorizontal:5,paddingVertical:4},
  header:{backgroundColor:'#0e1b2d',borderRadius:16,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerLandscape:{paddingVertical:12},headerTitle:{flex:1,minWidth:0},brand:{color:'#f8fafc',fontSize:18,fontWeight:'900',letterSpacing:1.2},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  connectionPill:{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0,backgroundColor:'#091526',borderRadius:20,borderWidth:1,borderColor:'#29415f',paddingHorizontal:10,paddingVertical:7},dot:{width:8,height:8,borderRadius:4},dotOk:{backgroundColor:'#4ade80'},dotWarn:{backgroundColor:'#fbbf24'},dotDanger:{backgroundColor:'#fb7185'},connectionText:{color:'#dbeafe',fontSize:9,fontWeight:'900'},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:12,alignItems:'center',marginBottom:8},heroCardLandscape:{padding:7,marginBottom:4},heroReadout:{width:'100%',alignItems:'center',paddingVertical:1},heroEyebrow:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1.4,textAlign:'center'},heroNumberRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:6},heroUnit:{color:'#a9c8ef',fontSize:18,fontWeight:'900'},heroSwitchHintRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginTop:4},heroSwitchHint:{color:'#6884a6',fontSize:8,fontWeight:'900',letterSpacing:.6},heroWarning:{color:'#fbbf24'},heroValue:{color:'#f8fafc',fontSize:50,lineHeight:56,fontWeight:'900',marginTop:2,fontVariant:['tabular-nums']},heroValueLandscape:{fontSize:36,lineHeight:40,marginTop:0},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5,textAlign:'center'},
  metricRow:{width:'100%',flexDirection:'row',gap:6,marginTop:10},metricRowLandscape:{marginTop:4},cockpitMetric:{flex:1,minWidth:0,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b',paddingVertical:9,paddingHorizontal:5,alignItems:'center'},metricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3,textAlign:'center'},metricValue:{color:'#e5edf7',fontSize:12,fontWeight:'900',marginTop:3,textAlign:'center'},
  coolantCard:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:9,paddingHorizontal:13,paddingVertical:11,backgroundColor:'#091626',borderRadius:12,borderWidth:1,borderColor:'#315579'},coolantCardLandscape:{marginTop:4,paddingVertical:5,paddingHorizontal:9},coolantCopy:{flex:1,minWidth:0},coolantHeading:{flexDirection:'row',alignItems:'center',gap:5},coolantLabel:{color:'#c5d8f2',fontSize:9,fontWeight:'900',letterSpacing:.4},coolantStatus:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:4},coolantValue:{fontSize:23,fontWeight:'900',fontVariant:['tabular-nums']},coolantOk:{color:'#4ade80'},coolantWarning:{color:'#fbbf24'},
  danger:{color:'#fb7185'},
  connectionCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},chain:{flexDirection:'row',alignItems:'center',marginTop:10},chainStep:{flex:1,alignItems:'center'},chainCircle:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#3b516b',backgroundColor:'#0a1727'},chainCircleOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},chainCircleText:{color:'#7185a1',fontSize:11,fontWeight:'900'},chainCircleTextOk:{color:'#4ade80'},chainLabel:{color:'#9fb4cf',fontSize:8,fontWeight:'900',marginTop:4},chainArrow:{color:'#526a86',fontSize:24,paddingHorizontal:4},
  actionGrid:{flexDirection:'row',gap:7,marginBottom:8},actionGridLandscape:{flexDirection:'row'},actionButtonLandscape:{flex:1,minWidth:0},dashboardAction:{flex:1,minWidth:0,minHeight:56,paddingVertical:15,paddingHorizontal:7},actionContent:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},primaryButton:{backgroundColor:'#2563eb',borderRadius:13,padding:14,alignItems:'center'},buttonText:{color:'#fff',fontWeight:'900',fontSize:11,textAlign:'center'},buttonSubtext:{color:'#bfdbfe',fontWeight:'800',fontSize:8,marginTop:3},secondaryButton:{backgroundColor:'#0e1b2d',borderRadius:13,padding:13,alignItems:'center',borderWidth:1,borderColor:'#34506f'},secondaryButtonText:{color:'#dbeafe',fontWeight:'900',fontSize:10,textAlign:'center'},buttonSubtextDark:{color:'#7185a1',fontWeight:'800',fontSize:8,marginTop:3},
  statusGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:2},statusGridLandscape:{flexWrap:'nowrap',gap:8},statusCardLandscape:{width:'auto',flex:1},statusCard:{width:'48%',minWidth:0,backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:8},moreButton:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:13,marginTop:2},moreIcon:{color:'#7db3ff',fontSize:24,fontWeight:'900'},moreBody:{flex:1,minWidth:0},moreTitle:{color:'#e5edf7',fontSize:11,fontWeight:'900'},moreHint:{color:'#7185a1',fontSize:8,marginTop:3,flexShrink:1},moreArrow:{color:'#7db3ff',fontSize:24},
  error:{color:'#fb7185',fontWeight:'800',fontSize:10,marginTop:8},bottomNav:{flexDirection:'row',backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',marginTop:0,padding:3},bottomNavLandscape:{marginTop:2,paddingVertical:1},bottomNavItem:{flex:1,alignItems:'center',justifyContent:'center',minHeight:56,borderRadius:10},bottomNavActive:{backgroundColor:'#152a45'},bottomNavIcon:{fontSize:22,marginBottom:0},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
