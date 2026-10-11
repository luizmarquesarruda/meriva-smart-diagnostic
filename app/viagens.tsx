import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import * as FileSystem from 'expo-file-system';
import { readDriveCycles } from '../src/storage/driveCycleStorage';
import { getDriveCycleSummary, type DriveCycle } from '../src/data/driveCycles';

const BASE_PATH = FileSystem.documentDirectory + 'MERIVA_SMART';
const DAY_MS = 86_400_000;
function n(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : null;
}
function dateLabel(value: string): string {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed.toLocaleString() : value;
}
function durationSeconds(value: string): number {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  return match ? Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]) : 0;
}
function mv(value: number | null, unit: string, digits = 1): string {
  return value == null ? 'N/D' : `${value.toFixed(digits)} ${unit}`;
}

export default function ViagensScreen() {
  const layout = useMidLayout();
  const [cycles, setCycles] = useState<DriveCycle[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [periodDays, setPeriodDays] = useState<7 | 30 | 0>(0);
  useEffect(() => {
    let mounted = true;
    void readDriveCycles(BASE_PATH)
      .then(items => { if (mounted) setCycles(items.filter(cycle => cycle.source === 'REAL_OBD')); })
      .catch(() => { if (mounted) setCycles([]); });
    return () => { mounted = false; };
  }, []);

  const visible = useMemo(() => {
    const cutoff = periodDays ? Date.now() - periodDays * DAY_MS : 0;
    return cycles.filter(cycle => !periodDays || new Date(cycle.startedAt).getTime() >= cutoff)
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }, [cycles, periodDays]);
  const summary = getDriveCycleSummary(visible);
  const selected = selectedId ? cycles.find(cycle => cycle.id === selectedId) ?? null : null;

  return <SafeAreaView style={s.container} edges={['top','bottom','left','right']}>
    <ScrollView contentContainerStyle={[s.content,{paddingHorizontal:layout.horizontalPadding}]} showsVerticalScrollIndicator={false}>
      <View style={[s.frame,{maxWidth:layout.maxContentWidth}]}>
        {selected ? <TripDetails cycle={selected} onBack={() => setSelectedId(null)} /> : <>
          <Text style={s.eyebrow}>MERIVA SMART DIAGNOSTIC</Text>
          <Text style={s.title}>RELATÓRIO DE VIAGENS</Text>
          <Text style={s.subtitle}>HISTÓRICO REAL • SESSÕES INDEPENDENTES • DADOS AUDITÁVEIS</Text>
          <View style={s.grid}>
            <Metric l="VIAGENS" v={String(visible.length)} />
            <Metric l="DISTÂNCIA TOTAL" v={mv(summary.totalDistanceKm,'km')} />
            <Metric l="CONSUMO MÉDIO" v={summary.avgConsumptionKml > 0 ? mv(summary.avgConsumptionKml,'km/L') : 'N/D'} />
          </View>
          <Text style={s.section}>PERÍODO</Text>
          <View style={s.filters}>
            {([{label:'TODAS',value:0},{label:'7 DIAS',value:7},{label:'30 DIAS',value:30}] as const).map(item =>
              <TouchableOpacity key={item.value} onPress={() => setPeriodDays(item.value)} style={[s.filter,periodDays === item.value && s.filterActive]}>
                <Text style={[s.filterText,periodDays === item.value && s.filterTextActive]}>{item.label}</Text>
              </TouchableOpacity>
            )}
          </View>
          <Text style={s.section}>HISTÓRICO DE VIAGENS</Text>
          {visible.length ? visible.map(cycle => <TouchableOpacity accessibilityRole="button" onPress={() => setSelectedId(cycle.id)} style={s.card} key={cycle.id}>
            <View style={s.cardHeader}>
              <View style={{flex:1}}>
                <Text style={s.tripDate}>{dateLabel(cycle.startedAt)}</Text>
                <Text style={s.tripRange}>Até {dateLabel(cycle.finishedAt)}</Text>
              </View>
              <Text style={s.chevron}>›</Text>
            </View>
            <View style={s.stats}>
              <Stat label="DISTÂNCIA" value={mv(n(cycle.distanceTotalKm),'km',2)} />
              <Stat label="DURAÇÃO" value={cycle.totalTimeHms || 'N/D'} />
              <Stat label="VEL. MÉDIA" value={mv(n(cycle.avgDrivingSpeedKmh),'km/h')} />
            </View>
            <View style={s.tripFooter}>
              <Text style={s.tripFooterText}>Máxima: {mv(n(cycle.maxSpeedKmh),'km/h')}</Text>
              <Text style={[s.consumption,cycle.fuelDataValid === false && s.muted]}>
                {cycle.fuelDataValid === false || cycle.fuelUsedL < 0.05 || cycle.avgFuelConsumptionKml <= 0 ? 'CONSUMO N/D' : mv(cycle.avgFuelConsumptionKml,'km/L')}
              </Text>
            </View>
          </TouchableOpacity>) : <View style={s.empty}>
            <Text style={s.emptyTitle}>Nenhuma viagem neste período</Text>
            <Text style={s.emptyText}>A lista contém apenas viagens registradas com fonte REAL_OBD. Dados importados ou simulados não são apresentados como trajetos da Meriva.</Text>
          </View>}
          <View style={s.note}>
            <Text style={s.noteTitle}>QUALIDADE DOS DADOS</Text>
            <Text style={s.noteText}>Consumo só aparece quando atende aos critérios mínimos de integração. Sensores sem amostras armazenadas são apresentados como N/D, não como valores presumidos.</Text>
          </View>
          <Link href="/armazenamento" asChild><TouchableOpacity style={s.primary}><Text style={s.primaryText}>ABRIR HISTÓRICO E EXPORTAÇÃO</Text></TouchableOpacity></Link>
          <Link href="/" asChild><TouchableOpacity style={s.back}><Text style={s.backText}>← VOLTAR AO PAINEL</Text></TouchableOpacity></Link>
        </>}
      </View>
    </ScrollView>
  </SafeAreaView>;
}

function TripDetails({cycle,onBack}:{cycle:DriveCycle;onBack:()=>void}) {
  const samples = cycle.telemetrySamples ?? [];
  const coolant = samples.filter(x => n(x.coolantTempC) != null).map(x => x.coolantTempC as number);
  const rpm = samples.filter(x => n(x.rpm) != null).map(x => x.rpm as number);
  const speed = samples.filter(x => n(x.speedKmh) != null).map(x => x.speedKmh as number);
  const min = coolant.length ? Math.min(...coolant) : null;
  const max = coolant.length ? Math.max(...coolant) : null;
  const avg = coolant.length ? coolant.reduce((sum,value)=>sum+value,0)/coolant.length : null;
  const fuelValid = cycle.fuelDataValid !== false && cycle.fuelUsedL >= 0.05 && cycle.avgFuelConsumptionKml > 0;
  const totalSeconds = durationSeconds(cycle.totalTimeHms);
  return <>
    <TouchableOpacity style={s.backInline} onPress={onBack}><Text style={s.backText}>← VOLTAR AO HISTÓRICO</Text></TouchableOpacity>
    <Text style={s.eyebrow}>RELATÓRIO INDIVIDUAL</Text>
    <Text style={s.title}>DETALHES DA VIAGEM</Text>
    <Text style={s.subtitle}>{dateLabel(cycle.startedAt)}</Text>
    <View style={s.hero}>
      <Text style={s.heroLabel}>DISTÂNCIA REGISTRADA</Text>
      <Text style={s.heroValue}>{mv(n(cycle.distanceTotalKm),'km',2)}</Text>
      <Text style={s.heroSub}>{dateLabel(cycle.startedAt)} → {dateLabel(cycle.finishedAt)}</Text>
    </View>
    <Text style={s.section}>RESUMO</Text>
    <View style={s.grid}><Metric l="DURAÇÃO" v={cycle.totalTimeHms || 'N/D'} /><Metric l="EM MOVIMENTO" v={cycle.drivingTimeHms || 'N/D'} /></View>
    <View style={s.grid}><Metric l="TEMPO PARADO" v={cycle.standingTimeHms || 'N/D'} /><Metric l="VEL. MÉDIA" v={mv(n(cycle.avgDrivingSpeedKmh),'km/h')} /></View>
    <View style={s.grid}><Metric l="VEL. MÁXIMA" v={mv(n(cycle.maxSpeedKmh),'km/h')} /><Metric l="MÁXIMO RPM" v={mv(rpm.length?Math.max(...rpm):null,'rpm',0)} /></View>
    <Text style={s.section}>COMBUSTÍVEL</Text>
    <View style={s.card}>
      <Detail label="Combustível integrado" value={fuelValid?mv(n(cycle.fuelUsedL),'L',3):'N/D'} />
      <Detail label="Consumo médio" value={fuelValid?mv(n(cycle.avgFuelConsumptionKml),'km/L',2):'N/D'} />
      <Detail label="Origem da taxa" value={cycle.fuelRateSource ?? 'N/D'} />
      <Text style={s.smallNote}>{fuelValid?'Integração calculada conforme a fonte indicada; não equivale a uma medição física do tanque.':'Dados insuficientes para estimar consumo com segurança neste trajeto.'}</Text>
    </View>
    <Text style={s.section}>TEMPERATURA DO ARREFECIMENTO</Text>
    <View style={s.card}>
      <View style={s.stats}><Stat label="MÍNIMA" value={mv(min,'°C')} /><Stat label="MÉDIA" value={mv(avg,'°C')} /><Stat label="MÁXIMA" value={mv(max,'°C')} /></View>
      {coolant.length ? <View style={s.chart}>
        {coolant.slice(-24).map((value,index)=>{
          const range=Math.max(1,(max??value)-(min??value));
          const height=10+((value-(min??value))/range)*66;
          return <View key={String(index)+String(value)} style={s.chartColumn}><View style={[s.chartBar,{height}]} /></View>;
        })}
      </View> : <Text style={s.emptyText}>N/D — esta viagem não tem amostras de temperatura salvas. A coleta vale para novos trajetos após esta atualização.</Text>}
      <Text style={s.smallNote}>{coolant.length} amostras ECT • {speed.length} amostras de velocidade • {rpm.length} amostras RPM. Visualização das até 24 amostras mais recentes.</Text>
    </View>
    <Text style={s.section}>CONFIABILIDADE E ORIGEM</Text>
    <View style={s.card}>
      <Detail label="Origem do registro" value={cycle.source} />
      <Detail label="Início" value={dateLabel(cycle.startedAt)} />
      <Detail label="Fim" value={dateLabel(cycle.finishedAt)} />
      <Detail label="Amostras temporais" value={String(samples.length)} />
      <Detail label="Duração contabilizada" value={totalSeconds>0?`${Math.round(totalSeconds/60)} min`:'N/D'} />
      <Text style={s.smallNote}>Ausência de amostras significa falta de evidência armazenada, não prova de falha do sensor.</Text>
    </View>
    <Link href="/armazenamento" asChild><TouchableOpacity style={s.primary}><Text style={s.primaryText}>ABRIR EXPORTAÇÃO E DIÁRIO DE BORDO</Text></TouchableOpacity></Link>
  </>;
}
function Metric({l,v}:{l:string;v:string}) { return <View style={s.metric}><Text style={s.label}>{l}</Text><Text style={s.metricValue}>{v}</Text></View>; }
function Stat({label,value}:{label:string;value:string}) { return <View style={s.stat}><Text style={s.label}>{label}</Text><Text style={s.statValue}>{value}</Text></View>; }
function Detail({label,value}:{label:string;value:string}) { return <View style={s.detail}><Text style={s.detailLabel}>{label}</Text><Text style={s.detailValue}>{value}</Text></View>; }

const s=StyleSheet.create({
  container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:16,paddingBottom:34},frame:{width:'100%',alignSelf:'center'},
  eyebrow:{color:'#55d6be',fontSize:9,fontWeight:'900',letterSpacing:1.5,marginBottom:5},title:{color:'#f8fafc',fontSize:25,fontWeight:'900'},subtitle:{color:'#91a9c9',fontSize:10,fontWeight:'700',marginTop:5,marginBottom:16,lineHeight:15},
  grid:{flexDirection:'row',gap:9,marginBottom:9},metric:{flex:1,minWidth:0,backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#233a56',padding:12},label:{color:'#8196b4',fontSize:8,fontWeight:'900',letterSpacing:0.5},metricValue:{color:'#e5edf7',fontSize:15,fontWeight:'900',marginTop:6},
  section:{color:'#55d6be',fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:18,marginBottom:8},filters:{flexDirection:'row',gap:8,marginBottom:3},filter:{flex:1,padding:11,borderRadius:10,borderWidth:1,borderColor:'#29415f',backgroundColor:'#0e1b2d',alignItems:'center'},filterActive:{backgroundColor:'#123a42',borderColor:'#55d6be'},filterText:{color:'#9fb3cd',fontSize:9,fontWeight:'900'},filterTextActive:{color:'#a8fff0'},
  card:{backgroundColor:'#0e1b2d',borderRadius:14,borderWidth:1,borderColor:'#233a56',padding:13,marginBottom:9},cardHeader:{flexDirection:'row',alignItems:'center',justifyContent:'space-between',marginBottom:13},tripDate:{color:'#e5edf7',fontSize:12,fontWeight:'900'},tripRange:{color:'#8196b4',fontSize:9,marginTop:4},chevron:{color:'#55d6be',fontSize:26,fontWeight:'300',marginLeft:10},
  stats:{flexDirection:'row',gap:8,marginBottom:10},stat:{flex:1,minWidth:0},statValue:{color:'#e5edf7',fontSize:12,fontWeight:'900',marginTop:5},tripFooter:{borderTopWidth:1,borderTopColor:'#233a56',paddingTop:10,flexDirection:'row',alignItems:'center',justifyContent:'space-between',gap:8},tripFooterText:{color:'#9fb3cd',fontSize:9},consumption:{color:'#55d6be',fontSize:10,fontWeight:'900'},muted:{color:'#8196b4'},
  empty:{backgroundColor:'#0e1b2d',borderRadius:14,padding:18,borderWidth:1,borderColor:'#233a56'},emptyTitle:{color:'#e5edf7',fontSize:13,fontWeight:'900',marginBottom:7},emptyText:{color:'#9fb3cd',fontSize:10,lineHeight:16},
  note:{backgroundColor:'#0b252e',borderRadius:12,padding:13,marginTop:8,borderWidth:1,borderColor:'#1b5b61'},noteTitle:{color:'#7debd7',fontSize:9,fontWeight:'900',marginBottom:6},noteText:{color:'#bad8dd',fontSize:10,lineHeight:16},
  primary:{backgroundColor:'#176e70',borderRadius:12,padding:15,alignItems:'center',marginTop:13},primaryText:{color:'#f0fdfa',fontSize:10,fontWeight:'900',textAlign:'center'},back:{padding:15,alignItems:'center'},backInline:{alignSelf:'flex-start',paddingVertical:10,marginBottom:8},backText:{color:'#8de8db',fontSize:10,fontWeight:'900'},
  hero:{backgroundColor:'#10363c',borderColor:'#247b7d',borderWidth:1,borderRadius:16,padding:18,marginBottom:4},heroLabel:{color:'#8de8db',fontSize:9,fontWeight:'900',letterSpacing:1},heroValue:{color:'#f0fdfa',fontSize:30,fontWeight:'900',marginTop:6},heroSub:{color:'#b7d9d9',fontSize:9,marginTop:8,lineHeight:15},
  detail:{flexDirection:'row',justifyContent:'space-between',alignItems:'flex-start',gap:12,paddingVertical:8,borderBottomWidth:1,borderBottomColor:'#20334b'},detailLabel:{color:'#9fb3cd',fontSize:10,flex:1},detailValue:{color:'#e5edf7',fontSize:10,fontWeight:'800',flex:1,textAlign:'right'},smallNote:{color:'#8196b4',fontSize:9,lineHeight:15,marginTop:10},
  chart:{height:92,flexDirection:'row',alignItems:'flex-end',gap:3,paddingTop:8,paddingBottom:3},chartColumn:{flex:1,height:82,justifyContent:'flex-end',alignItems:'center'},chartBar:{width:'75%',minHeight:5,backgroundColor:'#55d6be',borderRadius:3},
});
