import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';
import { autoTripService, type AutoTripServiceState } from '../src/trip/autoTripService';
import { getLivePidTrend } from '../src/obd/liveTelemetry';

const LIVE_PIDS = [
  { pid: '010D', label: 'VELOCIDADE', unit: 'km/h', digits: 0 },
  { pid: '010C', label: 'ROTAÇÃO DO MOTOR', unit: 'rpm', digits: 0 },
  { pid: '0105', label: 'TEMPERATURA DO MOTOR', unit: '°C', digits: 0 },
  { pid: '0111', label: 'ACELERADOR', unit: '%', digits: 1 },
  { pid: '012F', label: 'NÍVEL DO TANQUE', unit: '%', digits: 1 },
  { pid: '015E', label: 'CONSUMO INSTANTÂNEO', unit: 'L/h', digits: 2 },
  { pid: '010F', label: 'TEMPERATURA DO AR', unit: '°C', digits: 0 },
  { pid: '010B', label: 'PRESSÃO DO COLETOR', unit: 'kPa', digits: 1 },
];

export default function ViagensScreen() {
  const layout = useMidLayout();
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [trip, setTrip] = useState<AutoTripServiceState>(autoTripService.getState());
  const [, setRefresh] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let loadingCycles = false;
    const refreshCycles = async () => {
      if (loadingCycles) return;
      loadingCycles = true;
      try {
        const stored = await readDriveCycles(FileSystem.documentDirectory + 'MERIVA_SMART');
        if (!cancelled) setCycles(stored);
      } catch {
        if (!cancelled) setCycles([]);
      } finally {
        loadingCycles = false;
      }
    };
    void refreshCycles();
    const unsubscribe = autoTripService.subscribe(setTrip);
    const renderTimer = setInterval(() => setRefresh((value) => value + 1), 2000);
    const historyTimer = setInterval(() => { void refreshCycles(); }, 10_000);
    return () => {
      cancelled = true;
      unsubscribe();
      clearInterval(renderTimer);
      clearInterval(historyTimer);
    };
  }, []);

  const summary = getDriveCycleSummary(cycles);
  const realCycles = cycles.filter((cycle) => cycle.source === 'REAL_OBD');
  const consumptionLabel = realCycles.length === 0
    ? 'CONSUMO MÉDIO (SEM VIAGENS)'
    : realCycles.every((cycle) => cycle.fuelRateSource === 'MEASURED_015E')
      ? 'CONSUMO MÉDIO MEDIDO'
      : realCycles.some((cycle) => ['ESTIMATED_MAF', 'ESTIMATED_MAP', 'MIXED'].includes(cycle.fuelRateSource ?? ''))
        ? 'CONSUMO MÉDIO ESTIMADO/MISTO'
        : 'CONSUMO MÉDIO (FONTE NÃO CONFIRMADA)';
  const live = LIVE_PIDS.map((item) => ({ ...item, reading: getLivePidTrend(item.pid) }));
  const format = (value: number | null | undefined, digits = 1) =>
    value == null || !Number.isFinite(value) ? 'AGUARDANDO PID' : value.toFixed(digits);

  return <SafeAreaView style={styles.container} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <Text style={styles.title}>VIAGENS</Text>
    <Text style={styles.subtitle}>TELEMETRIA ECU + DISTÂNCIA GPS • SEM TRAJETOS IMPORTADOS</Text>
    <View style={[styles.status, trip.connected ? styles.statusOn : styles.statusOff]}>
      <Text style={styles.statusText}>{trip.connected ? trip.error?.includes('ECU SEM RESPOSTA') ? '● ADAPTADOR OK — ECU SEM RESPOSTA' : trip.active ? '● VIAGEM EM ANDAMENTO' : '● ECU CONECTADA — AGUARDANDO MOVIMENTO' : '○ AGUARDANDO CONEXÃO COM A ECU'}</Text>
    </View>
    <View style={styles.grid}>
      <Metric l="DISTÂNCIA ATUAL" v={trip.active ? trip.distanceKm.toFixed(2) + ' km' : '—'} />
      <Metric l="COMBUSTÍVEL USADO" v={trip.active ? trip.fuelUsedL.toFixed(3) + ' L' : '—'} />
      <Metric l="MÉDIA DA VIAGEM" v={trip.consumptionKml != null ? trip.consumptionKml.toFixed(2) + ' km/L' : '—'} />
    </View>
    <View style={styles.grid}>
      <Metric l="AUTONOMIA ESTIMADA" v={trip.estimatedRangeKm > 0 ? Math.round(trip.estimatedRangeKm) + ' km' : 'N/D'} />
      <Metric l="NÍVEL DO TANQUE" v={trip.fuelLevelPercent != null ? trip.fuelLevelPercent.toFixed(0) + '%' : 'PID indisponível'} />
    </View>
    {trip.fuelReserve === true && <Text style={styles.warning}>⚠️ RESERVA DE COMBUSTÍVEL — leitura do PID 012F</Text>}
    {trip.error && <Text style={styles.note}>{trip.error}</Text>}

    <Text style={styles.section}>TELEMETRIA ÚTIL NA VIAGEM</Text>
    <Text style={styles.hint}>Somente leituras recentes recebidas da ECU. PIDs não suportados ou sem resposta ficam sem valor.</Text>
    <View style={styles.pidGrid}>{live.map((item) => <View style={styles.pidCard} key={item.pid}>
      <Text style={styles.pidLabel}>{item.label}</Text>
      <Text style={styles.pidValue}>{item.reading && item.reading.ageSeconds <= 10 ? format(item.reading.current, item.digits) : '—'}</Text>
      <Text style={styles.pidUnit}>{item.reading && item.reading.ageSeconds <= 10 ? item.unit + ' • PID ' + item.pid : 'SEM LEITURA RECENTE • ' + item.pid}</Text>
    </View>)}</View>

    <Text style={styles.section}>RESUMO DE VIAGENS REAIS</Text>
    <View style={styles.grid}>
      <Metric l="VIAGENS SALVAS" v={String(summary.realCycleCount)} />
      <Metric l="DISTÂNCIA ACUMULADA" v={summary.totalDistanceKm.toFixed(1) + ' km'} />
      <Metric l={consumptionLabel} v={summary.avgConsumptionKml > 0 ? summary.avgConsumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
    </View>
    <Text style={styles.section}>ÚLTIMAS VIAGENS</Text>
    {cycles.filter((cycle) => cycle.source === 'REAL_OBD').slice().reverse().slice(0, 20).map((c, i) =>
      <View style={styles.row} key={String(c.id ?? i)}>
        <View style={styles.historyMain}>
          <Text style={styles.name}>{c.startedAt ? new Date(c.startedAt).toLocaleString() : 'VIAGEM ' + (i + 1)}</Text>
          <Text style={styles.historyMeta}>{c.distanceTotalKm.toFixed(2)} km • {c.avgFuelConsumptionKml > 0 ? c.avgFuelConsumptionKml.toFixed(2) + ' km/L' : 'consumo N/D'}</Text>
          <Text style={styles.historyMeta}>{c.fuelRateSource === 'MEASURED_015E' ? 'taxa medida pelo PID 015E' : c.fuelRateSource === 'ESTIMATED_MAF' ? 'consumo estimado por MAF' : c.fuelRateSource === 'ESTIMATED_MAP' ? 'consumo estimado por MAP' : c.fuelRateSource === 'MIXED' ? 'fonte de combustível mista' : 'fonte do consumo não confirmada'}</Text>
        </View>
        <Text style={styles.realBadge}>REAL OBD</Text>
      </View>
    )}
    {!cycles.some((cycle) => cycle.source === 'REAL_OBD') && <View style={styles.empty}><Text style={styles.emptyText}>Nenhuma viagem real salva. Os dados aparecerão após uma viagem registrada com leituras válidas da ECU.</Text></View>}
    <Link href="/armazenamento" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🗂️ ABRIR HISTÓRICO E EXPORTAÇÃO</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}

function Metric({ l, v }: { l: string; v: string }) {
  return <View style={styles.metric}><Text style={styles.label}>{l}</Text><Text style={styles.value}>{v}</Text></View>;
}
const styles = StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},
  screenFrame:{width:'100%',alignSelf:'center'},title:{color:'#f8fafc',fontSize:24,fontWeight:'900'},
  subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,marginBottom:12},
  status:{borderRadius:10,padding:11,marginBottom:10,borderWidth:1},statusOn:{backgroundColor:'#102d2a',borderColor:'#247d68'},
  statusOff:{backgroundColor:'#0e1b2d',borderColor:'#233a56'},statusText:{color:'#dbeafe',fontSize:10,fontWeight:'900'},
  grid:{flexDirection:'row',gap:8,marginBottom:8},metric:{flex:1,backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:11},
  label:{color:'#7185a1',fontSize:8,fontWeight:'900'},value:{color:'#e5edf7',fontSize:15,fontWeight:'900',marginTop:4},
  section:{color:'#7db3ff',fontSize:10,fontWeight:'900',marginTop:12,marginBottom:7},
  hint:{color:'#94a3b8',fontSize:10,lineHeight:15,marginBottom:8},
  pidGrid:{flexDirection:'row',flexWrap:'wrap',gap:8},pidCard:{width:'48%',flexGrow:1,backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:11},
  pidLabel:{color:'#9fb2cc',fontSize:9,fontWeight:'800'},pidValue:{color:'#f8fafc',fontSize:19,fontWeight:'900',marginTop:5},
  pidUnit:{color:'#7185a1',fontSize:8,marginTop:4},warning:{color:'#fbbf24',fontSize:10,fontWeight:'900',marginBottom:8},
  note:{color:'#fbbf24',fontSize:9,marginBottom:8},row:{backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:12,marginBottom:7,flexDirection:'row',alignItems:'center',justifyContent:'space-between'},
  historyMain:{flex:1},name:{color:'#dbeafe',fontSize:10,fontWeight:'800'},historyMeta:{color:'#94a3b8',fontSize:9,marginTop:4},
  realBadge:{color:'#6ee7b7',fontSize:8,fontWeight:'900',marginLeft:8},empty:{backgroundColor:'#0e1b2d',padding:15,borderRadius:11},
  emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center',lineHeight:16},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:12},
  primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});