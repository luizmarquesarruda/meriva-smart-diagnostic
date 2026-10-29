import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS } from '../src/ui/theme';
import { AppIcon } from '../src/ui/AppIcon';
import { NetworkStatusIndicator } from '../src/ui/NetworkStatusIndicator';
import * as FileSystem from 'expo-file-system';
import NetInfo from '@react-native-community/netinfo';
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
import { mergeCurrentConditions, startCurrentConditionsRefresh, type NetworkReachabilitySnapshot } from '../src/weather/conditionsRefresh';
import { getCurrentAutonomyRangeKm } from '../src/trip/autonomyPresentation';
import { buildCockpitPidMetrics, COCKPIT_QUADRANT_PAGE_SIZE, getCockpitMetricPage, type CockpitPidMetric } from '../src/obd/cockpitTelemetry';

export default function IndexScreen() {
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [, setObd] = useState<ObdConnectionState>({ connected: false });
  const [connectionStatus, setConnectionStatus] = useState(getSharedObdStatus());
  const [bluetoothSearching, setBluetoothSearching] = useState(false);
  const [bluetoothError, setBluetoothError] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<AutoSaveStatus>({ lastSavedAt: null, lastSaveReason: null, lastError: null, obdSessionActive: false });
  const [isHydrated, setIsHydrated] = useState(false);
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [activeQuadrantPage, setActiveQuadrantPage] = useState(0);
  const [conditions, setConditions] = useState<CurrentConditions>({ city: null, locationLabels: [], temperatureC: null, description: 'CLIMA OPCIONAL', available: false });
  const [locationLabelIndex, setLocationLabelIndex] = useState(0);
  const layout = useMidLayout();

  const locationLabels = conditions.locationLabels.length > 0 ? conditions.locationLabels : ['CLIMA LOCAL'];
  const locationLabelsKey = locationLabels.join('|');

  useEffect(() => {
    setLocationLabelIndex(0);
    const timer = setInterval(() => {
      setLocationLabelIndex((current) => (current + 1) % Math.max(1, locationLabels.length));
    }, 10_000);
    return () => clearInterval(timer);
  }, [locationLabelsKey]);

  useEffect(() => {
    const monitor = {
      fetch: async () => {
        const state = await NetInfo.fetch();
        return {
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        };
      },
      addEventListener: (listener: (state: NetworkReachabilitySnapshot) => void) =>
        NetInfo.addEventListener((state) => listener({
          isConnected: state.isConnected,
          isInternetReachable: state.isInternetReachable,
        })),
    };

    return startCurrentConditionsRefresh(
      monitor,
      loadCurrentConditions,
      (result) => setConditions((previous) => mergeCurrentConditions(previous, result)),
    );
  }, []);

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
    if (!matches(item) || item.source !== 'REAL' || item.status !== 'RESPONDEU' || item.value == null || !Number.isFinite(item.value)) return false;
    const timestampMs = Date.parse(item.timestamp);
    const ageMs = Date.now() - timestampMs;
    return connectionStatus.ecuConnected && Number.isFinite(timestampMs) && ageMs >= 0 && ageMs <= 30_000;
  });
  const manifoldPressureReading = freshRealReading((item) => item.pid === '010B' || /manifold.*pressure|press[aã]o.*coletor/i.test(item.name));
  const manifoldPressureKpa = manifoldPressureReading?.value ?? null;
  const currentAutonomyKm = getCurrentAutonomyRangeKm({
    ecuConnected: connectionStatus.ecuConnected,
    tripConnected: tripState.connected,
    fuelLevelSupported: tripState.fuelLevelSupported,
    fuelLevelPercent: tripState.fuelLevelPercent,
    fuelLevelReadAtMs: tripState.fuelLevelReadAtMs,
    tripConsumptionKml: tripState.consumptionKml,
    averageConsumptionKml: tripState.averageConsumptionKml,
  });
  const connectedSupportedPids = connectionStatus.ecuConnected
    ? getSharedObdConnection()?.supportedPids ?? []
    : [];
  const discoveredHeroMetrics = buildCockpitPidMetrics(connectedSupportedPids, liveReadings);
  const quadrantDefinitions = [
    { pid: '0105', label: 'TEMPERATURA DO MOTOR', unit: '°C' },
    { pid: '0142', label: 'VOLTAGEM DO SISTEMA', unit: 'V' },
    { pid: '0111', label: 'POSIÇÃO DA BORBOLETA', unit: '%' },
    { pid: '010C', label: 'ROTAÇÃO DO MOTOR', unit: 'RPM' },
  ] as const;
  const discoveredByPid = new Map(discoveredHeroMetrics.map((metric) => [metric.pid, metric] as const));
  const normalizedSupportedPids = new Set(connectedSupportedPids.map((pid) => String(pid).replace(/\s/g, '').toUpperCase()));
  const primaryMetrics: CockpitPidMetric[] = quadrantDefinitions.map<CockpitPidMetric>((definition) => {
    const discovered = discoveredByPid.get(definition.pid);
    if (discovered) return discovered;
    const isAnnounced = normalizedSupportedPids.has(definition.pid);
    return {
      pid: definition.pid,
      label: definition.label,
      value: null,
      unit: definition.unit,
      severity: 'normal',
      freshness: 'missing',
      hint: !connectionStatus.ecuConnected
        ? 'ECU DESCONECTADA'
        : isAnnounced
          ? 'AGUARDANDO LEITURA REAL RECENTE • PID ' + definition.pid
          : 'PID ' + definition.pid + ' NÃO ANUNCIADO PELA ECU',
    };
  });
  const primaryPidSet = new Set<string>(quadrantDefinitions.map((definition) => definition.pid));
  const additionalMetrics = discoveredHeroMetrics
    .filter((metric) => !primaryPidSet.has(metric.pid))
    .slice(0, 20 - COCKPIT_QUADRANT_PAGE_SIZE);
  const abnormalMetrics = additionalMetrics.filter((metric) => metric.value != null && metric.severity !== 'normal');
  const orderedAdditionalMetrics: CockpitPidMetric[] = abnormalMetrics.length > 0
    ? [...abnormalMetrics, ...additionalMetrics.filter((metric) => !abnormalMetrics.includes(metric))]
    : additionalMetrics;
  const heroMetrics: CockpitPidMetric[] = [...primaryMetrics, ...orderedAdditionalMetrics];
  // Keep the first page stable; additional supported PIDs are paged after the main four.
  const visibleHeroMetrics: CockpitPidMetric[] = [...primaryMetrics, ...orderedAdditionalMetrics];
  const quadrantPageCount = Math.max(1, Math.ceil(visibleHeroMetrics.length / COCKPIT_QUADRANT_PAGE_SIZE));


  useEffect(() => {
    setActiveQuadrantPage(0);
  }, [quadrantPageCount, connectionStatus.ecuConnected]);

  useEffect(() => {
    if (quadrantPageCount <= 1) return;
    const timer = setInterval(() => {
      setActiveQuadrantPage((current) => (current + 1) % quadrantPageCount);
    }, 10_000);
    return () => clearInterval(timer);
  }, [quadrantPageCount]);

  const currentQuadrantPage = activeQuadrantPage % quadrantPageCount;
  const quadrantPageMetrics = getCockpitMetricPage(visibleHeroMetrics, currentQuadrantPage);
  const displayedQuadrantMetrics: CockpitPidMetric[] = Array.from(
    { length: COCKPIT_QUADRANT_PAGE_SIZE },
    (_, index): CockpitPidMetric => quadrantPageMetrics[index] ?? {
      pid: 'EMPTY-' + currentQuadrantPage + '-' + index,
      label: 'SEM OUTRO PID',
      value: null,
      unit: '',
      severity: 'normal',
      freshness: 'missing',
      hint: 'NENHUM OUTRO PID NESTA PÁGINA',
    },
  );
  const obdErrorText = (bluetoothError ?? getSharedObdLastError() ?? '').toUpperCase();
  const ecuProbeFailed = /ECU NÃO RESPONDEU AO 010C|ECU NÃO VALIDADA|ECU SEM RESPOSTA/.test(obdErrorText);

  const connectionLabel = connectionStatus.ecuResponseState === 'NO_RESPONSE'
    ? 'ECU SEM RESPOSTA'
    : connectionStatus.ecuResponseState === 'RECOVERING'
      ? 'RECUPERANDO ECU'
      : connectionStatus.ecuConnected
        ? 'ECU CONECTADA'
        : bluetoothSearching
          ? 'CONECTANDO ELM327'
          : ecuProbeFailed
            ? 'ECU SEM RESPOSTA'
            : connectionStatus.bluetoothConnected
              ? 'BLUETOOTH ATIVO'
              : bluetoothError
                ? 'FALHA BLUETOOTH'
                : 'ECU DESCONECTADA';
  const obdSessionDetail = connectionStatus.ecuConnected
    ? 'LEITURAS OBD REAIS DISPONÍVEIS'
    : connectionStatus.ecuResponseState === 'NO_RESPONSE'
      ? 'ADAPTADOR PRESENTE, MAS A ECU NÃO RESPONDE'
      : bluetoothSearching
        ? 'PROCURANDO UM ADAPTADOR ELM327 PAREADO'
        : ecuProbeFailed
          ? 'O PID 010C NÃO TEVE RESPOSTA VÁLIDA. ABRA DIAGNÓSTICO PARA VER O RX.'
          : connectionStatus.bluetoothConnected
            ? 'BLUETOOTH ATIVO, MAS A ECU AINDA NÃO FOI VALIDADA'
            : bluetoothError
              ? 'TOQUE PARA ABRIR A TELA DE CONEXÃO E TENTAR NOVAMENTE'
              : 'CONECTE O ELM327 PARA LER DADOS REAIS DO VEÍCULO';

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" backgroundColor={COLORS.screen} />
      <View style={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.screenFrame, layout.landscape && styles.screenFrameLandscape, { maxWidth: layout.maxContentWidth }]}>
          <View style={[styles.topSection, layout.landscape && styles.topSectionLandscape]}>
            <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
              <View style={styles.headerTitle}>
                <Text style={styles.brand} numberOfLines={1}>SMART OBD DIAGNOSTIC</Text>
                <Text style={styles.subtitle} numberOfLines={1}>COCKPIT DE DIAGNÓSTICO</Text>
              </View>
              <View style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionStatus.ecuConnected ? 'ECU OK' : connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'SEM RESPOSTA' : connectionStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : bluetoothSearching ? 'CONECTANDO' : connectionStatus.bluetoothConnected ? 'BT ATIVO' : bluetoothError ? 'FALHA' : 'SEM CONEXÃO'}</Text></View>
            </View>
            <View style={[styles.infoStrip, layout.landscape && styles.infoStripLandscape]}>
              <View style={styles.weatherContent}>
                <View style={[styles.weatherIconWrap, layout.landscape && styles.weatherIconWrapLandscape]}>
                  <AppIcon name="weather" size={24} color={COLORS.accent} />
                </View>
                <View style={styles.weatherDetails}>
                  <Text style={[styles.weatherCity, layout.landscape && styles.weatherCityLandscape]} numberOfLines={layout.landscape ? 1 : 2}>
                    {(locationLabels[locationLabelIndex % locationLabels.length] ?? 'CLIMA LOCAL').toLocaleUpperCase('pt-BR')}
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
          <View style={[styles.mainContent, layout.landscape && styles.mainContentLandscape]}>
          <View style={[styles.heroCard, layout.landscape && styles.heroCardLandscape]}>
            <View style={[styles.quadrantHeader, layout.landscape && styles.quadrantHeaderLandscape]}>
              <View style={styles.quadrantHeaderCopy}>
                <Text style={styles.quadrantTitle}>DADOS OBD EM TEMPO REAL</Text>
                <Text style={styles.quadrantSubtitle}>
                  {discoveredHeroMetrics.length > 0
                    ? 'PIDs suportados • ' + heroMetrics.length + ' indicadores no carrossel'
                    : connectionStatus.ecuConnected
                      ? 'ECU CONECTADA • AGUARDANDO LEITURAS VÁLIDAS'
                      : 'CONECTE A ECU PARA LIBERAR OS QUADRANTES'}
                </Text>
              </View>
              <View style={styles.quadrantControls}>
                <TouchableOpacity
                  style={[styles.quadrantNavButton, quadrantPageCount <= 1 && styles.quadrantNavButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={'Página anterior dos PIDs; página ' + (currentQuadrantPage + 1) + ' de ' + quadrantPageCount}
                  disabled={quadrantPageCount <= 1}
                  onPress={() => setActiveQuadrantPage((current) => (current - 1 + quadrantPageCount) % quadrantPageCount)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.quadrantNavGlyph}>‹</Text>
                </TouchableOpacity>
                <View style={styles.quadrantPageButton} accessible accessibilityLabel={'Página ' + (currentQuadrantPage + 1) + ' de ' + quadrantPageCount}>
                  <AppIcon name="refresh" size={12} color={COLORS.textSubtle} />
                  <Text style={styles.quadrantPageText}>{currentQuadrantPage + 1}/{quadrantPageCount}</Text>
                </View>
                <TouchableOpacity
                  style={[styles.quadrantNavButton, quadrantPageCount <= 1 && styles.quadrantNavButtonDisabled]}
                  accessibilityRole="button"
                  accessibilityLabel={'Próxima página dos PIDs; página ' + (currentQuadrantPage + 1) + ' de ' + quadrantPageCount}
                  disabled={quadrantPageCount <= 1}
                  onPress={() => setActiveQuadrantPage((current) => (current + 1) % quadrantPageCount)}
                  activeOpacity={0.75}
                >
                  <Text style={styles.quadrantNavGlyph}>›</Text>
                </TouchableOpacity>
              </View>
            </View>
            <View style={[styles.quadrantGrid, layout.landscape && styles.quadrantGridLandscape]}>
              {displayedQuadrantMetrics.map((metric, index) => (
                <View
                  key={metric.pid || 'quadrant-' + index}
                  style={[
                    styles.quadrantCard,
                    layout.landscape && styles.quadrantCardLandscape,
                    metric.severity === 'danger' && styles.quadrantCardDanger,
                    metric.severity === 'warning' && styles.quadrantCardWarning,
                  ]}
                >
                  <Text style={[styles.quadrantLabel, layout.landscape && styles.quadrantLabelLandscape]} numberOfLines={layout.landscape ? 1 : 2}>{metric.label}</Text>
                  <View style={[styles.quadrantValueRow, layout.landscape && styles.quadrantValueRowLandscape]}>
                    <Text style={[
                      styles.quadrantValue,
                      layout.landscape && styles.quadrantValueLandscape,
                      metric.severity === 'danger' && styles.danger,
                      metric.severity === 'warning' && styles.heroWarning,
                    ]}>
                      {metric.value == null ? 'N/D' : Number.isInteger(metric.value) ? String(metric.value) : metric.value.toFixed(1)}
                    </Text>
                    {metric.value != null && !!metric.unit && <Text style={styles.quadrantUnit}>{metric.unit}</Text>}
                  </View>
                  <Text style={[styles.quadrantHint, layout.landscape && styles.quadrantHintLandscape]} numberOfLines={layout.landscape ? 1 : 2}>{metric.hint}</Text>
                </View>
              ))}
            </View>
            <Text style={[styles.quadrantInstruction, layout.landscape && styles.quadrantInstructionLandscape]}>
              {quadrantPageCount > 1
                ? 'USE ‹ / › OU AGUARDE 10 S • 4 QUADRANTES POR PÁGINA'
                : connectionStatus.ecuConnected
                  ? 'N/D ATÉ EXISTIR LEITURA REAL, COMPLETA E RECENTE'
                  : 'OS QUADRANTES FICAM PRONTOS APÓS VALIDAR A ECU'}
            </Text>
            <View style={[styles.metricRow, layout.landscape && styles.metricRowLandscape]}>
              <CockpitMetric compact={layout.landscape} label={consumptionLabel} value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
              <CockpitMetric compact={layout.landscape} label="AUTONOMIA ATUAL" value={currentAutonomyKm != null ? Math.round(currentAutonomyKm) + ' km' : 'N/D'} />
              <CockpitMetric compact={layout.landscape} label="PRESSÃO DO COLETOR" value={manifoldPressureKpa != null ? manifoldPressureKpa.toFixed(0) + ' kPa' : 'N/D'} />
            </View>
          </View>
          <Link href="/bluetooth" asChild>
            <TouchableOpacity
              style={[styles.sessionCard, layout.landscape && styles.sessionCardLandscape]}
              accessibilityRole="button"
              accessibilityLabel="Abrir configurações de conexão do veículo"
              accessibilityHint="Abre o adaptador ELM327 e a validação da ECU"
              activeOpacity={0.78}
            >
              <View style={[styles.sessionIconWrap, connectionStatus.ecuConnected && styles.sessionIconWrapOk]}>
                <AppIcon
                  name={connectionStatus.ecuConnected ? 'check' : bluetoothError ? 'warning' : 'bluetooth'}
                  size={22}
                  color={connectionStatus.ecuConnected ? COLORS.success : bluetoothError ? COLORS.danger : COLORS.accent}
                />
              </View>
              <View style={[styles.sessionCopy, layout.landscape && styles.sessionCopyLandscape]}>
                <Text style={styles.sessionTitle}>SESSÃO DE DIAGNÓSTICO</Text>
                <Text style={styles.sessionHeadline} numberOfLines={2}>{connectionLabel}</Text>
                <Text style={styles.sessionDetail} numberOfLines={2}>{obdSessionDetail}</Text>
              </View>
              {!layout.landscape && <AppIcon name="arrowRight" size={18} color={COLORS.textSubtle} />}
            </TouchableOpacity>
          </Link>
          </View>
          <View style={[styles.layoutSpacer, layout.landscape && styles.layoutSpacerLandscape]} />
          <View style={[styles.bottomNav, layout.landscape && styles.bottomNavLandscape]}>
            <Link href="/" asChild><TouchableOpacity style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape, styles.bottomNavActive]} accessibilityRole="button" accessibilityLabel="Painel, tela atual" accessibilityHint="Exibe o cockpit do veículo" accessibilityState={{ selected: true }} activeOpacity={0.72}><AppIcon name="cockpit" size={22} color=COLORS.textStrong /><Text style={[styles.bottomNavText, styles.bottomNavTextActive]}>Painel</Text></TouchableOpacity></Link>
            <Link href="/laboratorio" asChild><TouchableOpacity style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]} accessibilityRole="button" accessibilityLabel="Diagnóstico" accessibilityHint="Abre os testes e as consultas OBD" activeOpacity={0.72}><AppIcon name="diagnostic" size={22} color={COLORS.accent} /><Text style={styles.bottomNavText}>Diagnóstico</Text></TouchableOpacity></Link>
            <Link href="/dados" asChild><TouchableOpacity style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]} accessibilityRole="button" accessibilityLabel="Dados" accessibilityHint="Abre gráficos e leituras de telemetria" activeOpacity={0.72}><AppIcon name="data" size={22} color={COLORS.accent} /><Text style={styles.bottomNavText}>Dados</Text></TouchableOpacity></Link>
            <Link href="/viagens" asChild><TouchableOpacity style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]} accessibilityRole="button" accessibilityLabel="Viagens" accessibilityHint="Abre o histórico de trajetos registrados" activeOpacity={0.72}><AppIcon name="trips" size={22} color={COLORS.accent} /><Text style={styles.bottomNavText}>Viagens</Text></TouchableOpacity></Link>
            <Link href="/mais" asChild><TouchableOpacity style={[styles.bottomNavItem, layout.landscape && styles.bottomNavItemLandscape]} accessibilityRole="button" accessibilityLabel="Mais recursos" accessibilityHint="Abre os módulos adicionais do aplicativo" activeOpacity={0.72}><AppIcon name="more" size={22} color={COLORS.accent} /><Text style={styles.bottomNavText}>Mais</Text></TouchableOpacity></Link>
          </View>
          <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO...' : saveStatus.obdSessionActive ? 'DIÁRIO DE BORDO • GRAVANDO' : 'DIÁRIO DE BORDO • AGUARDANDO ECU'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function CockpitMetric({ label, value, compact = false }: { label: string; value: string; compact?: boolean }) {
  return (
    <View style={[styles.cockpitMetric, compact && styles.cockpitMetricCompact]}>
      <Text style={[styles.metricLabel, compact && styles.metricLabelCompact]}>{label}</Text>
      <Text style={[styles.metricValue, compact && styles.metricValueCompact]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:COLORS.screen},content:{flex:1,width:'100%',paddingVertical:6,paddingBottom:6},screenFrame:{width:'100%',flex:1,alignSelf:'center'},screenFrameLandscape:{paddingRight:56},topSection:{marginBottom:8},topSectionLandscape:{flexDirection:'row',alignItems:'stretch',gap:8,marginBottom:5},mainContent:{width:'100%',flexDirection:'column',minWidth:0},mainContentLandscape:{flex:1,flexDirection:'row',alignItems:'stretch',gap:8,minHeight:0},layoutSpacer:{flexGrow:1,minHeight:8},layoutSpacerLandscape:{flexGrow:0,minHeight:0,height:4},
  infoStrip:{minHeight:88,flexDirection:'row',alignItems:'center',gap:9,paddingHorizontal:10,paddingVertical:8,backgroundColor:COLORS.surface,borderRadius:13,borderWidth:1,borderColor:COLORS.border},infoStripLandscape:{flex:1,minWidth:0,minHeight:54,paddingHorizontal:8,paddingVertical:4,gap:6},
  weatherContent:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:9},weatherIconWrap:{width:42,height:42,borderRadius:12,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.surfaceInset,borderWidth:1,borderColor:COLORS.border},weatherIconWrapLandscape:{width:34,height:34,borderRadius:10},weatherDetails:{flex:1,minWidth:0,gap:2},weatherCity:{color:COLORS.textStrong,fontSize:15,lineHeight:18,fontWeight:'900',letterSpacing:.35},weatherCityLandscape:{fontSize:13,lineHeight:15},weatherMeta:{flexDirection:'row',alignItems:'center',gap:8,flexWrap:'wrap'},weatherTemperature:{color:COLORS.textStrong,fontSize:24,lineHeight:28,fontWeight:'900',fontVariant:['tabular-nums']},weatherTemperatureLandscape:{fontSize:20,lineHeight:23},weatherDescription:{flexShrink:1,color:COLORS.textMuted,fontSize:12,lineHeight:16,fontWeight:'800'},weatherDescriptionLandscape:{fontSize:10,lineHeight:13},
  
  networkChip:{minHeight:64,minWidth:96,maxWidth:112,alignItems:'stretch',justifyContent:'center',paddingHorizontal:7,paddingVertical:6,backgroundColor:COLORS.surfaceInset,borderRadius:11,borderWidth:1,borderColor:COLORS.border},networkChipLandscape:{minHeight:50,minWidth:82,maxWidth:92,paddingHorizontal:5,paddingVertical:4},
  header:{backgroundColor:COLORS.surface,borderRadius:16,borderWidth:1,borderColor:COLORS.border,padding:14,marginBottom:8,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:10},headerLandscape:{flex:0.9,minWidth:0,paddingVertical:8,paddingHorizontal:10,marginBottom:0},headerTitle:{flex:1,minWidth:0},brand:{color:COLORS.textStrong,fontSize:18,fontWeight:'900',letterSpacing:1.2},subtitle:{color:COLORS.accent,fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3},
  connectionPill:{flexDirection:'row',alignItems:'center',gap:6,flexShrink:0,backgroundColor:'#091526',borderRadius:20,borderWidth:1,borderColor:'#29415f',paddingHorizontal:10,paddingVertical:7},dot:{width:8,height:8,borderRadius:4},dotOk:{backgroundColor:COLORS.success},dotWarn:{backgroundColor:COLORS.warning},dotDanger:{backgroundColor:COLORS.danger},connectionText:{color:'#dbeafe',fontSize:9,fontWeight:'900'},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:12,alignItems:'center',marginBottom:8},heroCardWarning:{borderColor:COLORS.warning,backgroundColor:'#2a2412'},heroCardDanger:{borderColor:COLORS.danger,backgroundColor:'#2b1420'},heroCardLandscape:{flex:1,minWidth:0,padding:6,marginBottom:0,justifyContent:'center'},heroReadout:{width:'100%',alignItems:'center',paddingVertical:1},heroEyebrow:{color:COLORS.accent,fontSize:10,fontWeight:'900',letterSpacing:1.4,textAlign:'center'},heroNumberRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:6},heroUnit:{color:'#a9c8ef',fontSize:18,fontWeight:'900'},heroSwitchHintRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginTop:4},heroSwitchHint:{color:'#6884a6',fontSize:8,fontWeight:'900',letterSpacing:.6},heroWarning:{color:COLORS.warning},heroValue:{color:COLORS.textStrong,fontSize:50,lineHeight:56,fontWeight:'900',marginTop:2,fontVariant:['tabular-nums']},heroValueLandscape:{fontSize:36,lineHeight:40,marginTop:0},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5,textAlign:'center'},
  metricRow:{width:'100%',flexDirection:'row',gap:6,marginTop:10},metricRowLandscape:{marginTop:3,gap:4},cockpitMetric:{flex:1,minWidth:0,backgroundColor:COLORS.surfaceInset,borderRadius:11,borderWidth:1,borderColor:'#233d5b',paddingVertical:9,paddingHorizontal:5,alignItems:'center'},cockpitMetricCompact:{paddingVertical:3,paddingHorizontal:3,borderRadius:8},metricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3,textAlign:'center'},metricLabelCompact:{fontSize:7,letterSpacing:0,lineHeight:9},metricValue:{color:COLORS.text,fontSize:12,fontWeight:'900',marginTop:3,textAlign:'center'},metricValueCompact:{fontSize:10,marginTop:1},
  quadrantHeader:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8,marginBottom:10},quadrantHeaderLandscape:{marginBottom:4},
  quadrantHeaderCopy:{flex:1,minWidth:0},
  quadrantTitle:{color:COLORS.accent,fontSize:10,fontWeight:'900',letterSpacing:1.2},
  quadrantSubtitle:{color:'#849ab5',fontSize:8,fontWeight:'800',marginTop:3},
  quadrantControls:{flexDirection:'row',alignItems:'center',gap:4},
  quadrantNavButton:{width:30,height:32,alignItems:'center',justifyContent:'center',borderRadius:9,borderWidth:1,borderColor:'#294562',backgroundColor:COLORS.surfaceInset},
  quadrantNavButtonDisabled:{opacity:0.4},
  quadrantNavGlyph:{color:'#a9c8ef',fontSize:23,lineHeight:25,fontWeight:'700'},
  quadrantPageButton:{flexDirection:'row',alignItems:'center',gap:4,paddingVertical:7,paddingHorizontal:9,borderRadius:9,borderWidth:1,borderColor:'#294562',backgroundColor:COLORS.surfaceInset},
  quadrantPageText:{color:'#a9c8ef',fontSize:9,fontWeight:'900'},
  quadrantGrid:{width:'100%',flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8},
  quadrantGridLandscape:{gap:5},
  quadrantCard:{width:'48%',minHeight:91,paddingVertical:10,paddingHorizontal:9,backgroundColor:COLORS.surfaceInset,borderRadius:12,borderWidth:1,borderColor:'#294562'},
  quadrantCardLandscape:{minHeight:54,paddingVertical:4,paddingHorizontal:6},
  quadrantCardWarning:{borderColor:COLORS.warning,backgroundColor:'#2a2412'},
  quadrantCardDanger:{borderColor:COLORS.danger,backgroundColor:'#2b1420'},
  quadrantLabel:{color:'#9fb7d5',fontSize:8,fontWeight:'900',letterSpacing:.4},quadrantLabelLandscape:{fontSize:8,lineHeight:9,letterSpacing:0},
  quadrantValueRow:{flexDirection:'row',alignItems:'baseline',gap:4,marginTop:5},quadrantValueRowLandscape:{marginTop:2,gap:3},
  quadrantValue:{color:COLORS.textStrong,fontSize:25,lineHeight:29,fontWeight:'900',fontVariant:['tabular-nums']},quadrantValueLandscape:{fontSize:21,lineHeight:22},
  quadrantUnit:{color:'#a9c8ef',fontSize:10,fontWeight:'900'},
  quadrantHint:{color:'#6884a6',fontSize:7,fontWeight:'800',marginTop:3},quadrantHintLandscape:{fontSize:8,lineHeight:9,marginTop:1},
  quadrantInstruction:{color:'#6884a6',fontSize:7,fontWeight:'900',letterSpacing:.4,textAlign:'center',marginTop:7},quadrantInstructionLandscape:{fontSize:7,lineHeight:9,letterSpacing:0,marginTop:3},
  coolantCard:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:9,paddingHorizontal:13,paddingVertical:11,backgroundColor:COLORS.surfaceInset,borderRadius:12,borderWidth:1,borderColor:'#315579'},coolantCardLandscape:{marginTop:4,paddingVertical:5,paddingHorizontal:9},coolantCopy:{flex:1,minWidth:0},coolantHeading:{flexDirection:'row',alignItems:'center',gap:5},coolantLabel:{color:'#c5d8f2',fontSize:9,fontWeight:'900',letterSpacing:.4},coolantStatus:{color:COLORS.textSubtle,fontSize:8,fontWeight:'800',marginTop:4},coolantValue:{fontSize:23,fontWeight:'900',fontVariant:['tabular-nums']},coolantOk:{color:COLORS.success},coolantWarning:{color:COLORS.warning},coolantUnavailable:{color:'#8fa6c1'},
  danger:{color:COLORS.danger},
  sessionCard:{minHeight:68,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:10,backgroundColor:COLORS.surface,borderRadius:13,borderWidth:1,borderColor:COLORS.border,marginBottom:8},sessionCardLandscape:{width:166,flexGrow:0,flexShrink:0,minHeight:56,alignSelf:'stretch',flexDirection:'column',alignItems:'center',justifyContent:'center',gap:5,paddingHorizontal:8,paddingVertical:7,marginBottom:0},sessionIconWrap:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:COLORS.surfaceInset,borderWidth:1,borderColor:'#29415f'},sessionIconWrapOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},sessionCopy:{flex:1,minWidth:0,gap:2},sessionCopyLandscape:{flex:0,width:'100%',alignItems:'center'},sessionTitle:{color:COLORS.accent,fontSize:8,fontWeight:'900',letterSpacing:.7},sessionHeadline:{color:COLORS.text,fontSize:10,fontWeight:'900'},sessionDetail:{color:'#8fa6c1',fontSize:8,lineHeight:12,textAlign:'center'},
  connectionCard:{backgroundColor:COLORS.surface,borderRadius:15,borderWidth:1,borderColor:COLORS.border,padding:14,marginBottom:10},chain:{flexDirection:'row',alignItems:'center',marginTop:10},chainStep:{flex:1,alignItems:'center'},chainCircle:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#3b516b',backgroundColor:'#0a1727'},chainCircleOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},chainCircleText:{color:COLORS.textSubtle,fontSize:11,fontWeight:'900'},chainCircleTextOk:{color:COLORS.success},chainLabel:{color:COLORS.textMuted,fontSize:8,fontWeight:'900',marginTop:4},chainArrow:{color:'#526a86',fontSize:24,paddingHorizontal:4},
  
  statusGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:2},statusGridLandscape:{flexWrap:'nowrap',gap:8},statusCardLandscape:{width:'auto',flex:1},statusCard:{width:'48%',minWidth:0,backgroundColor:COLORS.surface,borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:8},moreButton:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:COLORS.surface,borderRadius:14,borderWidth:1,borderColor:COLORS.border,padding:13,marginTop:2},moreIcon:{color:COLORS.accent,fontSize:24,fontWeight:'900'},moreBody:{flex:1,minWidth:0},moreTitle:{color:COLORS.text,fontSize:11,fontWeight:'900'},moreHint:{color:COLORS.textSubtle,fontSize:8,marginTop:3,flexShrink:1},moreArrow:{color:COLORS.accent,fontSize:24},
  error:{color:COLORS.danger,fontWeight:'800',fontSize:10,marginTop:8},bottomNav:{flexDirection:'row',backgroundColor:COLORS.surface,borderRadius:14,borderWidth:1,borderColor:COLORS.border,marginTop:0,padding:4,gap:2},bottomNavLandscape:{position:'absolute',right:0,top:0,bottom:20,width:50,flexDirection:'column',justifyContent:'space-around',marginTop:0,padding:3,gap:2},bottomNavItemLandscape:{flex:0,minWidth:0,minHeight:48,paddingHorizontal:0,paddingVertical:2,gap:1},bottomNavItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',minHeight:58,borderRadius:10,paddingHorizontal:1,paddingVertical:4,gap:3},bottomNavActive:{backgroundColor:'#152a45'},bottomNavText:{color:COLORS.accent,fontSize:8,fontWeight:'900',textAlign:'center'},bottomNavTextActive:{color:COLORS.textStrong},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
