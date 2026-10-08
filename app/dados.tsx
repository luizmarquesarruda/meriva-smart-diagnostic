import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { autoTripService } from '../src/trip/autoTripService';
import { gpsTracker } from '../src/gps';
import { getLivePidTrend, formatSparkline, getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import { getPidDefinition } from '../src/obd/pidDefinition';

export default function DadosScreen() {
  const layout = useMidLayout();
  const [state, setState] = useState(getAutoSaveState());
  const [trip, setTrip] = useState(autoTripService.getState());
  useEffect(() => {
    const timer = setInterval(() => { setState(getAutoSaveState()); setTrip(autoTripService.getState()); }, 1000);
    return () => clearInterval(timer);
  }, []);
  const readings = [...state.lastReadings].reverse();
  return <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <Header title="DADOS EM TEMPO REAL" subtitle="PIDs • TELEMETRIA • TENDÊNCIAS" />
    <View style={styles.liveCard}><Text style={styles.liveTitle}>{state.obd.connected ? '● ECU CONECTADA' : '○ ECU AGUARDANDO'}</Text><Text style={styles.liveHint}>{state.obd.protocol ? 'PROTOCOLO ' + state.obd.protocol : 'Conecte o ELM327 para receber PIDs reais.'}</Text></View>
    <View style={styles.grid}>
      <Metric landscape={layout.landscape} label="VELOCIDADE" value={gpsTracker.getState().currentSpeedKmh.toFixed(0) + ' km/h'} />
      <Metric landscape={layout.landscape} label="DISTÂNCIA" value={trip.distanceKm.toFixed(2) + ' km'} />
      <Metric landscape={layout.landscape} label="CONSUMO" value={trip.consumptionKml != null && trip.consumptionKml > 0 ? trip.consumptionKml.toFixed(1) + ' km/L' : 'N/D'} />
      <Metric landscape={layout.landscape} label="AUTONOMIA" value={state.autonomy.estimatedRangeKm > 0 ? state.autonomy.estimatedRangeKm.toFixed(0) + ' km' : 'N/D'} />
    </View>
    <Text style={styles.section}>CONTEXTO OPERACIONAL</Text>
    <View style={styles.contextCard}>
      <Text style={styles.contextValue}>{getVehicleConditionSnapshot().condition}</Text>
      <Text style={styles.contextHint}>{getVehicleConditionSnapshot().reason}</Text>
    </View>
    <Text style={styles.section}>TENDÊNCIAS REAIS • JANELA MÓVEL</Text>
    {['010C', '010D', '0105', '0111'].map((pid) => {
      const trend = getLivePidTrend(pid);
      const labels: Record<string, string> = { '010C': 'RPM', '010D': 'VELOCIDADE', '0105': 'ARREFECIMENTO', '0111': 'BORBOLETA' };
      return (
        <View key={pid} style={styles.trendRow}>
          <View style={styles.trendInfo}>
            <Text style={styles.name}>{labels[pid]}</Text>
            <Text style={styles.pid}>{pid} • {trend ? trend.samples + ' amostras • ' + trend.ageSeconds.toFixed(0) + ' s desde a última' : 'sem dados reais'}</Text>
            <Text style={styles.spark}>{trend ? formatSparkline(trend.values) : '—'}</Text>
          </View>
          <View style={styles.trendNumbers}>
            <Text style={styles.value}>{trend ? trend.current.toFixed(1) : 'N/D'}</Text>
            <Text style={styles.pid}>{trend ? 'mín ' + trend.min.toFixed(1) + ' • máx ' + trend.max.toFixed(1) : ''}</Text>
          </View>
        </View>
      );
    })}
    <Text style={styles.section}>ÚLTIMAS LEITURAS REAIS</Text>
    {!readings.length ? <Empty text="Nenhum PID real registrado ainda. Use DIAGNÓSTICO para consultar a ECU." /> : readings.slice(0, 12).map((item) => { const definition=getPidDefinition(item.pid); return <View key={item.timestamp + item.pid} style={styles.row}><View style={{flex:1}}><Text style={styles.name} numberOfLines={2}>{item.pid} • {definition?.name ?? item.name}</Text><Text style={styles.pid}>{definition?.description ?? 'Descrição não catalogada localmente'} • {item.status}</Text></View><Text style={styles.value}>{item.value == null ? 'N/D' : String(item.value) + (item.unit ? ' ' + item.unit : '')}</Text></View>})}
    <View style={styles.note}><Text style={styles.noteText}>A tela não inventa telemetria: somente leituras marcadas como REAL entram como evidência do veículo.</Text></View>
    <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🔧 CONSULTAR / DESCOBRIR PIDs</Text></TouchableOpacity></Link>
    <Back />
  </View></ScrollView></SafeAreaView>;
}
function Header({title,subtitle}:{title:string;subtitle:string}){return <View style={styles.header}><Text style={styles.title}>{title}</Text><Text style={styles.subtitle}>{subtitle}</Text></View>}
function Metric({label,value,landscape=false}:{label:string;value:string;landscape?:boolean}){return <View style={[styles.metric,landscape&&styles.metricLandscape]}><Text style={styles.label}>{label}</Text><Text style={styles.metricValue}>{value}</Text></View>}
function Empty({text}:{text:string}){return <View style={styles.empty}><Text style={styles.emptyText}>{text}</Text></View>}
function Back(){return <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR AO COCKPIT</Text></TouchableOpacity></Link>}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},header:{marginBottom:12},title:{color:'#f8fafc',fontSize:22,fontWeight:'900',letterSpacing:1},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3,letterSpacing:1},liveCard:{backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},liveTitle:{color:'#4ade80',fontWeight:'900',fontSize:12},liveHint:{color:'#7185a1',fontSize:9,marginTop:4},grid:{flexDirection:'row',flexWrap:'wrap',gap:8,marginBottom:12},metric:{width:'48%',backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#233a56',padding:12},metricLandscape:{width:'auto',flex:1},label:{color:'#7185a1',fontSize:8,fontWeight:'900'},metricValue:{color:'#e5edf7',fontSize:17,fontWeight:'900',marginTop:4},section:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1,marginBottom:7},contextCard:{backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#28415f',padding:12,marginBottom:12},contextValue:{color:'#7db3ff',fontSize:15,fontWeight:'900'},contextHint:{color:'#94a3b8',fontSize:9,lineHeight:14,marginTop:4},trendInfo:{flex:1,minWidth:0},trendRow:{backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:7,flexDirection:'row',alignItems:'center'},trendNumbers:{alignItems:'flex-end',marginLeft:8,minWidth:74},spark:{color:'#7db3ff',fontSize:13,letterSpacing:0.5,marginTop:6},row:{backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:11,marginBottom:7,flexDirection:'row',alignItems:'center'},name:{color:'#e5edf7',fontSize:12,fontWeight:'900'},pid:{color:'#64748b',fontSize:8,marginTop:3},value:{color:'#9fc5f7',fontSize:12,fontWeight:'900'},note:{backgroundColor:'#0b1829',borderRadius:10,padding:11,marginVertical:5},noteText:{color:'#8194ad',fontSize:9,lineHeight:15},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:8},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},empty:{backgroundColor:'#0e1b2d',borderRadius:12,padding:16},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center',lineHeight:16},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}});