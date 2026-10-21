import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View, useWindowDimensions } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { autoTripService } from '../src/trip/autoTripService';
import { gpsTracker } from '../src/gps';
import { getLivePidTrend, getLiveSeries, getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import { buildTelemetryChart, type TelemetryChartSample } from '../src/obd/telemetryChart';
import { getSharedObdStatus } from '../src/obd/sharedConnection';
import { getPidDefinition } from '../src/obd/pidDefinition';
import type { DriveCycle } from '../src/data/driveCycles';

type ChartMode = 'LIVE' | 'TRIPS';
type LiveChartPid = '0105' | '0142' | '0111' | '010C' | '010D';
type TripChartMetric = 'coolantTempC' | 'rpm' | 'speedKmh';

const livePidOptions: { pid: LiveChartPid; label: string; unit: string }[] = [
  { pid: '0105', label: 'ARREFECIMENTO', unit: '°C' },
  { pid: '0142', label: 'TENSÃO', unit: 'V' },
  { pid: '0111', label: 'BORBOLETA', unit: '%' },
  { pid: '010C', label: 'RPM', unit: 'rpm' },
  { pid: '010D', label: 'VELOCIDADE', unit: 'km/h' },
];

const tripMetricOptions: { metric: TripChartMetric; label: string; unit: string }[] = [
  { metric: 'coolantTempC', label: 'TEMPERATURA', unit: '°C' },
  { metric: 'rpm', label: 'RPM', unit: 'rpm' },
  { metric: 'speedKmh', label: 'VELOCIDADE', unit: 'km/h' },
];

export default function DadosScreen() {
  const layout = useMidLayout();
  const window = useWindowDimensions();
  const [state, setState] = useState(getAutoSaveState());
  const [trip, setTrip] = useState(autoTripService.getState());
  const [chartMode, setChartMode] = useState<ChartMode>('LIVE');
  const [livePid, setLivePid] = useState<LiveChartPid>('0105');
  const [tripMetric, setTripMetric] = useState<TripChartMetric>('coolantTempC');
  const [historyTripIndex, setHistoryTripIndex] = useState(0);

  useEffect(() => {
    const timer = setInterval(() => {
      setState(getAutoSaveState());
      setTrip(autoTripService.getState());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  const ecuConnected = getSharedObdStatus().ecuConnected;
  const readings = [...state.lastReadings]
    .filter((item) => item.source === 'REAL')
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));

  // Completed stored trips only: imported CarScanner/reference rows and
  // simulated cycles can never become "real vehicle history".
  const historyTrips = useMemo(
    () => state.driveCycles
      .filter((cycle) => cycle.source === 'REAL_OBD' && Array.isArray(cycle.telemetrySamples) && cycle.telemetrySamples.length > 0)
      .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)),
    [state.driveCycles],
  );

  useEffect(() => {
    setHistoryTripIndex(0);
  }, [historyTrips.length]);

  const activeHistoryIndex = Math.min(historyTripIndex, Math.max(0, historyTrips.length - 1));
  const selectedHistoryTrip = historyTrips[activeHistoryIndex] ?? null;
  const liveTrend = getLivePidTrend(livePid);
  const chartWidth = Math.max(220, Math.min(700, window.width - 48));
  const chartHeight = layout.landscape ? 145 : 180;
  const livePoints: TelemetryChartSample[] = ecuConnected
    ? getLiveSeries(livePid).map((item) => ({ timestamp: item.timestamp, value: item.value }))
    : [];
  const historyPoints: TelemetryChartSample[] = (selectedHistoryTrip?.telemetrySamples ?? [])
    .map((sample) => ({ timestamp: sample.timestamp, value: sample[tripMetric] }));
  const liveSelected = livePidOptions.find((option) => option.pid === livePid) ?? livePidOptions[0];
  const tripSelected = tripMetricOptions.find((option) => option.metric === tripMetric) ?? tripMetricOptions[0];

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom', 'left', 'right']}>
      <ScrollView contentContainerStyle={[styles.content, { paddingHorizontal: layout.horizontalPadding }]} showsHorizontalScrollIndicator={false}>
        <View style={[styles.screenFrame, { maxWidth: layout.maxContentWidth }]}>
          <Header title="DADOS EM TEMPO REAL" subtitle="PIDs • TELEMETRIA • HISTÓRICO LOCAL" />
          <View style={[styles.liveCard, ecuConnected ? styles.connectedCard : styles.disconnectedCard]}>
            <Text style={styles.liveTitle}>{ecuConnected ? '● ECU RESPONDENDO' : '○ ECU DESCONECTADA / SEM RESPOSTA'}</Text>
            <Text style={styles.liveHint}>{state.obd.protocol ? 'PROTOCOLO ' + state.obd.protocol : 'Conecte o ELM327 e valide a ECU para iniciar uma nova série.'}</Text>
          </View>

          <View style={styles.grid}>
            <Metric landscape={layout.landscape} label="VELOCIDADE GPS" value={gpsTracker.getState().running ? Math.round(gpsTracker.getState().currentSpeedKmh) + ' km/h' : 'N/D'} />
            <Metric landscape={layout.landscape} label="DISTÂNCIA DA VIAGEM" value={trip.active ? trip.distanceKm.toFixed(2) + ' km' : 'N/D'} />
            <Metric landscape={layout.landscape} label="CONSUMO" value={trip.consumptionKml != null && trip.consumptionKml > 0 ? trip.consumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
            <Metric landscape={layout.landscape} label="AUTONOMIA" value={state.autonomy.estimatedRangeKm > 0 ? state.autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
          </View>

          <Text style={styles.section}>CONTEXTO OPERACIONAL</Text>
          <View style={styles.contextCard}>
            <Text style={styles.contextValue}>{getVehicleConditionSnapshot().condition}</Text>
            <Text style={styles.contextHint}>{getVehicleConditionSnapshot().reason}</Text>
          </View>

          <Text style={styles.section}>GRÁFICOS E TELEMETRIA</Text>
          <View style={styles.modeRow}>
            <ModeButton active={chartMode === 'LIVE'} label="AO VIVO" onPress={() => setChartMode('LIVE')} />
            <ModeButton active={chartMode === 'TRIPS'} label="VIAGENS SALVAS" onPress={() => setChartMode('TRIPS')} />
          </View>

          {chartMode === 'LIVE' ? (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>SESSÃO ECU ATUAL</Text>
              <Text style={styles.chartHint}>Amostras reais em memória • janela limitada • não é histórico permanente</Text>
              <View style={styles.selectorRow}>
                {livePidOptions.map((option) => (
                  <ModeButton key={option.pid} active={livePid === option.pid} label={option.label} onPress={() => setLivePid(option.pid)} />
                ))}
              </View>
              <Text style={styles.chartStatus}>
                {!ecuConnected
                  ? 'ECU desconectada: nenhuma amostra anterior é apresentada como telemetria ao vivo.'
                  : !liveTrend
                    ? 'Aguardando a primeira resposta real deste PID na sessão atual.'
                    : liveTrend.ageSeconds > 30
                      ? 'Última amostra antiga (' + liveTrend.ageSeconds.toFixed(0) + ' s); aguardando atualização.'
                      : 'Série recebida da sessão ECU atual.'}
              </Text>
              <LineChart samples={livePoints} width={chartWidth} height={chartHeight} unit={liveSelected.unit} emptyText="Ainda não há amostras reais suficientes para desenhar este gráfico." />
              {liveTrend && ecuConnected ? (
                <Text style={styles.chartFootnote}>{liveTrend.samples} amostras em memória • última resposta há {liveTrend.ageSeconds.toFixed(0)} s</Text>
              ) : null}
            </View>
          ) : (
            <View style={styles.chartCard}>
              <Text style={styles.chartTitle}>HISTÓRICO DE VIAGENS REAIS</Text>
              <Text style={styles.chartHint}>Somente viagens finalizadas com pontos de telemetria gravados; sem seed ou simulação.</Text>
              {historyTrips.length === 0 ? (
                <Empty text="Ainda não há viagens reais com amostras guardadas. Novas viagens serão listadas após serem finalizadas." />
              ) : (
                <>
                  <View style={styles.historySelector}>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={activeHistoryIndex === 0}
                      onPress={() => setHistoryTripIndex((current) => Math.max(0, current - 1))}
                      style={[styles.historyArrow, activeHistoryIndex === 0 && styles.disabled]}
                    >
                      <Text style={styles.historyArrowText}>← MAIS RECENTE</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      accessibilityRole="button"
                      disabled={activeHistoryIndex >= historyTrips.length - 1}
                      onPress={() => setHistoryTripIndex((current) => Math.min(historyTrips.length - 1, current + 1))}
                      style={[styles.historyArrow, activeHistoryIndex >= historyTrips.length - 1 && styles.disabled]}
                    >
                      <Text style={styles.historyArrowText}>ANTERIOR →</Text>
                    </TouchableOpacity>
                  </View>
                  <Text style={styles.historyDate}>{formatTripDate(selectedHistoryTrip as DriveCycle)} • {activeHistoryIndex + 1}/{historyTrips.length}</Text>
                  <View style={styles.selectorRow}>
                    {tripMetricOptions.map((option) => (
                      <ModeButton key={option.metric} active={tripMetric === option.metric} label={option.label} onPress={() => setTripMetric(option.metric)} />
                    ))}
                  </View>
                  <LineChart samples={historyPoints} width={chartWidth} height={chartHeight} unit={tripSelected.unit} emptyText="Esta viagem não tem amostras válidas para o parâmetro selecionado." />
                  <Text style={styles.chartFootnote}>A série foi gravada durante a viagem; viagens antigas sem telemetria não são preenchidas retroativamente.</Text>
                </>
              )}
            </View>
          )}

          <Text style={styles.section}>ÚLTIMAS LEITURAS REAIS</Text>
          {!readings.length ? <Empty text="Nenhum PID real registrado ainda. Use DIAGNÓSTICO para consultar a ECU." /> : readings.slice(0, 12).map((item) => {
            const definition = getPidDefinition(item.pid);
            return (
              <View key={item.timestamp + item.pid} style={styles.row}>
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.name} numberOfLines={2}>{item.pid} • {definition?.name ?? item.name}</Text>
                  <Text style={styles.pid}>{definition?.description ?? 'Descrição não catalogada localmente'} • {item.status}</Text>
                  <Text style={styles.pid}>{formatAgeFromTimestamp(item.timestamp)}</Text>
                </View>
                <Text style={styles.value}>{item.value == null ? 'N/D' : String(item.value) + (item.unit ? ' ' + item.unit : '')}</Text>
              </View>
            );
          })}
          <View style={styles.note}>
            <Text style={styles.noteText}>Leituras recentes exibem somente origem REAL. A janela ao vivo é volátil; o histórico por viagem usa os pontos realmente gravados e não inventa amostras ausentes.</Text>
          </View>
          <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🔧 CONSULTAR / DESCOBRIR PIDs</Text></TouchableOpacity></Link>
          <Back />
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

function LineChart({ samples, width, height, unit, emptyText }: { samples: TelemetryChartSample[]; width: number; height: number; unit: string; emptyText: string }) {
  const chart = buildTelemetryChart(samples, width, height);
  if (!chart) return <Empty text={emptyText} />;
  return (
    <View style={styles.chartShell}>
      <View style={[styles.chartPlot, { width, height }]}>
        <Text style={styles.chartMax}>MÁX {formatChartValue(chart.max)} {unit}</Text>
        {chart.segments.map((segment) => (
          <View
            key={segment.fromSlot + '-' + segment.toSlot}
            style={[styles.chartLine, {
              left: segment.left,
              top: segment.top,
              width: segment.length,
              transform: [{ rotate: segment.angleDeg + 'deg' }],
            }]}
          />
        ))}
        {chart.points.map((point) => (
          <View key={point.slot} style={[styles.chartPoint, { left: point.x - 4, top: point.y - 4 }]} />
        ))}
        <Text style={styles.chartMin}>MÍN {formatChartValue(chart.min)} {unit}</Text>
      </View>
      <View style={styles.chartStats}>
        <ChartStat label="ATUAL" value={formatChartValue(chart.current) + ' ' + unit} />
        <ChartStat label="MÉDIA" value={formatChartValue(chart.average) + ' ' + unit} />
        <ChartStat label="AMOSTRAS" value={String(chart.samples)} />
        <ChartStat label="VARIAÇÃO" value={(chart.delta > 0 ? '+' : '') + formatChartValue(chart.delta) + ' ' + unit} />
      </View>
      <View style={styles.chartTimes}>
        <Text style={styles.pid}>{formatClock(chart.firstTimestamp)}</Text>
        <Text style={styles.pid}>Última: {formatAgeFromTimestamp(chart.lastTimestamp)}</Text>
      </View>
    </View>
  );
}

function ChartStat({ label, value }: { label: string; value: string }) {
  return <View style={styles.chartStat}><Text style={styles.chartStatLabel}>{label}</Text><Text style={styles.chartStatValue} numberOfLines={1}>{value}</Text></View>;
}

function ModeButton({ active, label, onPress }: { active: boolean; label: string; onPress: () => void }) {
  return (
    <TouchableOpacity accessibilityRole="button" accessibilityState={{ selected: active }} onPress={onPress} style={[styles.modeButton, active && styles.modeButtonActive]}>
      <Text style={[styles.modeButtonText, active && styles.modeButtonTextActive]}>{label}</Text>
    </TouchableOpacity>
  );
}

function formatChartValue(value: number): string {
  return Number.isFinite(value) ? value.toFixed(1) : 'N/D';
}

function formatTripDate(cycle: DriveCycle): string {
  const parsed = Date.parse(cycle.startedAt);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleString() : cycle.startedAt;
}

function formatAgeFromTimestamp(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  if (!Number.isFinite(parsed)) return 'horário N/D';
  return new Date(parsed).toLocaleTimeString();
}

function formatClock(timestamp: string): string {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) ? new Date(parsed).toLocaleTimeString() : 'N/D';
}

function Header({ title, subtitle }: { title: string; subtitle: string }) {
  return <View style={styles.header}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>;
}

function Metric({ label, value, landscape = false }: { label: string; value: string; landscape?: boolean }) {
  return <View style={[styles.metric, landscape && styles.metricLandscape]}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>;
}

function Empty({ text }: { text: string }) {
  return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>;
}

function Back() {
  return <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR AO COCKPIT</Text></TouchableOpacity></Link>;
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.screen },
  content: { flexGrow: 1, width: '100%', paddingVertical: 14, paddingBottom: 30 },
  screenFrame: { width: '100%', alignSelf: 'center' },
  header: { marginBottom: 12 },
  title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },
  subtitle: { color: '#7db3ff', fontSize: 9, fontWeight: '900', marginTop: 3, letterSpacing: 1 },
  liveCard: { borderRadius: 14, borderWidth: 1, padding: 14, marginBottom: 10 },
  connectedCard: { backgroundColor: '#10261b', borderColor: '#28613e' },
  disconnectedCard: { backgroundColor: '#28151c', borderColor: '#713043' },
  liveTitle: { color: '#f8fafc', fontWeight: '900', fontSize: 12 },
  liveHint: { color: '#9fb4cf', fontSize: 9, marginTop: 4 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginBottom: 12 },
  metric: { width: '48%', backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#233a56', padding: 12 },
  metricLandscape: { width: 'auto', flex: 1 },
  label: { color: '#7185a1', fontSize: 8, fontWeight: '900' },
  metricValue: { color: '#e5edf7', fontSize: 17, fontWeight: '900', marginTop: 4 },
  section: { color: '#7db3ff', fontSize: 10, fontWeight: '900', letterSpacing: 1, marginBottom: 7, marginTop: 4 },
  contextCard: { backgroundColor: '#0e1b2d', borderRadius: 12, borderWidth: 1, borderColor: '#28415f', padding: 12, marginBottom: 12 },
  contextValue: { color: '#7db3ff', fontSize: 15, fontWeight: '900' },
  contextHint: { color: '#94a3b8', fontSize: 9, lineHeight: 14, marginTop: 4 },
  modeRow: { flexDirection: 'row', gap: 8, marginBottom: 8 },
  selectorRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 8, marginBottom: 8 },
  modeButton: { borderWidth: 1, borderColor: '#29415f', backgroundColor: '#091626', borderRadius: 9, paddingVertical: 8, paddingHorizontal: 9 },
  modeButtonActive: { borderColor: '#3b82f6', backgroundColor: '#173457' },
  modeButtonText: { color: '#9fb4cf', fontSize: 8, fontWeight: '900' },
  modeButtonTextActive: { color: '#bfdbfe' },
  chartCard: { backgroundColor: '#0e1b2d', borderRadius: 14, borderWidth: 1, borderColor: '#28415f', padding: 12, marginBottom: 12 },
  chartTitle: { color: '#e5edf7', fontSize: 11, fontWeight: '900', letterSpacing: 0.6 },
  chartHint: { color: '#7185a1', fontSize: 9, lineHeight: 14, marginTop: 4 },
  chartFootnote: { color: '#7185a1', fontSize: 8, lineHeight: 13, marginTop: 7, textAlign: 'center' },
  chartStatus: { color: '#fbbf24', fontSize: 9, lineHeight: 14, marginTop: 5 },
  chartShell: { alignSelf: 'center', marginTop: 5 },
  chartPlot: { position: 'relative', overflow: 'hidden', backgroundColor: '#091626', borderRadius: 10, borderWidth: 1, borderColor: '#203854' },
  chartLine: { position: 'absolute', height: 2, backgroundColor: '#60a5fa', borderRadius: 1 },
  chartPoint: { position: 'absolute', width: 8, height: 8, borderRadius: 4, backgroundColor: '#bfdbfe', borderWidth: 1, borderColor: '#2563eb' },
  chartMax: { position: 'absolute', top: 3, left: 5, color: '#8194ad', fontSize: 7, zIndex: 2 },
  chartMin: { position: 'absolute', bottom: 3, left: 5, color: '#8194ad', fontSize: 7, zIndex: 2 },
  chartStats: { flexDirection: 'row', flexWrap: 'wrap', gap: 5, marginTop: 8 },
  chartStat: { flexGrow: 1, minWidth: 65, backgroundColor: '#091626', borderRadius: 7, paddingVertical: 7, paddingHorizontal: 6 },
  chartStatLabel: { color: '#7185a1', fontSize: 7, fontWeight: '900' },
  chartStatValue: { color: '#dbeafe', fontSize: 9, fontWeight: '900', marginTop: 3 },
  chartTimes: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 5 },
  historySelector: { flexDirection: 'row', justifyContent: 'space-between', gap: 8, marginTop: 10 },
  historyArrow: { flex: 1, alignItems: 'center', borderWidth: 1, borderColor: '#29415f', borderRadius: 9, paddingVertical: 9, paddingHorizontal: 5 },
  historyArrowText: { color: '#bfdbfe', fontSize: 8, fontWeight: '900' },
  disabled: { opacity: 0.35 },
  historyDate: { color: '#9fb4cf', fontSize: 9, marginTop: 9 },
  trendInfo: { flex: 1, minWidth: 0 },
  row: { backgroundColor: '#0e1b2d', borderRadius: 11, borderWidth: 1, borderColor: '#233a56', padding: 11, marginBottom: 7, flexDirection: 'row', alignItems: 'center' },
  name: { color: '#e5edf7', fontSize: 12, fontWeight: '900' },
  pid: { color: '#7185a1', fontSize: 8, marginTop: 3 },
  value: { color: '#9fc5f7', fontSize: 12, fontWeight: '900' },
  note: { backgroundColor: '#0b1829', borderRadius: 10, padding: 11, marginVertical: 5 },
  noteText: { color: '#8194ad', fontSize: 9, lineHeight: 15 },
  primary: { backgroundColor: '#2563eb', borderRadius: 11, padding: 14, alignItems: 'center', marginTop: 8 },
  primaryText: { color: '#fff', fontSize: 10, fontWeight: '900' },
  empty: { backgroundColor: '#091626', borderRadius: 11, borderWidth: 1, borderColor: '#203854', padding: 16, marginTop: 8 },
  emptyText: { color: '#94a3b8', fontSize: 10, textAlign: 'center', lineHeight: 16 },
  back: { padding: 14, alignItems: 'center' },
  backText: { color: '#7db3ff', fontSize: 10, fontWeight: '900' },
});
