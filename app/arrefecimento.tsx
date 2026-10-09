import { useEffect, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { getLivePidTrend, formatSparkline } from '../src/obd/liveTelemetry';
import { getSharedObdStatus } from '../src/obd/sharedConnection';

const STALE_SECONDS = 10;
function tempStatus(value: number | null, fresh: boolean): { label: string; tone: 'muted' | 'ok' | 'warn' | 'danger' } {
  if (!fresh || value == null) return { label: 'AGUARDANDO RESPOSTA REAL DA ECU', tone: 'muted' };
  if (value >= 115) return { label: 'MUITO ELEVADA — VERIFIQUE COM SEGURANÇA', tone: 'danger' };
  if (value >= 105) return { label: 'ELEVADA — ACOMPANHE A EVOLUÇÃO', tone: 'warn' };
  if (value < 70) return { label: 'MOTOR AINDA AQUECENDO', tone: 'muted' };
  return { label: 'LEITURA ATUAL', tone: 'ok' };
}
function Trend({ pid, title, unit }: { pid: string; title: string; unit: string }) {
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(timer); }, []);
  void tick;
  const trend = getLivePidTrend(pid);
  const fresh = Boolean(trend && Number.isFinite(trend.ageSeconds) && trend.ageSeconds <= STALE_SECONDS);
  return <View style={styles.trendCard}>
    <View style={styles.trendHeader}><View style={{ flex: 1 }}><Text style={styles.metricLabel}>{title}</Text><Text style={styles.pid}>PID {pid} • {unit}</Text></View><Text style={styles.age}>{fresh && trend ? Math.floor(trend.ageSeconds) + ' s' : 'SEM DADOS'}</Text></View>
    <Text style={styles.trendValue}>{fresh && trend ? trend.current.toFixed(1) + ' ' + unit : '—'}</Text>
    <Text style={styles.spark}>{fresh && trend ? formatSparkline(trend.values) : 'Sem amostras recentes'}</Text>
    <View style={styles.stats}><Text style={styles.stat}>MÍN {fresh && trend ? trend.min.toFixed(1) + '°' : '—'}</Text><Text style={styles.stat}>MÉD {fresh && trend ? trend.average.toFixed(1) + '°' : '—'}</Text><Text style={styles.stat}>MÁX {fresh && trend ? trend.max.toFixed(1) + '°' : '—'}</Text></View>
    <Text style={styles.note}>{fresh && trend ? trend.samples + ' amostras em memória • última resposta ' + trend.lastTimestamp : 'A leitura antiga não é exibida como valor atual.'}</Text>
  </View>;
}
export default function ArrefecimentoScreen() {
  const layout = useMidLayout();
  const [tick, setTick] = useState(0);
  useEffect(() => { const timer = setInterval(() => setTick((v) => v + 1), 1000); return () => clearInterval(timer); }, []);
  void tick;
  const trend = getLivePidTrend('0105');
  const fresh = Boolean(trend && Number.isFinite(trend.ageSeconds) && trend.ageSeconds <= STALE_SECONDS);
  const status = tempStatus(fresh && trend ? trend.current : null, fresh);
  const connection = getSharedObdStatus();
  const gaugePercent = fresh && trend ? Math.max(0, Math.min(100, ((trend.current - 40) / 80) * 100)) : 0;
  return <SafeAreaView style={styles.container} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsVerticalScrollIndicator={false}><View style={[styles.frame,{maxWidth:layout.maxContentWidth}]}>
    <Text style={styles.title}>MONITOR TÉRMICO</Text><Text style={styles.subtitle}>ARREFECIMENTO • ADMISSÃO • DADOS REAIS</Text>
    <View style={styles.hero}>
      <Text style={styles.eyebrow}>TEMPERATURA DO LÍQUIDO DE ARREFECIMENTO</Text>
      <Text style={styles.heroValue}>{fresh && trend ? trend.current.toFixed(0) + ' °C' : '— °C'}</Text>
      <Text style={[styles.status, styles[status.tone]]}>{status.label}</Text>
      <View style={styles.gauge}><View style={[styles.gaugeFill,{width: gaugePercent + '%'}]} /></View>
      <View style={styles.gaugeLabels}><Text style={styles.small}>40 °C</Text><Text style={styles.small}>80 °C</Text><Text style={styles.small}>120 °C</Text></View>
      <Text style={styles.note}>PID padrão OBD-II 0105 • {fresh && trend ? 'resposta há ' + Math.floor(trend.ageSeconds) + ' s' : 'sem resposta recente'}</Text>
    </View>
    <View style={styles.connection}><Text style={styles.metricLabel}>ESTADO DA ECU</Text><Text style={styles.connectionValue}>{connection.ecuConnected ? 'ECU RESPONDENDO' : connection.bluetoothConnected ? 'BLUETOOTH ATIVO • ECU NÃO VALIDADA' : 'DESCONECTADO'}</Text><Text style={styles.note}>A conexão Bluetooth isolada não confirma que a ECU está respondendo.</Text></View>
    <Trend pid="0105" title="HISTÓRICO TÉRMICO DA SESSÃO" unit="°C" />
    <Trend pid="010F" title="TEMPERATURA DO AR DE ADMISSÃO" unit="°C" />
    <View style={styles.disclaimer}><Text style={styles.disclaimerTitle}>COMO INTERPRETAR</Text><Text style={styles.note}>As faixas de atenção são orientativas, não especificações oficiais do Meriva. Compare com o manual e confirme sintomas antes de concluir que há superaquecimento. Se houver alerta do painel, vapor ou perda de líquido, pare em local seguro e não abra o reservatório quente.</Text></View>
    <Link href="/dados" asChild><TouchableOpacity style={styles.button}><Text style={styles.buttonText}>📊 VER TODOS OS DADOS E TENDÊNCIAS</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR AO COCKPIT</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({
 container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},frame:{width:'100%',alignSelf:'center'},
 title:{color:'#f8fafc',fontSize:24,fontWeight:'900',letterSpacing:1},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3,marginBottom:14},
 hero:{backgroundColor:'#102033',borderRadius:18,borderWidth:1,borderColor:'#38617d',padding:18,marginBottom:10},eyebrow:{color:'#8fbce8',fontSize:9,fontWeight:'900',letterSpacing:.7},heroValue:{color:'#f8fafc',fontSize:44,fontWeight:'900',marginTop:8,fontVariant:['tabular-nums']},
 status:{fontSize:10,fontWeight:'900',marginTop:4},muted:{color:'#94a3b8'},ok:{color:'#4ade80'},warn:{color:'#fbbf24'},danger:{color:'#fb7185'},
 gauge:{height:10,backgroundColor:'#091526',borderRadius:8,overflow:'hidden',marginTop:16},gaugeFill:{height:10,backgroundColor:'#38bdf8',borderRadius:8},gaugeLabels:{flexDirection:'row',justifyContent:'space-between',marginTop:5},small:{color:'#7185a1',fontSize:8,fontWeight:'800'},
 connection:{backgroundColor:'#0e1b2d',borderRadius:13,borderWidth:1,borderColor:'#28415f',padding:13,marginBottom:10},connectionValue:{color:'#e5edf7',fontSize:13,fontWeight:'900',marginTop:5},
 trendCard:{backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#28415f',padding:14,marginBottom:10},trendHeader:{flexDirection:'row',alignItems:'center'},metricLabel:{color:'#7185a1',fontSize:9,fontWeight:'900',letterSpacing:.5},pid:{color:'#64748b',fontSize:9,marginTop:4},age:{color:'#9fc5f7',fontSize:9,fontWeight:'900'},trendValue:{color:'#e5edf7',fontSize:25,fontWeight:'900',marginTop:9},spark:{color:'#7db3ff',fontSize:19,letterSpacing:1,marginTop:8},stats:{flexDirection:'row',justifyContent:'space-between',marginTop:8},stat:{color:'#9fb4cf',fontSize:9,fontWeight:'900'},note:{color:'#8194ad',fontSize:9,lineHeight:15,marginTop:8},
 disclaimer:{backgroundColor:'#0b1829',borderRadius:12,padding:13,marginVertical:4},disclaimerTitle:{color:'#dbeafe',fontSize:10,fontWeight:'900',marginBottom:5},
 button:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:8},buttonText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});