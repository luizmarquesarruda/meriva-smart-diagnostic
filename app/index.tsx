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
import { buildCockpitPidMetrics, type CockpitPidMetric } from '../src/obd/cockpitTelemetry';

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
  const [dtcCount, setDtcCount] = useState(0);
  const [activeHeroMetric, setActiveHeroMetric] = useState(0);
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
  const coolantReading = freshRealReading((item) => item.pid === '0105' || /coolant|arrefecimento|temperatura.*motor/i.test(item.name));
  const coolantValue = coolantReading?.value ?? null;
  const speedReading = freshRealReading((item) => item.pid === '010D' || /speed|velocidade/i.test(item.name));
  const currentSpeedKmh = speedReading?.value ?? null;
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
  const fallbackHeroMetrics: CockpitPidMetric[] = [{
    pid: '',
    label: 'DADOS OBD EM TEMPO REAL',
    value: null,
    unit: '',
    severity: 'normal',
    freshness: 'missing',
    hint: connectionStatus.ecuConnected
      ? 'NENHUM DOS PIDs DO PAINEL FOI ANUNCIADO PELA ECU'
      : 'CONECTE A ECU PARA IDENTIFICAR OS PIDs SUPORTADOS',
  }];
  const heroMetrics: CockpitPidMetric[] = discoveredHeroMetrics.length > 0
    ? discoveredHeroMetrics
    : fallbackHeroMetrics;
  const abnormalMetrics = heroMetrics.filter((metric) => metric.value != null && metric.severity !== 'normal');
  const visibleHeroMetrics = abnormalMetrics.length > 0 ? abnormalMetrics : heroMetrics;

  // O painel roda os PIDs realmente anunciados pela ECU a cada 10 s.
  // Quando existe alerta, exibe apenas as leituras em alerta até serem resolvidas.
  useEffect(() => {
    const timer = setInterval(() => {
      setActiveHeroMetric((current) => (current + 1) % Math.max(1, visibleHeroMetrics.length));
    }, 10_000);
    return () => clearInterval(timer);
  }, [visibleHeroMetrics.length]);

  const activeMetricIndex = activeHeroMetric % Math.max(1, visibleHeroMetrics.length);
  const selectedHeroMetric = visibleHeroMetrics[activeMetricIndex] ?? visibleHeroMetrics[0];
  const coolantStatus = coolantValue != null && coolantValue >= 115
    ? 'TEMPERATURA ALTA'
    : coolantValue != null && coolantValue >= 110
      ? 'ATENÇÃO'
      : coolantValue != null ? 'LEITURA REAL • PID 0105' : connectionStatus.ecuConnected ? 'AGUARDANDO PID 0105' : 'ECU DESCONECTADA';
  const connectionLabel = connectionStatus.ecuResponseState === 'NO_RESPONSE'
    ? 'ECU SEM RESPOSTA'
    : connectionStatus.ecuResponseState === 'RECOVERING'
      ? 'RECUPERANDO ECU'
      : connectionStatus.ecuConnected
        ? 'ECU CONECTADA'
        : bluetoothSearching
          ? 'CONECTANDO ELM327'
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
        : connectionStatus.bluetoothConnected
          ? 'BLUETOOTH ATIVO, MAS A ECU AINDA NÃO FOI VALIDADA'
          : bluetoothError
            ? 'TOQUE PARA ABRIR A TELA DE CONEXÃO E TENTAR NOVAMENTE'
            : 'CONECTE O ELM327 PARA LER DADOS REAIS DO VEÍCULO';

  return (
    <SafeAreaView style={styles.container} edges={["top", "bottom", "left", "right"]}>
      <StatusBar style="light" backgroundColor={COLORS.screen} />
      <View style={[styles.content, { paddingHorizontal: layout.horizontalPadding }]}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.topSection}>
            <View style={[styles.header, layout.landscape && styles.headerLandscape]}>
              <View style={styles.headerTitle}>
                <Text style={styles.brand} numberOfLines={1}>MERIVA SMART</Text>
                <Text style={styles.subtitle} numberOfLines={1}>MERIVA MAXX 1.4</Text>
              </View>
              <View style={styles.connectionPill}><View style={[styles.dot, connectionStatus.ecuConnected ? styles.dotOk : bluetoothError ? styles.dotDanger : styles.dotWarn]} /><Text style={styles.connectionText}>{connectionLabel}</Text></View>
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
          <Link href="/bluetooth" asChild>
            <TouchableOpacity
              style={[styles.sessionCard, layout.landscape && styles.sessionCardLandscape]}
              accessibilityRole="button"
              accessibilityLabel="Abrir configurações de conexão do veículo"
              accessibilityHint="Abre os estados independentes do Bluetooth e da ECU"
              activeOpacity={0.78}
            >
              <View style={styles.connectionSummaryGrid}>
                <View style={styles.connectionSummaryCell}>
                  <Text style={styles.connectionSummaryLabel}>BLUETOOTH</Text>
                  <Text
                    style={[
                      styles.connectionSummaryValue,
                      connectionStatus.bluetoothConnected && styles.connectedText,
                      !connectionStatus.bluetoothConnected && !!bluetoothError && styles.danger,
                    ]}
                    numberOfLines={1}
                  >
                    {connectionStatus.bluetoothConnected
                      ? 'CONECTADO'
                      : bluetoothSearching
                        ? 'PROCURANDO'
                        : bluetoothError
                          ? 'ERRO'
                          : 'DESCONECTADO'}
                  </Text>
                </View>
                <View style={styles.connectionSummaryCell}>
                  <Text style={styles.connectionSummaryLabel}>ELM327 / ECU</Text>
                  <Text
                    style={[
                      styles.connectionSummaryValue,
                      connectionStatus.ecuConnected && styles.connectedText,
                      !connectionStatus.ecuConnected && connectionStatus.ecuResponseState === 'NO_RESPONSE' && styles.danger,
                    ]}
                    numberOfLines={1}
                  >
                    {connectionStatus.ecuConnected
                      ? dtcCount > 0 ? 'CONECTADA • ' + dtcCount + ' DTC' : 'CONECTADA'
                      : connectionStatus.ecuResponseState === 'NO_RESPONSE'
                        ? 'SEM RESPOSTA'
                        : connectionStatus.bluetoothConnected
                          ? 'AGUARDANDO ECU'
                          : 'DESCONECTADA'}
                  </Text>
                </View>
              </View>
              <AppIcon name="arrowRight" size={18} color={COLORS.textSubtle} />
            </TouchableOpacity>
          </Link>

          <View style={[styles.primaryMetricGrid, layout.landscape && styles.primaryMetricGridLandscape]}>
            <PrimaryMetric
              icon="battery"
              label="AUTONOMIA"
              value={currentAutonomyKm != null ? Math.round(currentAutonomyKm) + ' km' : 'N/D'}
              detail={currentAutonomyKm != null ? 'NÍVEL ATUAL VALIDADO' : 'AGUARDANDO NÍVEL VÁLIDO'}
              landscape={layout.landscape}
            />
            <PrimaryMetric
              icon="cockpit"
              label="CONSUMO"
              value={availableConsumptionKml != null ? availableConsumptionKml.toFixed(1) + ' km/L' : 'N/D'}
              detail={consumptionLabel}
              landscape={layout.landscape}
            />
          </View>

          <View style={[styles.secondaryGrid, layout.landscape && styles.secondaryGridLandscape]}>
            <SecondaryMetric
              label="VELOCIDADE"
              value={currentSpeedKmh != null ? Math.round(currentSpeedKmh) + ' km/h' : 'N/D'}
              detail={speedReading ? 'LEITURA REAL OBD' : 'PID 010D INDISPONÍVEL'}
              landscape={layout.landscape}
            />
            <SecondaryMetric
              label="DISTÂNCIA"
              value={tripState.active && tripState.distanceKm > 0 ? tripState.distanceKm.toFixed(1) + ' km' : 'N/D'}
              detail={tripState.active ? 'VIAGEM EM REGISTRO' : 'AGUARDANDO VIAGEM'}
              landscape={layout.landscape}
            />
            <SecondaryMetric
              label="LÍQUIDO DE ARREFECIMENTO"
              value={coolantValue != null ? Math.round(coolantValue) + ' °C' : 'N/D'}
              detail={'LÍQUIDO DE ARREFECIMENTO • ' + coolantStatus}
              status={coolantValue == null ? 'neutral' : coolantValue >= 115 ? 'danger' : coolantValue >= 110 ? 'warning' : 'ok'}
              landscape={layout.landscape}
            />
            <SecondaryMetric
              label="DTC REGISTRADOS"
              value={!connectionStatus.ecuConnected ? 'N/D' : dtcCount > 0 ? String(dtcCount) + ' DTC' : 'N/D'}
              detail={!connectionStatus.ecuConnected
                ? 'ECU NÃO VALIDADA'
                : dtcCount > 0
                  ? 'REGISTROS SALVOS • CONFIRMAR'
                  : 'VARREDURA NÃO CONFIRMADA'}
              status={!connectionStatus.ecuConnected ? 'neutral' : dtcCount > 0 ? 'warning' : 'neutral'}
              landscape={layout.landscape}
            />
          </View>

          <View style={[styles.heroCard, layout.landscape && styles.heroCardLandscape, selectedHeroMetric.severity === 'danger' && styles.heroCardDanger, selectedHeroMetric.severity === 'warning' && styles.heroCardWarning]}>
            <TouchableOpacity
              accessibilityRole="button"
              accessibilityLabel={selectedHeroMetric.label + (abnormalMetrics.length > 0 ? '. Indicador prioritário devido a uma leitura fora da referência monitorada' : '. Toque para trocar o indicador')}
              onPress={() => setActiveHeroMetric((current) => (current + 1) % Math.max(1, visibleHeroMetrics.length))}
              activeOpacity={0.82}
              style={styles.heroReadout}
            >
              <Text style={styles.heroEyebrow}>{selectedHeroMetric.label}</Text>
              <View style={styles.heroNumberRow}>
                <Text style={[styles.heroValue, layout.landscape && styles.heroValueLandscape, selectedHeroMetric.severity === 'danger' && styles.danger, selectedHeroMetric.severity === 'warning' && styles.heroWarning]}>{selectedHeroMetric.value == null ? 'N/D' : Number.isInteger(selectedHeroMetric.value) ? String(selectedHeroMetric.value) : selectedHeroMetric.value.toFixed(1)}</Text>
                {!!selectedHeroMetric.unit && <Text style={styles.heroUnit}>{selectedHeroMetric.unit}</Text>}
              </View>
              <Text style={styles.heroState}>{selectedHeroMetric.hint}</Text>
              <View style={styles.heroSwitchHintRow}>
                <AppIcon name="refresh" size={10} color={COLORS.textSubtle} />
                <Text style={styles.heroSwitchHint}>{abnormalMetrics.length > 0 ? 'ALERTAS' : 'PIDs'} {activeMetricIndex + 1}/{visibleHeroMetrics.length}  •  {selectedHeroMetric.pid || 'OBD'}  •  TOQUE PARA TROCAR  •  10 S</Text>
              </View>
            </TouchableOpacity>
          </View>
          <View style={styles.layoutSpacer} />
          <View style={[styles.bottomNav, layout.landscape && styles.bottomNavLandscape]}>
            <Link href="/" asChild><TouchableOpacity style={[styles.bottomNavItem, styles.bottomNavActive]} accessibilityRole="button" accessibilityLabel="Painel, tela atual" accessibilityHint="Exibe o cockpit do veículo" accessibilityState={{ selected: true }} activeOpacity={0.72}><AppIcon name="cockpit" size={32} color="#f8fafc" /></TouchableOpacity></Link>
            <Link href="/bluetooth" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Conexões Bluetooth e ECU" accessibilityHint="Abre o estado do Bluetooth e a conexão ELM327" activeOpacity={0.72}><AppIcon name="bluetooth" size={32} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/saude" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Diagnóstico" accessibilityHint="Abre falhas, evidências e hipóteses locais" activeOpacity={0.72}><AppIcon name="health" size={32} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/viagens" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Viagem" accessibilityHint="Abre o histórico de viagens e ciclos registrados" activeOpacity={0.72}><AppIcon name="trips" size={32} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/laboratorio" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Laboratório" accessibilityHint="Abre PIDs, respostas OBD e ferramentas técnicas" activeOpacity={0.72}><AppIcon name="sensors" size={32} color={COLORS.accent} /></TouchableOpacity></Link>
            <Link href="/configuracoes" asChild><TouchableOpacity style={styles.bottomNavItem} accessibilityRole="button" accessibilityLabel="Configurações" accessibilityHint="Abre preferências, armazenamento e opções do aplicativo" activeOpacity={0.72}><AppIcon name="settings" size={32} color={COLORS.accent} /></TouchableOpacity></Link>
          </View>
          <Text style={styles.footerStatus}>{!isHydrated ? 'CARREGANDO...' : saveStatus.obdSessionActive ? 'DIÁRIO DE BORDO • GRAVANDO' : 'DIÁRIO DE BORDO • AGUARDANDO ECU'}</Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function PrimaryMetric({ icon, label, value, detail, landscape }: { icon: 'battery' | 'cockpit'; label: string; value: string; detail: string; landscape: boolean }) {
  return (
    <View style={[styles.primaryMetricCard, landscape && styles.primaryMetricCardLandscape]}>
      <View style={styles.primaryMetricHeading}>
        <AppIcon name={icon} size={16} color={COLORS.accent} />
        <Text style={styles.primaryMetricLabel}>{label}</Text>
      </View>
      <Text style={[styles.primaryMetricValue, landscape && styles.primaryMetricValueLandscape]} numberOfLines={1}>{value}</Text>
      <Text style={styles.primaryMetricDetail} numberOfLines={1}>{detail}</Text>
    </View>
  );
}

function SecondaryMetric({ label, value, detail, status = 'neutral', landscape }: { label: string; value: string; detail: string; status?: 'neutral' | 'ok' | 'warning' | 'danger'; landscape: boolean }) {
  const statusStyle = status === 'danger' ? styles.danger : status === 'warning' ? styles.coolantWarning : status === 'ok' ? styles.coolantOk : styles.coolantUnavailable;
  return (
    <View style={[styles.secondaryMetricCard, landscape && styles.secondaryMetricCardLandscape]}>
      <Text style={styles.secondaryMetricLabel}>{label}</Text>
      <Text style={[styles.secondaryMetricValue, landscape && styles.secondaryMetricValueLandscape, statusStyle]} numberOfLines={1}>{value}</Text>
      <Text style={styles.secondaryMetricDetail} numberOfLines={2}>{detail}</Text>
    </View>
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
  connectedText:{color:'#4ade80'},
  connectionSummaryGrid:{flex:1,minWidth:0,flexDirection:'row',alignItems:'center',gap:12},connectionSummaryCell:{flex:1,minWidth:0,gap:3},connectionSummaryLabel:{color:'#7db3ff',fontSize:8,fontWeight:'900',letterSpacing:.7},connectionSummaryValue:{color:'#e5edf7',fontSize:10,fontWeight:'900'},
  primaryMetricGrid:{width:'100%',flexDirection:'row',gap:10,marginBottom:8},primaryMetricGridLandscape:{gap:7,marginBottom:4},primaryMetricCard:{flex:1,minWidth:0,minHeight:82,justifyContent:'center',paddingHorizontal:12,paddingVertical:9,backgroundColor:'#0f2035',borderRadius:15,borderWidth:1,borderColor:'#2d5278'},primaryMetricCardLandscape:{minHeight:62,paddingHorizontal:8,paddingVertical:6},primaryMetricHeading:{flexDirection:'row',alignItems:'center',gap:6},primaryMetricLabel:{color:'#9aacc4',fontSize:9,fontWeight:'900',letterSpacing:.65},primaryMetricValue:{color:'#f8fafc',fontSize:25,lineHeight:29,fontWeight:'900',marginTop:5,fontVariant:['tabular-nums']},primaryMetricValueLandscape:{fontSize:20,lineHeight:23,marginTop:2},primaryMetricDetail:{color:'#8fa6c1',fontSize:7,fontWeight:'800',marginTop:3},
  secondaryGrid:{width:'100%',flexDirection:'row',flexWrap:'wrap',gap:7,marginBottom:8},secondaryGridLandscape:{flexWrap:'nowrap',gap:5,marginBottom:4},secondaryMetricCard:{width:'47%',flexBasis:'47%',minWidth:0,minHeight:62,justifyContent:'center',paddingHorizontal:7,paddingVertical:7,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b'},secondaryMetricCardLandscape:{width:'auto',flexBasis:0,flexGrow:1,minHeight:52,paddingHorizontal:5,paddingVertical:5},secondaryMetricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3},secondaryMetricValue:{color:'#e5edf7',fontSize:14,fontWeight:'900',marginTop:4,fontVariant:['tabular-nums']},secondaryMetricValueLandscape:{fontSize:12,marginTop:2},secondaryMetricDetail:{color:'#7185a1',fontSize:7,fontWeight:'800',marginTop:2},
  heroCard:{backgroundColor:'#0f2035',borderRadius:18,borderWidth:1,borderColor:'#2d5278',padding:12,alignItems:'center',marginBottom:8},heroCardWarning:{borderColor:'#fbbf24',backgroundColor:'#2a2412'},heroCardDanger:{borderColor:'#fb7185',backgroundColor:'#2b1420'},heroCardLandscape:{padding:7,marginBottom:4},heroReadout:{width:'100%',alignItems:'center',paddingVertical:1},heroEyebrow:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1.4,textAlign:'center'},heroNumberRow:{flexDirection:'row',alignItems:'baseline',justifyContent:'center',gap:6},heroUnit:{color:'#a9c8ef',fontSize:18,fontWeight:'900'},heroSwitchHintRow:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:4,marginTop:4},heroSwitchHint:{color:'#6884a6',fontSize:8,fontWeight:'900',letterSpacing:.6},heroWarning:{color:'#fbbf24'},heroValue:{color:'#f8fafc',fontSize:50,lineHeight:56,fontWeight:'900',marginTop:2,fontVariant:['tabular-nums']},heroValueLandscape:{fontSize:36,lineHeight:40,marginTop:0},heroState:{color:'#8fa6c1',fontSize:9,fontWeight:'800',letterSpacing:.5,textAlign:'center'},
  metricRow:{width:'100%',flexDirection:'row',gap:6,marginTop:10},metricRowLandscape:{marginTop:4},cockpitMetric:{flex:1,minWidth:0,backgroundColor:'#091626',borderRadius:11,borderWidth:1,borderColor:'#233d5b',paddingVertical:9,paddingHorizontal:5,alignItems:'center'},metricLabel:{color:'#9aacc4',fontSize:8,fontWeight:'900',letterSpacing:.3,textAlign:'center'},metricValue:{color:'#e5edf7',fontSize:12,fontWeight:'900',marginTop:3,textAlign:'center'},
  coolantCard:{width:'100%',flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:12,marginTop:9,paddingHorizontal:13,paddingVertical:11,backgroundColor:'#091626',borderRadius:12,borderWidth:1,borderColor:'#315579'},coolantCardLandscape:{marginTop:4,paddingVertical:5,paddingHorizontal:9},coolantCopy:{flex:1,minWidth:0},coolantHeading:{flexDirection:'row',alignItems:'center',gap:5},coolantLabel:{color:'#c5d8f2',fontSize:9,fontWeight:'900',letterSpacing:.4},coolantStatus:{color:'#7185a1',fontSize:8,fontWeight:'800',marginTop:4},coolantValue:{fontSize:23,fontWeight:'900',fontVariant:['tabular-nums']},coolantOk:{color:'#4ade80'},coolantWarning:{color:'#fbbf24'},coolantUnavailable:{color:'#8fa6c1'},
  danger:{color:'#fb7185'},
  sessionCard:{minHeight:56,flexDirection:'row',alignItems:'center',gap:10,paddingHorizontal:12,paddingVertical:7,backgroundColor:'#0e1b2d',borderRadius:13,borderWidth:1,borderColor:'#28415f',marginBottom:7},sessionCardLandscape:{minHeight:46,paddingVertical:4,marginBottom:4},sessionIconWrap:{width:36,height:36,borderRadius:11,alignItems:'center',justifyContent:'center',backgroundColor:'#091626',borderWidth:1,borderColor:'#29415f'},sessionIconWrapOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},sessionCopy:{flex:1,minWidth:0,gap:2},sessionTitle:{color:'#7db3ff',fontSize:8,fontWeight:'900',letterSpacing:.7},sessionHeadline:{color:'#e5edf7',fontSize:10,fontWeight:'900'},sessionDetail:{color:'#8fa6c1',fontSize:8,lineHeight:12},
  connectionCard:{backgroundColor:'#0e1b2d',borderRadius:15,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},chain:{flexDirection:'row',alignItems:'center',marginTop:10},chainStep:{flex:1,alignItems:'center'},chainCircle:{width:30,height:30,borderRadius:15,alignItems:'center',justifyContent:'center',borderWidth:1,borderColor:'#3b516b',backgroundColor:'#0a1727'},chainCircleOk:{borderColor:'#3b8c5a',backgroundColor:'#10261b'},chainCircleText:{color:'#7185a1',fontSize:11,fontWeight:'900'},chainCircleTextOk:{color:'#4ade80'},chainLabel:{color:'#9fb4cf',fontSize:8,fontWeight:'900',marginTop:4},chainArrow:{color:'#526a86',fontSize:24,paddingHorizontal:4},
  
  statusGrid:{flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',marginBottom:2},statusGridLandscape:{flexWrap:'nowrap',gap:8},statusCardLandscape:{width:'auto',flex:1},statusCard:{width:'48%',minWidth:0,backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:8},moreButton:{flexDirection:'row',alignItems:'center',gap:10,backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:13,marginTop:2},moreIcon:{color:'#7db3ff',fontSize:24,fontWeight:'900'},moreBody:{flex:1,minWidth:0},moreTitle:{color:'#e5edf7',fontSize:11,fontWeight:'900'},moreHint:{color:'#7185a1',fontSize:8,marginTop:3,flexShrink:1},moreArrow:{color:'#7db3ff',fontSize:24},
  error:{color:'#fb7185',fontWeight:'800',fontSize:10,marginTop:8},bottomNav:{flexDirection:'row',backgroundColor:'#0e1b2d',borderRadius:18,borderWidth:1,borderColor:'#28415f',marginTop:0,paddingHorizontal:10,paddingVertical:6,gap:5,justifyContent:'space-around'},bottomNavLandscape:{marginTop:2,paddingVertical:3},bottomNavItem:{flex:1,minWidth:0,alignItems:'center',justifyContent:'center',minHeight:60,borderRadius:12,paddingHorizontal:2,paddingVertical:4},bottomNavActive:{backgroundColor:'#152a45'},footerStatus:{color:'#60748f',textAlign:'center',fontSize:9,marginTop:9},
});
