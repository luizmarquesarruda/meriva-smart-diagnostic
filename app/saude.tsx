import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { runLocalDiagnostic, type DiagnosticResult } from '../src/diagnostics/diagnosticEngine';
import type { PidObservation } from '../src/types/sourceTypes';
import { getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import { getDtcDefinition } from '../src/obd/dtcDefinition';
import { getSharedObdStatus, subscribeSharedObdStatus } from '../src/obd/sharedConnection';

export default function SaudeScreen() {
  const layout = useMidLayout();
  const [state,setState]=useState(getAutoSaveState());
  const [connectionStatus,setConnectionStatus]=useState(getSharedObdStatus());
  useEffect(()=>{
    const unsubscribeStatus=subscribeSharedObdStatus(setConnectionStatus);
    const timer=setInterval(()=>setState(getAutoSaveState()),1000);
    return ()=>{clearInterval(timer);unsubscribeStatus();};
  },[]);
  const context = getVehicleConditionSnapshot();
  const activeDtcs = state.dtcs.filter((item) =>
    item.source === 'REAL_OBD' && ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status));
  const diagnostic: DiagnosticResult = useMemo(
    ()=>runLocalDiagnostic({
      observations:state.lastReadings.map(r=>({
        pid:r.pid,name:r.name,value:r.value,unit:r.unit,
        source:r.source==='SIMULACAO'?'SIMULACAO':'REAL_OBD',
        timestamp:r.timestamp,confidence:r.source==='SIMULACAO'?'LOW':'GOOD',
      } as PidObservation)),
      dtcs:state.dtcs,condition:context.condition,
    }),
    [state,context.condition],
  );
  const nowMs = Date.now();
  const recentRealReadingCount = state.lastReadings.filter((reading) => {
    if (reading.source !== 'REAL' || reading.status !== 'RESPONDEU'
      || reading.value == null || !Number.isFinite(reading.value)) return false;
    const timestampMs = Date.parse(reading.timestamp);
    const ageMs = nowMs - timestampMs;
    return Number.isFinite(timestampMs) && ageMs >= 0 && ageMs <= 30_000;
  }).length;
  const healthState = !connectionStatus.ecuConnected
    ? 'unvalidated'
    : activeDtcs.length > 0 || diagnostic.hypotheses.length > 0
      ? 'attention'
      : recentRealReadingCount === 0
        ? 'insufficient'
        : 'observed';
  const healthTitle = healthState === 'unvalidated'
    ? '● ECU NÃO VALIDADA'
    : healthState === 'attention'
      ? '● ATENÇÃO NECESSÁRIA'
      : healthState === 'insufficient'
        ? '● DADOS INSUFICIENTES'
        : '● SEM ANOMALIA LOCAL DETECTADA';
  const healthHint = !connectionStatus.ecuConnected
    ? activeDtcs.length > 0
      ? activeDtcs.length + ' DTC(s) constam do último registro; reconecte para confirmar o estado atual.'
      : 'ECU não validada. Ausência de registros não confirma ausência de falhas.'
    : activeDtcs.length > 0 || diagnostic.hypotheses.length > 0
      ? activeDtcs.length + ' DTC(s) registrado(s) com status ativo/permanente; confirme com leitura atual.'
      : recentRealReadingCount === 0
        ? 'ECU responde, mas não há PID real recente suficiente para avaliar o estado atual.'
        : state.dtcs.length > 0
          ? state.dtcs.length + ' registro(s) histórico(s); sem hipótese local detectada nas leituras recentes.'
          : 'Sem hipótese local nas leituras recentes. Execute uma varredura de DTC para confirmar.';
  return <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <View style={styles.header}><Text style={styles.title}>CENTRAL DE SAÚDE</Text><Text style={styles.subtitle}>EVIDÊNCIAS • DTC • HIPÓTESES</Text></View>
    <View style={[styles.health, healthState === 'attention' ? styles.healthWarn : healthState === 'observed' ? styles.healthOk : styles.healthPending]}><Text style={healthState === 'attention' ? styles.bigWarn : healthState === 'observed' ? styles.bigOk : styles.bigPending}>{healthTitle}</Text><Text style={styles.hint}>{healthHint}</Text></View>
    <Text style={styles.section}>CONEXÃO</Text>
    <View style={[styles.infoGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>Bluetooth</Text><Text style={connectionStatus.bluetoothConnected?styles.ok:styles.muted}>{connectionStatus.bluetoothConnected?'CONECTADO':'DESCONECTADO'}</Text></View>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>ECU</Text><Text style={connectionStatus.ecuConnected?styles.ok:connectionStatus.ecuResponseState==='NO_RESPONSE'?styles.warn:styles.muted}>{connectionStatus.ecuConnected?'RESPONDENDO':connectionStatus.ecuResponseState==='NO_RESPONSE'?'SEM RESPOSTA':connectionStatus.bluetoothConnected?'AGUARDANDO VALIDAÇÃO':'NÃO VALIDADA'}</Text></View>
    </View>
    <Text style={styles.section}>CONTEXTO OPERACIONAL</Text>
    <View style={[styles.contextGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>Condição</Text><Text style={context.condition==='UNKNOWN'?styles.muted:styles.ok}>{context.condition}</Text></View>
      <View style={styles.context}><Text style={styles.contextText}>{context.reason}</Text></View>
    </View>
    <Text style={styles.section}>FALHAS</Text>
    {!connectionStatus.ecuConnected && activeDtcs.length > 0 ? <Text style={styles.detail}>Os códigos abaixo são registros salvos; sem ECU conectada, não representam uma nova varredura atual.</Text> : null}
    {!activeDtcs.length?<View style={styles.empty}><Text style={styles.emptyText}>{state.dtcs.length ? 'Nenhum DTC ativo. Há apenas histórico registrado.' : 'Nenhum DTC armazenado.'}</Text></View>:activeDtcs.map(d=>{const definition=getDtcDefinition(d.code);return <View key={d.code} style={styles.row}><View style={{flex:1}}><Text style={styles.name}>{d.code} • {definition?.name ?? 'Descrição não catalogada localmente'}</Text><Text style={styles.detail}>{definition?.description ?? 'Código recebido da ECU sem descrição local detalhada.'}</Text><Text style={styles.detail}>{d.status} • {d.occurrences} ocorrência(s) • fonte {d.source}</Text></View><Text style={styles.warn}>ATENÇÃO</Text></View>})}
    <Text style={styles.section}>HIPÓTESES LOCAIS</Text>
    {!diagnostic.hypotheses.length?<View style={styles.empty}><Text style={styles.emptyText}>Ainda não há evidência suficiente para gerar hipótese.</Text></View>:diagnostic.hypotheses.map(h=><View key={h.id} style={styles.hyp}><View style={styles.rowHead}><Text style={styles.name}>{h.label}</Text><Text style={styles.score}>{Math.round(h.score*100)}%</Text></View><Text style={styles.detail}>CONFIANÇA: {h.confidence}</Text>{h.evidence.map((e,i)=><Text key={i} style={styles.evidence}>• {e.text}</Text>)}<Text style={styles.next}>PRÓXIMOS TESTES: {h.nextTests.join(' • ')}</Text></View>)}
    <Text style={styles.disclaimer}>{diagnostic.disclaimer}</Text>
    <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🔧 EXECUTAR NOVO DIAGNÓSTICO</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR AO COCKPIT</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:COLORS.screen},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},header:{marginBottom:12},title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',marginTop:3},health:{borderRadius:16,borderWidth:1,padding:16,marginBottom:13},healthOk:{backgroundColor:'#10261b',borderColor:'#28613e'},healthWarn:{backgroundColor:'#28151c',borderColor:'#713043'},healthPending:{backgroundColor:'#0e1b2d',borderColor:'#28415f'},bigPending:{color:'#93c5fd',fontSize:18,fontWeight:'900'},bigOk:{color:'#4ade80',fontSize:18,fontWeight:'900'},bigWarn:{color:'#fb7185',fontSize:18,fontWeight:'900'},hint:{color:'#a9b9cc',fontSize:10,marginTop:5},section:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:7,marginBottom:7},infoGrid:{width:'100%'},contextGrid:{width:'100%'},infoGridLandscape:{flexDirection:'row',flexWrap:'wrap',gap:8},gridRow:{width:'48.5%',marginBottom:0},row:{backgroundColor:'#0e1b2d',borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:12,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},rowHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},name:{flexShrink:1,color:'#e5edf7',fontSize:12,fontWeight:'900'},detail:{color:'#7185a1',fontSize:9,marginTop:3},ok:{color:'#4ade80',fontSize:10,fontWeight:'900'},muted:{color:'#94a3b8',fontSize:10,fontWeight:'900'},warn:{color:'#fb7185',fontSize:9,fontWeight:'900'},context:{backgroundColor:'#0b1829',borderRadius:10,padding:11,marginBottom:8},contextText:{color:'#8194ad',fontSize:9,lineHeight:14},empty:{backgroundColor:'#0e1b2d',borderRadius:11,padding:14},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center'},hyp:{backgroundColor:'#0e1b2d',borderRadius:12,borderWidth:1,borderColor:'#304a68',padding:12,marginBottom:8},score:{color:'#7db3ff',fontSize:15,fontWeight:'900'},evidence:{color:'#c2d0df',fontSize:9,lineHeight:15,marginTop:4},next:{color:'#9fc5f7',fontSize:9,fontWeight:'800',marginTop:8},disclaimer:{color:'#64748b',fontSize:9,lineHeight:14,marginTop:4},primary:{backgroundColor:'#2563eb',borderRadius:11,padding:14,alignItems:'center',marginTop:8},actionContent:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},primaryText:{color:'#fff',fontSize:10,fontWeight:'900'},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}});