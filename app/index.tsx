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

  const connectionTone = obd.connected ? 'success' : bluetoothError ? 'danger' : bluetoothSearching ? 'info' : 'neutral';
  const connectionTitle = obd.connected ? 'OBD PRONTO' : bluetoothError ? 'CONEXÃO COM PROBLEMA' : bluetoothSearching ? 'CONECTANDO' : 'AGUARDANDO CONEXÃO';

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: layout.horizontalPadding,
            alignItems: 'center',
          },
        ]}
      >
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <View style={styles.appHeader}>
            <View>
              <Text style={styles.appTitle}>Meriva Smart Diagnostic</Text>
              <Text style={styles.vehicleTitle}>Chevrolet Meriva Maxx 1.4</Text>
            </View>
            <View style={styles.headerDot} />
          </View>

          <View style={styles.connectionCard}>
            <View style={styles.connectionTopRow}>
              <View>
                <Text style={styles.eyebrow}>STATUS DO VEÍCULO</Text>
                <Text style={styles.connectionTitle}>{connectionTitle}</Text>
              </View>
              <View style={[
                styles.statePill,
                connectionTone === 'success' && styles.statePillSuccess,
                connectionTone === 'danger' && styles.statePillDanger,
                connectionTone === 'info' && styles.statePillInfo,
                connectionTone === 'neutral' && styles.statePillNeutral,
              ]}>
                <Text style={styles.statePillText}>{obd.connected ? 'CONECTADO' : bluetoothSearching ? 'BUSCANDO' : 'OFFLINE'}</Text>
              </View>
            </View>

            <View style={styles.pipeline}>
              <PipelineStep label="Bluetooth" value="Ativado" ok={!bluetoothError} active={bluetoothSearching && !obd.connected} />
              <PipelineStep label="ELM327" value={obd.connected ? (obd.adapterName ?? 'Conectado') : bluetoothSearching ? 'Procurando adaptador' : 'Não conectado'} ok={obd.connected} active={bluetoothSearching && !obd.connected} />
              <PipelineStep label="ECU" value={obd.connected ? 'Respondendo' : 'Aguardando'} ok={obd.connected} />
              <PipelineStep label="OBD" value={obd.connected ? 'Pronto' : 'Aguardando'} ok={obd.connected} last />
            </View>

            <Text style={styles.connectionHelp}>
              {obd.connected
                ? `Protocolo: ${obd.protocol ?? 'identificado'}`
                : 'O aplicativo só considera a conexão pronta depois de validar o ELM327 e a ECU.'}
            </Text>
          </View>

          <View style={styles.primaryActions}>
            <Link href="/laboratorio" asChild>
              <TouchableOpacity style={styles.primaryButton}>
                <Text style={styles.primaryButtonText}>ABRIR DIAGNÓSTICO OBD</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/configuracoes" asChild>
              <TouchableOpacity style={styles.secondaryButton}>
                <Text style={styles.secondaryButtonText}>CONFIGURAÇÕES</Text>
              </TouchableOpacity>
            </Link>
          </View>

          <View style={styles.sectionHeader}>
            <Text style={styles.sectionTitle}>VISÃO RÁPIDA</Text>
            <Text style={styles.sectionHint}>dados reais</Text>
          </View>

          <View style={styles.statusGrid}>
            <StatusCard label="OBD" value={obd.connected ? 'ONLINE' : 'AGUARDANDO'} tone={obd.connected ? 'success' : 'neutral'} />
            <StatusCard label="GPS" value={gpsState.running ? 'ATIVO' : 'AGUARDANDO'} tone={gpsState.running ? 'success' : 'neutral'} />
            <StatusCard label="CONSUMO" value={realConsumptionKml == null ? 'N/D' : `${realConsumptionKml.toFixed(1)} km/L`} tone="neutral" />
            <StatusCard label="FALHAS" value={dtcCount ? String(dtcCount) : 'OK'} tone={dtcCount ? 'danger' : 'success'} />
          </View>

          <View style={styles.tripCard}>
            <View style={styles.cardHeaderRow}>
              <View>
                <Text style={styles.sectionTitle}>VIAGEM ATUAL</Text>
                <Text style={styles.cardSubtitle}>registro automático pelo GPS</Text>
              </View>
              <Text style={gpsState.running ? styles.live : styles.muted}>{gpsState.running ? 'ATIVA' : 'AGUARDANDO'}</Text>
            </View>

            <View style={styles.tripGrid}>
              <Metric label="DISTÂNCIA" value={formatDistance(gpsState.distanceKm, distanceUnit)} />
              <Metric label="ÚLTIMO CONSUMO" value={summary.lastRealCycle ? `${summary.lastRealCycle.avgFuelConsumptionKml.toFixed(2)} km/L` : 'N/D'} />
              <Metric label="PRECISÃO GPS" value={gpsState.lastAccuracyM == null ? 'N/D' : `${gpsState.lastAccuracyM.toFixed(0)} m`} />
            </View>
          </View>

          <View style={styles.menuList}>
            <Link href="/laboratorio" asChild>
              <TouchableOpacity style={styles.menuRow}>
                <View style={styles.menuIcon}><Text style={styles.menuIconText}>OBD</Text></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Diagnóstico OBD</Text><Text style={styles.menuDescription}>PIDs, ECU e comunicação ELM327</Text></View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/armazenamento" asChild>
              <TouchableOpacity style={styles.menuRow}>
                <View style={styles.menuIcon}><Text style={styles.menuIconText}>LOG</Text></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Histórico e dados</Text><Text style={styles.menuDescription}>Viagens, registros e arquivos</Text></View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Link>
            <Link href="/configuracoes" asChild>
              <TouchableOpacity style={styles.menuRow}>
                <View style={styles.menuIcon}><Text style={styles.menuIconText}>CFG</Text></View>
                <View style={styles.menuCopy}><Text style={styles.menuTitle}>Configurações</Text><Text style={styles.menuDescription}>Veículo, adaptador e compatibilidade</Text></View>
                <Text style={styles.menuArrow}>›</Text>
              </TouchableOpacity>
            </Link>
          </View>

          {bluetoothError ? <Text style={styles.error}>ELM327: {bluetoothError}</Text> : null}
          {gpsState.error ? <Text style={styles.error}>GPS: {gpsState.error}</Text> : null}
          {saveStatus.lastError ? <Text style={styles.error}>ARMAZENAMENTO: {saveStatus.lastError}</Text> : null}

          <Text style={styles.footerStatus}>
            {isHydrated ? 'SALVAMENTO AUTOMÁTICO ATIVO' : 'CARREGANDO DADOS...'}
          </Text>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function PipelineStep({
  label,
  value,
  ok,
  active = false,
  last = false,
}: {
  label: string;
  value: string;
  ok: boolean;
  active?: boolean;
  last?: boolean;
}) {
  return (
    <View style={styles.pipelineStep}>
      <View style={styles.pipelineMarkerRow}>
        <View style={[styles.pipelineMarker, ok && styles.pipelineMarkerOk, active && styles.pipelineMarkerActive]}>
          <Text style={styles.pipelineMarkerText}>{ok ? '✓' : active ? '•' : '○'}</Text>
        </View>
        {!last ? <View style={[styles.pipelineLine, ok && styles.pipelineLineOk]} /> : null}
      </View>
      <Text style={styles.pipelineLabel}>{label}</Text>
      <Text style={styles.pipelineValue}>{value}</Text>
    </View>
  );
}

function StatusCard({
  label,
  value,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  tone?: 'success' | 'danger' | 'neutral';
}) {
  return (
    <View style={styles.statusCard}>
      <Text style={styles.metricLabel}>{label}</Text>
      <Text style={[styles.metricValue, tone === 'success' && styles.metricSuccess, tone === 'danger' && styles.metricDanger]}>{value}</Text>
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
  container: { flex: 1, backgroundColor: '#f5f7fb' },
  content: { flexGrow: 1, paddingVertical: 14, paddingBottom: 32 },
  screenFrame: { width: '100%' },
  appHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 6, marginBottom: 14 },
  appTitle: { color: '#123c70', fontSize: 20, fontWeight: '900' },
  vehicleTitle: { color: '#5d6f85', fontSize: 11, fontWeight: '700', marginTop: 2 },
  headerDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: '#2d74da' },
  connectionCard: { backgroundColor: '#ffffff', borderRadius: 16, borderWidth: 1, borderColor: '#dce4ee', padding: 16, marginBottom: 10, shadowColor: '#1c3554', shadowOpacity: 0.05, shadowRadius: 10, shadowOffset: { width: 0, height: 4 }, elevation: 2 },
  connectionTopRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 15 },
  eyebrow: { color: '#718096', fontSize: 9, fontWeight: '900', letterSpacing: 1.2 },
  connectionTitle: { color: '#172b43', fontSize: 22, fontWeight: '900', marginTop: 3 },
  statePill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 6 },
  statePillSuccess: { backgroundColor: '#e7f7ed' },
  statePillDanger: { backgroundColor: '#fdebec' },
  statePillInfo: { backgroundColor: '#e8f1ff' },
  statePillNeutral: { backgroundColor: '#eef2f6' },
  statePillText: { color: '#31445b', fontSize: 9, fontWeight: '900' },
  pipeline: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  pipelineStep: { flex: 1, minWidth: 65 },
  pipelineMarkerRow: { flexDirection: 'row', alignItems: 'center' },
  pipelineMarker: { width: 24, height: 24, borderRadius: 12, borderWidth: 1, borderColor: '#cbd5e1', backgroundColor: '#f8fafc', alignItems: 'center', justifyContent: 'center' },
  pipelineMarkerOk: { backgroundColor: '#e7f7ed', borderColor: '#9bd3ad' },
  pipelineMarkerActive: { backgroundColor: '#e8f1ff', borderColor: '#8bb5f0' },
  pipelineMarkerText: { color: '#60748a', fontSize: 12, fontWeight: '900' },
  pipelineLine: { flex: 1, height: 1, backgroundColor: '#d9e1ea', marginHorizontal: 4 },
  pipelineLineOk: { backgroundColor: '#9bd3ad' },
  pipelineLabel: { color: '#5d6f85', fontSize: 9, fontWeight: '900', marginTop: 7 },
  pipelineValue: { color: '#172b43', fontSize: 9, fontWeight: '700', marginTop: 2, paddingRight: 3 },
  connectionHelp: { color: '#718096', fontSize: 10, lineHeight: 14, marginTop: 13 },
  primaryActions: { flexDirection: 'row', gap: 8, marginBottom: 18 },
  primaryButton: { flex: 1, backgroundColor: '#1769d1', borderRadius: 12, paddingVertical: 14, alignItems: 'center', justifyContent: 'center' },
  primaryButtonText: { color: '#ffffff', fontWeight: '900', fontSize: 11 },
  secondaryButton: { backgroundColor: '#ffffff', borderRadius: 12, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#cbd8e7' },
  secondaryButtonText: { color: '#1760b9', fontWeight: '900', fontSize: 10 },
  sectionHeader: { flexDirection: 'row', alignItems: 'baseline', justifyContent: 'space-between', marginBottom: 8 },
  sectionTitle: { color: '#26384f', fontWeight: '900', fontSize: 12, letterSpacing: 0.5 },
  sectionHint: { color: '#8796a8', fontSize: 9, fontWeight: '700' },
  statusGrid: { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', marginBottom: 10 },
  statusCard: { width: '48.5%', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#dce4ee', padding: 12, marginBottom: 8 },
  metricLabel: { color: '#8291a3', fontSize: 8, fontWeight: '900', letterSpacing: 0.7, marginBottom: 3 },
  metricValue: { color: '#26384f', fontWeight: '900', fontSize: 15 },
  metricSuccess: { color: '#168348' },
  metricDanger: { color: '#c7373f' },
  tripCard: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#dce4ee', padding: 14, marginBottom: 10 },
  cardHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 },
  cardSubtitle: { color: '#8a98a9', fontSize: 9, marginTop: 2 },
  live: { color: '#168348', fontWeight: '900', fontSize: 9 },
  muted: { color: '#7b8b9e', fontWeight: '900', fontSize: 9 },
  tripGrid: { flexDirection: 'row', justifyContent: 'space-between' },
  tripMetric: { width: '31%' },
  menuList: { backgroundColor: '#ffffff', borderRadius: 14, borderWidth: 1, borderColor: '#dce4ee', overflow: 'hidden' },
  menuRow: { flexDirection: 'row', alignItems: 'center', minHeight: 64, paddingHorizontal: 12, borderBottomWidth: 1, borderBottomColor: '#edf1f5' },
  menuIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: '#eaf2ff', alignItems: 'center', justifyContent: 'center', marginRight: 11 },
  menuIconText: { color: '#1769d1', fontSize: 8, fontWeight: '900' },
  menuCopy: { flex: 1 },
  menuTitle: { color: '#26384f', fontSize: 12, fontWeight: '900' },
  menuDescription: { color: '#7c8b9d', fontSize: 9, marginTop: 2 },
  menuArrow: { color: '#1769d1', fontSize: 24, fontWeight: '300', marginLeft: 8 },
  error: { color: '#bd343c', backgroundColor: '#fff0f1', borderRadius: 8, padding: 9, fontWeight: '800', fontSize: 9, marginTop: 8 },
  footerStatus: { color: '#8291a3', textAlign: 'center', fontSize: 9, marginTop: 11 },
});
