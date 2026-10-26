import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { useMidLayout } from '../src/ui/midLayout';
import { autoTripService, type AutoTripServiceState } from '../src/trip/autoTripService';
import {
  getCurrentAutonomyRangeKm,
  isBufferEstimatedFuelLevelSample,
  isCurrentFuelLevelSample,
} from '../src/trip/autonomyPresentation';
import { getSharedObdStatus, subscribeSharedObdStatus } from '../src/obd/sharedConnection';
import { estimateFuelRemainingFromFullTank } from '../src/trip/fuelBalance';
import { readMaintenanceData, type MaintenanceData } from '../src/database/maintenanceStorage';
import { readDriveCycles } from '../src/storage/driveCycleStorage';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import type { DriveCycle } from '../src/data/driveCycles';

const PALETTE = {
  background: '#0b1118', panel: '#111920', panelRaised: '#151e25', panelInset: '#0c141a',
  border: '#2b363e', text: '#f2f5f7', muted: '#9aa7b0', subtle: '#71808b',
  amber: '#e8b451', amberText: '#ffda8d', amberPanel: '#342916', amberBorder: '#806333',
  green: '#55d69a', greenText: '#91e5bd', greenPanel: '#142b24', greenBorder: '#2a5b49',
} as const;

type AutonomySource = 'current' | 'buffer' | 'tank' | 'unavailable';

export default function AutonomiaScreen() {
  const layout = useMidLayout();
  const basePath = (FileSystem.documentDirectory ?? '') + 'MERIVA_SMART';
  const [tripState, setTripState] = useState<AutoTripServiceState>(autoTripService.getState());
  const [connectionStatus, setConnectionStatus] = useState(getSharedObdStatus());
  const [cycles, setCycles] = useState<DriveCycle[]>(getAutoSaveState().driveCycles);
  const [maintenanceData, setMaintenanceData] = useState<MaintenanceData | null>(null);
  const [nowMs, setNowMs] = useState(Date.now());
  const [showRules, setShowRules] = useState(false);

  useEffect(() => autoTripService.subscribe(setTripState), []);
  useEffect(() => {
    const unsubscribe = subscribeSharedObdStatus(setConnectionStatus);
    const timer = setInterval(() => {
      setConnectionStatus(getSharedObdStatus());
      setNowMs(Date.now());
      const latestCycles = getAutoSaveState().driveCycles;
      if (latestCycles.length > 0) setCycles(latestCycles);
    }, 1000);
    return () => { unsubscribe(); clearInterval(timer); };
  }, []);
  useEffect(() => {
    let cancelled = false;
    void Promise.all([readMaintenanceData(basePath), readDriveCycles(basePath)]).then(([maintenance, storedCycles]) => {
      if (cancelled) return;
      setMaintenanceData(maintenance);
      const liveCycles = getAutoSaveState().driveCycles;
      setCycles(liveCycles.length > 0 ? liveCycles : storedCycles);
    }).catch(() => {
      if (!cancelled) {
        setMaintenanceData(null);
        setCycles(getAutoSaveState().driveCycles);
      }
    });
    return () => { cancelled = true; };
  }, [basePath]);

  const fuelBalanceFallback = useMemo(() => estimateFuelRemainingFromFullTank({
    fuelings: maintenanceData?.fuelings ?? [],
    trips: cycles,
    currentOdometerKm: maintenanceData?.currentOdometerKm,
    activeTrip: {
      active: tripState.active,
      startedAtMs: tripState.tripStartedAtMs,
      distanceKm: tripState.distanceKm,
      fuelUsedL: tripState.fuelUsedL,
      fuelDataValid: tripState.consumptionKml != null,
    },
  }), [
    maintenanceData?.fuelings, maintenanceData?.currentOdometerKm, cycles,
    tripState.active, tripState.tripStartedAtMs, tripState.distanceKm,
    tripState.fuelUsedL, tripState.consumptionKml,
  ]);

  const rangeKm = getCurrentAutonomyRangeKm({
    ecuConnected: connectionStatus.ecuConnected,
    tripConnected: tripState.connected,
    fuelLevelSupported: tripState.fuelLevelSupported,
    fuelLevelPercent: tripState.fuelLevelPercent,
    fuelLevelReadAtMs: tripState.fuelLevelReadAtMs,
    fuelLevelBufferPercent: tripState.fuelLevelBufferPercent,
    fuelLevelBufferReadAtMs: tripState.fuelLevelBufferReadAtMs,
    fuelLevelBufferSampleCount: tripState.fuelLevelBufferSampleCount,
    tripConsumptionKml: tripState.consumptionKml,
    rollingConsumptionKml: tripState.rollingConsumptionKml,
    fallbackFuelRemainingL: fuelBalanceFallback?.remainingFuelL ?? null,
    averageConsumptionKml: tripState.averageConsumptionKml,
    nowMs,
  });

  const currentPidLevel = tripState.fuelLevelSupported
    && isCurrentFuelLevelSample(tripState.fuelLevelReadAtMs, nowMs);
  const bufferedPidLevel = tripState.fuelLevelSupported
    && tripState.fuelLevelBufferPercent != null
    && isBufferEstimatedFuelLevelSample(
      tripState.fuelLevelBufferReadAtMs, tripState.fuelLevelBufferSampleCount, nowMs,
    );
  const consumptionKml = tripState.rollingConsumptionKml != null
    && Number.isFinite(tripState.rollingConsumptionKml) && tripState.rollingConsumptionKml > 0
    ? tripState.rollingConsumptionKml
    : tripState.consumptionKml != null && Number.isFinite(tripState.consumptionKml) && tripState.consumptionKml > 0
      ? tripState.consumptionKml
      : tripState.averageConsumptionKml > 0 && Number.isFinite(tripState.averageConsumptionKml)
        ? tripState.averageConsumptionKml : null;

  const source: AutonomySource = rangeKm == null
    ? 'unavailable' : currentPidLevel ? 'current' : bufferedPidLevel ? 'buffer' : 'tank';
  const levelPercent = currentPidLevel ? tripState.fuelLevelPercent
    : bufferedPidLevel ? tripState.fuelLevelBufferPercent : null;
  const lastLevelTimestamp = currentPidLevel ? tripState.fuelLevelReadAtMs
    : bufferedPidLevel ? tripState.fuelLevelBufferReadAtMs : null;
  const ageSeconds = lastLevelTimestamp != null
    ? Math.max(0, Math.floor((nowMs - lastLevelTimestamp) / 1000)) : null;

  const statusLabel = source === 'current' ? 'ATUAL'
    : source === 'buffer' ? 'ESTIMADA · BUFFER'
      : source === 'tank' ? 'TANQUE ESTIMADO' : 'INDISPONÍVEL';
  const sourceTitle = source === 'current' ? 'Leitura confiável'
    : source === 'buffer' ? 'Estimativa temporária ativada'
      : source === 'tank' ? 'Estimativa pelo balanço do tanque'
        : bufferedPidLevel ? 'Buffer presente; cálculo bloqueado' : 'Estimativa bloqueada';
  const sourceDescription = source === 'current'
    ? 'PID 012F recebido há ' + ageSeconds + ' s. O nível usa a mediana de ' + tripState.fuelLevelBufferCount + ' amostras reais recentes.'
    : source === 'buffer'
      ? 'Último nível real recebido há ' + ageSeconds + ' s. A estimativa usa ' + tripState.fuelLevelBufferSampleCount + ' amostras válidas e expira após 60 s.'
      : source === 'tank'
        ? 'Baseado no último abastecimento confirmado como tanque cheio, viagens válidas e odômetro. Viagens não registradas podem superestimar o alcance.'
        : !connectionStatus.ecuConnected
          ? 'A ECU não está conectada e respondendo. A autonomia da sessão atual não é apresentada como válida.'
          : bufferedPidLevel
            ? 'O buffer tem amostras, mas não há consumo confiável para calcular autonomia.'
            : tripState.connected
              ? 'Aguardando nível de combustível ou balanço do tanque validado e consumo utilizável.'
              : 'A sessão OBD/viagem não está pronta para calcular autonomia atual.';

  const fuelMetricLabel = source === 'tank' ? 'COMBUSTÍVEL ESTIMADO' : 'NÍVEL DO TANQUE';
  const fuelMetricValue = source === 'tank' && fuelBalanceFallback?.remainingFuelL != null
    ? fuelBalanceFallback.remainingFuelL.toFixed(1) + ' L'
    : levelPercent != null ? Math.round(levelPercent) + '%' : '—';
  const fuelMetricDetail = source === 'tank' ? 'BALANÇO DE ABASTECIMENTOS'
    : currentPidLevel ? 'MEDIANA DO PID 012F'
      : bufferedPidLevel ? 'BUFFER REAL DO PID 012F' : 'SEM LEITURA VÁLIDA';
  const ageMetricValue = ageSeconds != null ? ageSeconds + ' s'
    : source === 'tank' ? 'SEM PID' : 'N/D';
  const ageMetricDetail = source === 'current' ? 'LEITURA RECENTE'
    : source === 'buffer' ? 'JANELA TEMPORÁRIA'
      : source === 'tank' ? 'SEM TIMESTAMP DE PID' : 'DADOS INDISPONÍVEIS';

  const statusStyle = source === 'current' ? styles.statusCurrent
    : source === 'buffer' || source === 'tank' ? styles.statusBuffer : styles.statusUnavailable;
  const messageStyle = source === 'current' ? styles.messageCurrent
    : source === 'buffer' ? styles.messageBuffer
      : source === 'tank' ? styles.messageTank : styles.messageUnavailable;
  const messageMark = source === 'current' ? '✓' : source === 'buffer' ? '≈' : source === 'tank' ? '~' : '!';

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'bottom', 'left', 'right']}>
      <StatusBar style="light" backgroundColor={PALETTE.background} />
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]} showsVerticalScrollIndicator={false}>
        <View style={[styles.screenFrame, { maxWidth: Math.min(layout.maxContentWidth, 760) }]}>
          <View style={styles.topbar}>
            <View style={styles.brandMark}><Text style={styles.brandInitial}>M</Text></View>
            <View style={styles.brandCopy}>
              <Text style={styles.brandTitle}>MERIVA SMART</Text>
              <Text style={styles.brandSub}>DIAGNÓSTICO VEICULAR</Text>
            </View>
            <View style={[styles.connectionPill, connectionStatus.ecuConnected ? styles.connectionConnected : styles.connectionDisconnected]}>
              <View style={[styles.connectionDot, connectionStatus.ecuConnected ? styles.dotConnected : styles.dotDisconnected]} />
              <Text style={[styles.connectionText, connectionStatus.ecuConnected ? styles.connectionTextOk : styles.connectionTextNo]}>
                {connectionStatus.ecuConnected ? 'ECU CONECTADA' : connectionStatus.ecuResponseState === 'NO_RESPONSE' ? 'ECU SEM RESPOSTA' : 'ECU DESCONECTADA'}
              </Text>
            </View>
          </View>

          <View style={styles.pageHeading}>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>COCKPIT / COMBUSTÍVEL</Text>
              <Text style={styles.title}>Autonomia estimada</Text>
              <Text style={styles.subtitle}>Estimativa baseada no nível do tanque e no consumo confiável.</Text>
            </View>
            <View style={styles.monitoring}>
              <View style={[styles.monitoringDot, connectionStatus.ecuConnected ? styles.dotConnected : styles.dotDisconnected]} />
              <Text style={styles.monitoringText}>{connectionStatus.ecuConnected ? 'MONITORAMENTO' : 'AGUARDANDO ECU'}</Text>
            </View>
          </View>

          <View style={[styles.rangeCard, source === 'buffer' && styles.rangeCardBuffer, source === 'tank' && styles.rangeCardTank, source === 'unavailable' && styles.rangeCardUnavailable]}>
            <View style={styles.rangeCardHeader}>
              <Text style={styles.sectionLabel}>AUTONOMIA RESTANTE</Text>
              <View style={[styles.statusTag, statusStyle]}><Text style={[styles.statusTagText, statusStyle]}>{statusLabel}</Text></View>
            </View>
            <View style={styles.rangeRow}>
              <Text style={styles.rangeValue}>{rangeKm == null ? 'N/D' : Math.round(rangeKm).toString()}</Text>
              {rangeKm != null ? <Text style={styles.rangeUnit}>km</Text> : null}
            </View>
            <Text style={styles.rangeCaption}>
              {source === 'current' ? 'Calculada com leitura recente da ECU'
                : source === 'buffer' ? 'Valor temporário · confirmado pelo buffer recente'
                  : source === 'tank' ? 'Estimativa independente baseada no histórico de abastecimentos'
                    : 'Aguardando telemetria válida'}
            </Text>
            <View style={styles.divider} />
            <View style={styles.metricsGrid}>
              <Metric label={fuelMetricLabel} value={fuelMetricValue} detail={fuelMetricDetail} />
              <Metric
                label="CONSUMO UTILIZADO"
                value={consumptionKml != null ? consumptionKml.toFixed(1) + ' km/L' : '—'}
                detail={tripState.rollingConsumptionKml != null && tripState.rollingConsumptionKml > 0
                  ? 'BUFFER MÓVEL CONTÍNUO'
                  : tripState.consumptionKml != null && tripState.consumptionKml > 0
                    ? 'MÉDIA DA VIAGEM'
                    : consumptionKml != null ? 'MÉDIA HISTÓRICA' : 'SEM CONSUMO VÁLIDO'}
              />
              <Metric label="IDADE DA LEITURA" value={ageMetricValue} detail={ageMetricDetail} />
            </View>
          </View>

          <View style={styles.sourcePanel}>
            <View style={styles.panelHeading}>
              <View style={styles.panelHeadingCopy}>
                <Text style={styles.eyebrow}>FONTE DA ESTIMATIVA</Text>
                <Text style={styles.panelTitle}>Estado da telemetria</Text>
              </View>
              <Text style={styles.sampleCount}>
                {source === 'current' ? tripState.fuelLevelBufferCount + ' amostras'
                  : bufferedPidLevel ? tripState.fuelLevelBufferSampleCount + ' amostras'
                    : source === 'tank' ? (fuelBalanceFallback?.tripsCount ?? 0) + ' viagens' : 'sem amostra'}
              </Text>
            </View>
            <View style={[styles.sourceMessage, messageStyle]}>
              <View style={[styles.messageMark, messageStyle]}><Text style={styles.messageMarkText}>{messageMark}</Text></View>
              <View style={styles.messageCopy}>
                <Text style={styles.messageTitle}>{sourceTitle}</Text>
                <Text style={styles.messageDescription}>{sourceDescription}</Text>
              </View>
            </View>
          </View>

          <View style={styles.rulesPanel}>
            <TouchableOpacity style={styles.rulesToggle} onPress={() => setShowRules(value => !value)} accessibilityRole="button" accessibilityState={{ expanded: showRules }} accessibilityLabel="Mostrar regras de segurança da autonomia">
              <View style={styles.rulesCopy}>
                <Text style={styles.rulesTitle}>Regras de segurança</Text>
                <Text style={styles.rulesSubtitle}>Quando estimar e quando exibir N/D</Text>
              </View>
              <Text style={styles.rulesChevron}>{showRules ? '−' : '+'}</Text>
            </TouchableOpacity>
            {showRules ? (
              <View style={styles.rulesList}>
                <Rule title="0–30 s:" text="usar a leitura atual do PID 012F, se ECU e sessão estiverem válidas." />
                <Rule title="30–60 s:" text="aceitar estimativa temporária somente com pelo menos duas amostras reais no buffer e ECU/sessão conectadas." />
                <Rule title="Acima de 60 s:" text="o buffer deixa de sustentar autonomia. Um balanço de tanque cheio só pode substituir o PID se passar pelas validações independentes." />
                <Rule title="Proteção:" text="não converter ausência de dados em tanque vazio, não inventar amostras e não ocultar perda de telemetria." />
              </View>
            ) : null}
          </View>

          <Text style={styles.footerNote}>TANQUE NOMINAL: 56 L • LINEARIDADE DO PID 012F NÃO CALIBRADA PARA ESTA ECU</Text>
          <Link href="/" asChild>
            <TouchableOpacity style={styles.backButton} accessibilityRole="button" accessibilityLabel="Voltar ao cockpit" activeOpacity={0.8}>
              <Text style={styles.backGlyph}>←</Text>
              <Text style={styles.backText}>VOLTAR AO COCKPIT</Text>
            </TouchableOpacity>
          </Link>
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function Metric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return <View style={styles.metric}>
    <Text style={styles.metricLabel}>{label}</Text>
    <Text style={styles.metricValue} numberOfLines={1}>{value}</Text>
    <Text style={styles.metricDetail} numberOfLines={2}>{detail}</Text>
  </View>;
}

function Rule({ title, text }: { title: string; text: string }) {
  return <View style={styles.rule}>
    <Text style={styles.ruleTitle}>{title}</Text>
    <Text style={styles.ruleText}>{text}</Text>
  </View>;
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: PALETTE.background },
  content: { flexGrow: 1, width: '100%', paddingTop: 12, paddingBottom: 22 },
  screenFrame: { width: '100%', alignSelf: 'center' },
  topbar: { flexDirection: 'row', alignItems: 'center', gap: 10, borderBottomWidth: 1, borderBottomColor: PALETTE.border, paddingBottom: 18 },
  brandMark: { width: 38, height: 38, borderRadius: 10, borderWidth: 1.5, borderColor: PALETTE.amber, alignItems: 'center', justifyContent: 'center' },
  brandInitial: { color: PALETTE.amber, fontSize: 22, fontWeight: '900' },
  brandCopy: { flex: 1, minWidth: 0, gap: 3 },
  brandTitle: { color: PALETTE.text, fontSize: 12, fontWeight: '900', letterSpacing: 1.7 },
  brandSub: { color: PALETTE.subtle, fontSize: 9, fontWeight: '800', letterSpacing: 1.1 },
  connectionPill: { flexDirection: 'row', alignItems: 'center', gap: 6, borderWidth: 1, borderRadius: 20, paddingHorizontal: 9, paddingVertical: 7, flexShrink: 1 },
  connectionConnected: { backgroundColor: PALETTE.greenPanel, borderColor: PALETTE.greenBorder },
  connectionDisconnected: { backgroundColor: PALETTE.panelInset, borderColor: PALETTE.border },
  connectionDot: { width: 6, height: 6, borderRadius: 3 },
  dotConnected: { backgroundColor: PALETTE.green },
  dotDisconnected: { backgroundColor: PALETTE.subtle },
  connectionText: { fontSize: 8, letterSpacing: 0.4, fontWeight: '900', flexShrink: 1 },
  connectionTextOk: { color: PALETTE.greenText },
  connectionTextNo: { color: PALETTE.muted },
  pageHeading: { paddingTop: 24, paddingBottom: 18, flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 12 },
  headingCopy: { flex: 1, minWidth: 0 },
  eyebrow: { color: PALETTE.amber, fontSize: 10, fontWeight: '900', letterSpacing: 1.5, marginBottom: 8 },
  title: { color: PALETTE.text, fontSize: 29, lineHeight: 35, fontWeight: '900', letterSpacing: -0.8 },
  subtitle: { color: PALETTE.muted, fontSize: 11, lineHeight: 17, marginTop: 8 },
  monitoring: { flexDirection: 'row', alignItems: 'center', paddingBottom: 3 },
  monitoringDot: { width: 6, height: 6, borderRadius: 3, marginRight: 6 },
  monitoringText: { color: PALETTE.muted, fontSize: 8, fontWeight: '800', letterSpacing: 0.5 },
  rangeCard: { borderWidth: 1, borderColor: '#3b454c', borderRadius: 17, backgroundColor: PALETTE.panelRaised, padding: 19 },
  rangeCardBuffer: { borderColor: PALETTE.amberBorder, backgroundColor: '#171a1b' },
  rangeCardTank: { borderColor: '#685633', backgroundColor: '#171a1b' },
  rangeCardUnavailable: { borderColor: PALETTE.border, backgroundColor: PALETTE.panel },
  rangeCardHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 8 },
  sectionLabel: { color: PALETTE.muted, fontSize: 9, letterSpacing: 1.1, fontWeight: '800' },
  statusTag: { borderWidth: 1, borderRadius: 5, paddingHorizontal: 8, paddingVertical: 5 },
  statusTagText: { fontSize: 8, fontWeight: '900', letterSpacing: 0.35 },
  statusCurrent: { color: PALETTE.greenText, backgroundColor: PALETTE.greenPanel, borderColor: PALETTE.greenBorder },
  statusBuffer: { color: PALETTE.amberText, backgroundColor: PALETTE.amberPanel, borderColor: PALETTE.amberBorder },
  statusUnavailable: { color: PALETTE.muted, backgroundColor: PALETTE.panelInset, borderColor: PALETTE.border },
  rangeRow: { flexDirection: 'row', alignItems: 'baseline', gap: 6, marginTop: 9 },
  rangeValue: { color: PALETTE.text, fontSize: 68, lineHeight: 76, fontWeight: '900', letterSpacing: -3.5, fontVariant: ['tabular-nums'] },
  rangeUnit: { color: PALETTE.muted, fontSize: 19, fontWeight: '800' },
  rangeCaption: { color: PALETTE.muted, fontSize: 10, lineHeight: 15 },
  divider: { height: 1, backgroundColor: PALETTE.border, marginTop: 21, marginBottom: 17 },
  metricsGrid: { flexDirection: 'row', gap: 12 },
  metric: { flex: 1, minWidth: 0 },
  metricLabel: { color: PALETTE.muted, fontSize: 8, fontWeight: '900', letterSpacing: 0.65 },
  metricValue: { color: PALETTE.text, fontSize: 16, fontWeight: '800', marginTop: 7, fontVariant: ['tabular-nums'] },
  metricDetail: { color: PALETTE.subtle, fontSize: 8, lineHeight: 12, marginTop: 6 },
  sourcePanel: { marginTop: 16, borderWidth: 1, borderColor: PALETTE.border, borderRadius: 13, backgroundColor: PALETTE.panel, padding: 16 },
  panelHeading: { flexDirection: 'row', alignItems: 'flex-end', justifyContent: 'space-between', gap: 8 },
  panelHeadingCopy: { flex: 1, minWidth: 0 },
  panelTitle: { color: PALETTE.text, fontSize: 16, fontWeight: '800' },
  sampleCount: { color: PALETTE.subtle, fontSize: 8, fontWeight: '800', textAlign: 'right' },
  sourceMessage: { flexDirection: 'row', alignItems: 'flex-start', gap: 10, padding: 12, borderWidth: 1, borderRadius: 9, marginTop: 14 },
  messageCurrent: { borderColor: PALETTE.greenBorder, backgroundColor: PALETTE.greenPanel },
  messageBuffer: { borderColor: PALETTE.amberBorder, backgroundColor: '#282216' },
  messageTank: { borderColor: '#685633', backgroundColor: '#211d14' },
  messageUnavailable: { borderColor: PALETTE.border, backgroundColor: PALETTE.panelInset },
  messageMark: { width: 23, height: 23, alignItems: 'center', justifyContent: 'center', borderRadius: 12, borderWidth: 1 },
  messageMarkText: { color: PALETTE.text, fontSize: 12, fontWeight: '900' },
  messageCopy: { flex: 1, minWidth: 0 },
  messageTitle: { color: PALETTE.text, fontSize: 10, fontWeight: '900' },
  messageDescription: { color: PALETTE.muted, fontSize: 9, lineHeight: 14, marginTop: 4 },
  rulesPanel: { marginTop: 16, borderWidth: 1, borderColor: PALETTE.border, borderRadius: 13, backgroundColor: PALETTE.panel, paddingHorizontal: 16 },
  rulesToggle: { minHeight: 58, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10 },
  rulesCopy: { flex: 1, gap: 5 },
  rulesTitle: { color: PALETTE.text, fontSize: 11, fontWeight: '900' },
  rulesSubtitle: { color: PALETTE.subtle, fontSize: 9 },
  rulesChevron: { color: PALETTE.amber, fontSize: 21, fontWeight: '500' },
  rulesList: { paddingBottom: 15 },
  rule: { flexDirection: 'row', alignItems: 'flex-start', gap: 5, paddingVertical: 4 },
  ruleTitle: { color: PALETTE.amberText, fontSize: 9, lineHeight: 14, fontWeight: '900' },
  ruleText: { flex: 1, color: PALETTE.muted, fontSize: 9, lineHeight: 14 },
  footerNote: { color: PALETTE.subtle, fontSize: 8, lineHeight: 12, fontWeight: '800', letterSpacing: 0.25, marginTop: 16 },
  backButton: { minHeight: 47, borderWidth: 1, borderColor: PALETTE.border, borderRadius: 10, alignItems: 'center', justifyContent: 'center', flexDirection: 'row', gap: 8, marginTop: 11, backgroundColor: PALETTE.panel },
  backGlyph: { color: PALETTE.amber, fontSize: 19, fontWeight: '800' },
  backText: { color: PALETTE.amber, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
});
