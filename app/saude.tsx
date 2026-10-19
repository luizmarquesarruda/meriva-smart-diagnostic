import { useEffect, useMemo, useState } from 'react';
import { cockpitTheme } from '../src/ui/cockpitTheme';
import { CockpitScreenHeader } from '../src/ui/CockpitScreenHeader';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { runLocalDiagnostic, type DiagnosticResult } from '../src/diagnostics/diagnosticEngine';
import type { PidObservation } from '../src/types/sourceTypes';
import { getVehicleConditionSnapshot, formatSparkline } from '../src/obd/liveTelemetry';
import { getDtcDefinition } from '../src/obd/dtcDefinition';
import * as FileSystem from 'expo-file-system';
import { readRecentDiagnosticFindings, type DiagnosticFindingHistoryEntry } from '../src/diagnostics/findingHistory';

const HISTORY_BASE_PATH = `${FileSystem.documentDirectory}MERIVA_SMART`;

export default function SaudeScreen() {
  const layout = useMidLayout();
  const [state,setState]=useState(getAutoSaveState());
  const [findingHistory,setFindingHistory]=useState<DiagnosticFindingHistoryEntry[]>([]);
  useEffect(()=>{const t=setInterval(()=>setState(getAutoSaveState()),1000);return()=>clearInterval(t)},[]);
  useEffect(() => {
    let active = true;
    const loadHistory = () => {
      void readRecentDiagnosticFindings(HISTORY_BASE_PATH, 10)
        .then((entries) => { if (active) setFindingHistory(entries); })
        .catch(() => { if (active) setFindingHistory([]); });
    };
    loadHistory();
    const timer = setInterval(loadHistory, 30_000);
    return () => { active = false; clearInterval(timer); };
  }, []);
  const context = getVehicleConditionSnapshot();
  const activeDtcs = state.dtcs.filter((item) => ['CURRENT', 'CONFIRMED', 'PENDING', 'PERMANENT'].includes(item.status));
  const diagnostic: DiagnosticResult = useMemo(()=>runLocalDiagnostic({observations:state.lastReadings.map(r=>({pid:r.pid,name:r.name,value:r.value,unit:r.unit,source:r.source==='SIMULACAO'?'SIMULACAO':'REAL_OBD',timestamp:r.timestamp,confidence:r.source==='SIMULACAO'?'LOW':'GOOD'} as PidObservation)),dtcs:state.dtcs,condition:context.condition}),[state,context.condition]);
  const dataInsufficient = diagnostic.hypotheses.length === 0 && activeDtcs.length === 0 && diagnostic.freshDiagnosticEvidenceGroups === 0;\n  const normal = diagnostic.hypotheses.length === 0 && activeDtcs.length === 0 && !dataInsufficient;
  return <SafeAreaView style={styles.container} edges={["bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <CockpitScreenHeader title="CENTRAL DE SAÚDE" subtitle="EVIDÊNCIAS • DTC • HIPÓTESES" />
    <View style={[styles.health, normal ? styles.healthOk : styles.healthWarn]}><Text style={normal ? styles.bigOk : styles.bigWarn}>{dataInsufficient ? '● DADOS INSUFICIENTES' : normal ? '● SISTEMA NORMAL' : '● ATENÇÃO NECESSÁRIA'}</Text><Text style={styles.hint}>{dataInsufficient ? 'Sem evidência PID recente (0106+0107 ou 010B). Isso não confirma a saúde do motor.' : activeDtcs.length ? activeDtcs.length + ' DTC ativo(s).' : (state.dtcs.length ? state.dtcs.length + ' registro(s) histórico(s), sem DTC ativo.' : 'Nenhum DTC registrado.')}</Text></View>
    <Text style={styles.section}>CONEXÃO</Text>
    <View style={[styles.infoGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>Bluetooth</Text><Text style={state.obd.connected?styles.ok:styles.muted}>{state.obd.connected?'CONECTADO':'AGUARDANDO'}</Text></View>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>ECU</Text><Text style={state.obd.ecuValidatedAt?styles.ok:styles.muted}>{state.obd.ecuValidatedAt?'VALIDADA':'NÃO VALIDADA'}</Text></View>
    </View>
    <Text style={styles.section}>CONTEXTO OPERACIONAL</Text>
    <View style={[styles.contextGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>Condição</Text><Text style={styles.ok}>{context.condition}</Text></View>
      <View style={styles.context}><Text style={styles.contextText}>{context.reason}</Text></View>
    </View>
    <Text style={styles.section}>FALHAS</Text>
    {!activeDtcs.length?<View style={styles.empty}><Text style={styles.emptyText}>{state.dtcs.length ? 'Nenhum DTC ativo. Há apenas histórico registrado.' : 'Nenhum DTC armazenado.'}</Text></View>:activeDtcs.map(d=>{const definition=getDtcDefinition(d.code);return <View key={d.code} style={styles.row}><View style={{flex:1}}><Text style={styles.name}>{d.code} • {definition?.name ?? 'Descrição não catalogada localmente'}</Text><Text style={styles.detail}>{definition?.description ?? 'Código recebido da ECU sem descrição local detalhada.'}</Text><Text style={styles.detail}>{d.status} • {d.occurrences} ocorrência(s) • fonte {d.source}</Text>{d.freezeFrame ? <Text style={styles.detail}>FREEZE FRAME: quadro {d.freezeFrame.frame} • DTC {d.freezeFrame.dtc ?? d.code} • RPM {d.freezeFrame.rpm ?? 'N/D'} • ECT {d.freezeFrame.coolantC == null ? 'N/D' : d.freezeFrame.coolantC + ' °C'} • PIDs adicionais: {d.freezeFrame.parameters?.filter((item) => item.available).length ?? 0}</Text> : null}</View><Text style={styles.warn}>ATENÇÃO</Text></View>})}
    <Text style={styles.section}>HIPÓTESES LOCAIS</Text>
    {!diagnostic.hypotheses.length?<View style={styles.empty}><Text style={styles.emptyText}>Ainda não há evidência suficiente para gerar hipótese.</Text></View>:diagnostic.hypotheses.map(h=><View key={h.id} style={styles.hyp}><View style={styles.rowHead}><Text style={styles.name}>{h.label}</Text><Text style={styles.score}>{Math.round(h.score*100)}%</Text></View><Text style={styles.detail}>CONFIANÇA: {h.confidence}</Text>{h.evidence.map((e,i)=><Text key={i} style={styles.evidence}>• {e.text}</Text>)}<Text style={styles.next}>PRÓXIMOS TESTES: {h.nextTests.join(' • ')}</Text></View>)}
    {diagnostic.blockedStaleObservations > 0 ? <Text style={styles.warn}>DADOS ANTIGOS IGNORADOS: {diagnostic.blockedStaleObservations} leitura(s) REAL_OBD fora da janela de atualidade. Atualize os PIDs antes de concluir que o sistema está normal ou de avaliar uma hipótese.</Text> : null}
    <Text style={styles.disclaimer}>{diagnostic.disclaimer}</Text>
    <Text style={styles.section}>HISTÓRICO TEMPORAL DE EVIDÊNCIAS</Text>
    <Text style={styles.disclaimer}>As observações mostram persistência de hipóteses ao longo do tempo; não equivalem a falhas independentes confirmadas. O histórico registra fonte, contexto, horário local e horário UTC.</Text>
    {findingHistory.length ? findingHistory.map((entry) => (
      <View key={entry.id} style={styles.hyp}>
        <View style={styles.rowHead}>
          <Text style={styles.name}>{entry.label}</Text>
          <Text style={styles.score}>{Math.round(entry.score * 100)}%</Text>
        </View>
        <Text style={styles.detail}>CONFIANÇA: {entry.confidence} • OBSERVAÇÕES: {entry.observations} • CONTEXTO: {entry.condition}</Text>
        <Text style={styles.detail}>PRIMEIRA: {new Date(entry.firstSeenAt).toLocaleString()} (UTC {entry.firstSeenAt})</Text>
        <Text style={styles.detail}>ÚLTIMA: {new Date(entry.lastSeenAt).toLocaleString()} (UTC {entry.lastSeenAt})</Text>
        <Text style={styles.detail}>FONTES: {entry.sources.join(', ') || 'N/D'}</Text>
        <Text style={styles.detail}>TENDÊNCIA DO SCORE: {entry.timeline.length ? formatSparkline(entry.timeline.map((point) => point.score)) : 'N/D'} • {entry.timeline.length} ponto(s) temporal(is)</Text>
        {entry.evidence.slice(0, 4).map((e, i) => <Text key={entry.id + '-e-' + i} style={styles.evidence}>• {e.text}</Text>)}
        {entry.nextTests.slice(0, 3).map((item, i) => <Text key={entry.id + '-t-' + i} style={styles.next}>→ {item}</Text>)}
      </View>
    )) : <View style={styles.empty}><Text style={styles.emptyText}>Nenhuma hipótese foi registrada no histórico recente. Ele é preenchido durante a aquisição OBD quando há evidências diagnósticas atuais.</Text></View>}
    <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🔧 EXECUTAR NOVO DIAGNÓSTICO</Text></TouchableOpacity></Link>
    
  </View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:cockpitTheme.background},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},health:{borderRadius:16,borderWidth:1,padding:16,marginBottom:13},healthOk:{backgroundColor:cockpitTheme.successSurface,borderColor:cockpitTheme.success},healthWarn:{backgroundColor:cockpitTheme.dangerSurface,borderColor:cockpitTheme.danger},bigOk:{color:cockpitTheme.success,fontSize:18,fontWeight:'900'},bigWarn:{color:cockpitTheme.danger,fontSize:18,fontWeight:'900'},hint:{color:cockpitTheme.textSecondary,fontSize:10,marginTop:5},section:{color:cockpitTheme.accent,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:7,marginBottom:7},infoGrid:{width:'100%'},contextGrid:{width:'100%'},infoGridLandscape:{flexDirection:'row',flexWrap:'wrap',gap:8},gridRow:{width:'48.5%',marginBottom:0},row:{backgroundColor:cockpitTheme.surface,borderRadius:11,borderWidth:1,borderColor:cockpitTheme.border,padding:12,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},rowHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},name:{flexShrink:1,color:cockpitTheme.textStrong,fontSize:12,fontWeight:'900'},detail:{color:cockpitTheme.muted,fontSize:9,marginTop:3},ok:{color:cockpitTheme.success,fontSize:10,fontWeight:'900'},muted:{color:cockpitTheme.mutedLight,fontSize:10,fontWeight:'900'},warn:{color:cockpitTheme.danger,fontSize:9,fontWeight:'900'},context:{backgroundColor:cockpitTheme.surfaceAlt,borderRadius:10,padding:11,marginBottom:8},contextText:{color:cockpitTheme.muted,fontSize:9,lineHeight:14},empty:{backgroundColor:cockpitTheme.surface,borderRadius:14,padding:14},emptyText:{color:cockpitTheme.mutedLight,fontSize:10,textAlign:'center'},hyp:{backgroundColor:cockpitTheme.surface,borderRadius:14,borderWidth:1,borderColor:cockpitTheme.border,padding:12,marginBottom:8},score:{color:cockpitTheme.accent,fontSize:15,fontWeight:'900'},evidence:{color:cockpitTheme.textSecondary,fontSize:9,lineHeight:15,marginTop:4},next:{color:cockpitTheme.accent,fontSize:9,fontWeight:'800',marginTop:8},disclaimer:{color:cockpitTheme.mutedLight,fontSize:9,lineHeight:14,marginTop:4},primary:{backgroundColor:cockpitTheme.primary,borderRadius:11,padding:14,alignItems:'center',marginTop:8},primaryText:{color:cockpitTheme.text,fontSize:10,fontWeight:'900'}});