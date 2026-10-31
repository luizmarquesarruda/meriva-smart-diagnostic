import { useEffect, useMemo, useState } from 'react';
import { Link } from 'expo-router';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useMidLayout } from '../src/ui/midLayout';
import { COLORS, SCREEN_TITLE_STYLE } from '../src/ui/theme';
import { getAutoSaveState } from '../src/meriva/autosaveManager';
import { isCurrentDiagnosticDtc, runLocalDiagnostic, type DiagnosticResult } from '../src/diagnostics/diagnosticEngine';
import type { PidObservation } from '../src/types/sourceTypes';
import { getLiveSeries, getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import { getSharedObdStatus } from '../src/obd/sharedConnection';
import { getDtcDefinition } from '../src/obd/dtcDefinition';

export default function SaudeScreen() {
  const layout = useMidLayout();
  const [state,setState]=useState(getAutoSaveState());
  useEffect(()=>{const t=setInterval(()=>setState(getAutoSaveState()),1000);return()=>clearInterval(t)},[]);
  const context = getVehicleConditionSnapshot();
  const activeDtcs = state.dtcs.filter((item) => isCurrentDiagnosticDtc(item));
  const diagnostic: DiagnosticResult = useMemo(() => {
    // Somente a série em RAM da sessão OBD atual; nunca um último valor persistido de conexão anterior.
    const observations = ['0106', '0107', '010B'].flatMap((pid) =>
      getLiveSeries(pid).slice(-5).map((reading) => ({
        pid: reading.pid,
        name: reading.name,
        value: reading.value,
        unit: reading.unit,
        source: 'REAL_OBD' as const,
        timestamp: reading.timestamp,
        confidence: 'GOOD' as const,
      })),
    ) as PidObservation[];
    return runLocalDiagnostic({ observations, dtcs: state.dtcs, condition: context.condition });
  }, [state, context.condition]);
  const liveObdStatus = getSharedObdStatus();
  const ecuCurrentlyValidated = liveObdStatus.ecuConnected;
  const noCurrentFindings = diagnostic.hypotheses.length === 0 && activeDtcs.length === 0;
  const normal = noCurrentFindings && ecuCurrentlyValidated && diagnostic.evaluatedRuleGroups > 0;
  const inconclusive = noCurrentFindings && !normal;
  return <SafeAreaView style={styles.container} edges={["top","bottom","left","right"]}><ScrollView contentContainerStyle={[styles.content,{paddingHorizontal:layout.horizontalPadding}]} showsHorizontalScrollIndicator={false}><View style={[styles.screenFrame,{maxWidth:layout.maxContentWidth}]}>
    <View style={styles.header}><Text style={[styles.title,{fontSize:layout.titleSize-3}]}>CENTRAL DE SAÚDE</Text><Text style={styles.subtitle}>EVIDÊNCIAS • DTC • HIPÓTESES</Text></View>
    <View style={[styles.health, normal ? styles.healthOk : inconclusive ? styles.healthUnknown : styles.healthWarn]}><Text style={normal ? styles.bigOk : inconclusive ? styles.bigUnknown : styles.bigWarn}>{normal ? '● SEM ALERTAS NAS LEITURAS ATUAIS' : inconclusive ? '● DADOS INSUFICIENTES' : '● ATENÇÃO NECESSÁRIA'}</Text><Text style={styles.hint}>{normal ? 'Nenhuma hipótese local foi acionada pelos PIDs reais recentes; isso não certifica a saúde total do veículo.' : inconclusive ? 'Sem ECU validada e PIDs reais recentes, a ausência de alertas não significa que o sistema esteja normal.' : activeDtcs.length ? activeDtcs.length + ' DTC(s) ativo(s) de origem REAL_OBD registrados; confirme em nova leitura da ECU.' : 'Há hipóteses locais que exigem verificação; consulte as evidências e próximos testes.'}</Text></View>
    <Text style={styles.section}>CONEXÃO</Text>
    <View style={[styles.infoGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}>
        <Text style={styles.name}>Bluetooth</Text>
        <Text style={liveObdStatus.bluetoothConnected ? styles.ok : styles.muted}>
          {liveObdStatus.bluetoothConnected ? 'CONECTADO' : liveObdStatus.lifecycle === 'BLUETOOTH_OFF' ? 'DESLIGADO' : 'DESCONECTADO'}
        </Text>
      </View>
      <View style={[styles.row, layout.landscape && styles.gridRow]}>
        <Text style={styles.name}>ECU</Text>
        <Text style={liveObdStatus.ecuConnected ? styles.ok : liveObdStatus.ecuResponseState === 'NO_RESPONSE' ? styles.warn : styles.muted}>
          {liveObdStatus.ecuConnected ? 'RESPONDENDO' : liveObdStatus.ecuResponseState === 'NO_RESPONSE' ? 'SEM RESPOSTA' : liveObdStatus.ecuResponseState === 'RECOVERING' ? 'RECUPERANDO' : 'NÃO VALIDADA'}
        </Text>
      </View>
    </View>
    <Text style={styles.section}>CONTEXTO OPERACIONAL</Text>
    <View style={[styles.contextGrid, layout.landscape && styles.infoGridLandscape]}>
      <View style={[styles.row, layout.landscape && styles.gridRow]}><Text style={styles.name}>Condição</Text><Text style={styles.ok}>{context.condition}</Text></View>
      <View style={styles.context}><Text style={styles.contextText}>{context.reason}</Text></View>
    </View>
    <Text style={styles.section}>FALHAS</Text>
    {!activeDtcs.length?<View style={styles.empty}><Text style={styles.emptyText}>{state.dtcs.length ? 'Nenhum DTC ativo. Há apenas histórico registrado.' : 'Nenhum DTC armazenado.'}</Text></View>:activeDtcs.map(d=>{const definition=getDtcDefinition(d.code);return <View key={d.code} style={styles.row}><View style={{flex:1}}><Text style={styles.name}>{d.code} • {definition?.name ?? 'Descrição não catalogada localmente'}</Text><Text style={styles.detail}>{definition?.description ?? 'Código recebido da ECU sem descrição local detalhada.'}</Text><Text style={styles.detail}>{d.status} • {d.occurrences} ocorrência(s) • fonte {d.source}</Text></View><Text style={styles.warn}>ATENÇÃO</Text></View>})}
    <Text style={styles.section}>HIPÓTESES LOCAIS</Text>
    {!diagnostic.hypotheses.length?<View style={styles.empty}><Text style={styles.emptyText}>Ainda não há evidência suficiente para gerar hipótese.</Text></View>:diagnostic.hypotheses.map(h=><View key={h.id} style={styles.hyp}><View style={styles.rowHead}><Text style={styles.name}>{h.label}</Text><Text style={styles.score}>PONTUAÇÃO HEURÍSTICA: {Math.round(h.score*100)}/100</Text></View><Text style={styles.detail}>NÍVEL QUALITATIVO: {h.confidence} • NÃO É PROBABILIDADE ESTATÍSTICA</Text>{h.evidence.map((e,i)=><Text key={i} style={styles.evidence}>• {e.text}</Text>)}<Text style={styles.next}>PRÓXIMOS TESTES: {h.nextTests.join(' • ')}</Text></View>)}
    {diagnostic.blockedStaleSamples > 0 ? <Text style={styles.detail}>LEITURAS ANTIGAS/FUTURAS BLOQUEADAS: {diagnostic.blockedStaleSamples}</Text> : null}
    {diagnostic.blockedInvalidSamples > 0 ? <Text style={styles.detail}>LEITURAS INVÁLIDAS/IMPLAUSÍVEIS BLOQUEADAS: {diagnostic.blockedInvalidSamples}</Text> : null}
    {diagnostic.blockedNonLiveSamples > 0 ? <Text style={styles.detail}>DADOS IMPORTADOS/REFERÊNCIA BLOQUEADOS: {diagnostic.blockedNonLiveSamples}</Text> : null}
    {diagnostic.blockedDuplicateSamples > 0 ? <Text style={styles.detail}>AMOSTRAS COM TIMESTAMP DUPLICADO BLOQUEADAS: {diagnostic.blockedDuplicateSamples}</Text> : null}
    {diagnostic.blockedStaleDtcs > 0 ? <Text style={styles.detail}>DTCs COM ÚLTIMA OBSERVAÇÃO ANTIGA/FUTURA BLOQUEADOS: {diagnostic.blockedStaleDtcs}</Text> : null}
    <Text style={styles.detail}>AMOSTRAS OBD ATUAIS ACEITAS: {diagnostic.acceptedLiveSamples} · GRUPOS DE REGRAS AVALIADOS: {diagnostic.evaluatedRuleGroups}</Text>
    <Text style={styles.disclaimer}>{diagnostic.disclaimer}</Text>
    <Link href="/laboratorio" asChild><TouchableOpacity style={styles.primary}><Text style={styles.primaryText}>🔧 EXECUTAR NOVO DIAGNÓSTICO</Text></TouchableOpacity></Link>
    <Link href="/" asChild><TouchableOpacity style={styles.back}><Text style={styles.backText}>← VOLTAR AO COCKPIT</Text></TouchableOpacity></Link>
  </View></ScrollView></SafeAreaView>;
}
const styles=StyleSheet.create({container:{flex:1,backgroundColor:COLORS.screen},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},screenFrame:{width:'100%',alignSelf:'center'},header:{marginBottom:12},title: { ...SCREEN_TITLE_STYLE, marginBottom: 6 },subtitle:{color:COLORS.accent,fontSize:9,fontWeight:'900',marginTop:3},health:{borderRadius:16,borderWidth:1,padding:16,marginBottom:13},healthOk:{backgroundColor:'#10261b',borderColor:'#28613e'},healthWarn:{backgroundColor:'#28151c',borderColor:'#713043'},healthUnknown:{backgroundColor:'#101d2c',borderColor:'#30455e'},bigUnknown:{color:'#cbd5e1',fontSize:18,fontWeight:'900'},bigOk:{color:COLORS.success,fontSize:18,fontWeight:'900'},bigWarn:{color:COLORS.danger,fontSize:18,fontWeight:'900'},hint:{color:'#a9b9cc',fontSize:10,marginTop:5},section:{color:COLORS.accent,fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:7,marginBottom:7},infoGrid:{width:'100%'},contextGrid:{width:'100%'},infoGridLandscape:{flexDirection:'row',flexWrap:'wrap',gap:8},gridRow:{width:'48.5%',marginBottom:0},row:{backgroundColor:COLORS.surface,borderRadius:11,borderWidth:1,borderColor:'#233a56',padding:12,marginBottom:7,flexDirection:'row',justifyContent:'space-between',alignItems:'center'},rowHead:{flexDirection:'row',justifyContent:'space-between',alignItems:'center'},name:{flexShrink:1,color:COLORS.text,fontSize:12,fontWeight:'900'},detail:{color:COLORS.textSubtle,fontSize:9,marginTop:3},ok:{color:COLORS.success,fontSize:10,fontWeight:'900'},muted:{color:'#94a3b8',fontSize:10,fontWeight:'900'},warn:{color:COLORS.danger,fontSize:9,fontWeight:'900'},context:{backgroundColor:'#0b1829',borderRadius:10,padding:11,marginBottom:8},contextText:{color:'#8194ad',fontSize:9,lineHeight:14},empty:{backgroundColor:COLORS.surface,borderRadius:11,padding:14},emptyText:{color:'#94a3b8',fontSize:10,textAlign:'center'},hyp:{backgroundColor:COLORS.surface,borderRadius:12,borderWidth:1,borderColor:'#304a68',padding:12,marginBottom:8},score:{color:COLORS.accent,fontSize:15,fontWeight:'900'},evidence:{color:'#c2d0df',fontSize:9,lineHeight:15,marginTop:4},next:{color:'#9fc5f7',fontSize:9,fontWeight:'800',marginTop:8},disclaimer:{color:'#64748b',fontSize:9,lineHeight:14,marginTop:4},primary:{minHeight:48,backgroundColor:COLORS.primary,borderRadius:11,padding:14,alignItems:'center',justifyContent:'center',marginTop:8},actionContent:{flexDirection:'row',alignItems:'center',justifyContent:'center',gap:5},primaryText:{color:COLORS.white,fontSize:10,fontWeight:'900'},back:{minHeight:48,padding:14,alignItems:'center',justifyContent:'center'},backText:{color:COLORS.accent,fontSize:10,fontWeight:'900'}});