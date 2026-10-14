import {useEffect,useMemo,useRef,useState} from 'react';
import {Link} from 'expo-router';
import {ActivityIndicator,ScrollView,StyleSheet,Text,TouchableOpacity,View} from 'react-native';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import {useMidLayout} from '../src/ui/midLayout';
import {getSharedObdConnection,getSharedObdStatus,subscribeSharedObd,subscribeSharedObdStatus} from '../src/obd/sharedConnection';
import {getPidDefinition} from '../src/obd/pidDefinition';
import {assessSensorSample,type SensorTestMode,type SensorTestSample,type SensorAssessment} from '../src/diagnostics/sensorTestEngine';

const PIDS=['010C','010D','0104','0105','0106','0107','010A','010B','010E','010F','0110','0111','0114','012C','012D','012E','012F','0133','0142','0143','0145','0146','0152','0159','015A','015C','015D','015E','0161','0162'];
const labels:Record<SensorAssessment['state'],string>={CONSISTENTE:'COERENTE',INVESTIGAR:'INVESTIGAR',SEM_RESPOSTA:'SEM RESPOSTA',NAO_CONCLUSIVO:'NÃO CONCLUSIVO'};
const colors:Record<SensorAssessment['state'],string>={CONSISTENTE:'#4ade80',INVESTIGAR:'#fbbf24',SEM_RESPOSTA:'#fb7185',NAO_CONCLUSIVO:'#93c5fd'};
const valueText=(s:SensorTestSample)=>s.value==null?'N/D':`${s.value.toFixed(2)} ${s.unit}`;

export default function TestesSensoresScreen(){
 const layout=useMidLayout(); const [mode,setMode]=useState<SensorTestMode>('ENGINE_OFF');
 const [running,setRunning]=useState(false); const [progress,setProgress]=useState(0);
 const [samples,setSamples]=useState<SensorTestSample[]>([]); const [message,setMessage]=useState('Conecte o ELM327 e valide a ECU.');
 const [error,setError]=useState(''); const [savedPath,setSavedPath]=useState(''); const [revision,setRevision]=useState(0);
 const cancelled=useRef(false);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);const a=subscribeSharedObd(refresh),b=subscribeSharedObdStatus(refresh);return()=>{cancelled.current=true;a();b();};},[]);
 const connection=getSharedObdConnection(), status=getSharedObdStatus();
 const connected=Boolean(connection?.ecuValidated&&status.ecuConnected);
 const supported=useMemo(()=>new Set((connection?.supportedPids??[]).map(p=>p.replace(/\s/g,'').toUpperCase())),[revision,connection?.supportedPids]);
 const assessments=useMemo(()=>samples.map(sample=>({sample,assessment:assessSensorSample(sample,mode,samples)})),[samples,mode]);
 async function runTests(){
  cancelled.current=false;setRunning(true);setProgress(0);setSamples([]);setError('');setSavedPath('');
  try{
   const active=getSharedObdConnection();
   if(!active?.ecuValidated||!getSharedObdStatus().ecuConnected)throw new Error('ECU não validada. Conecte pelo módulo Bluetooth/ELM327 antes de testar.');
   if(!supported.has('010C'))throw new Error('A ECU não anunciou o PID 010C (RPM), necessário para confirmar a condição do motor. Nenhum teste foi iniciado.');
   const available=PIDS.filter(pid=>supported.has(pid)&&getPidDefinition(pid));
   if(!available.length)throw new Error('Nenhum PID do catálogo foi anunciado como suportado. Nenhum comando será enviado por tentativa.');
   setMessage('Confirmando a condição do motor pela RPM real…');
   const pre=await active.session.queryPid('010C'), rpm=pre.parsed.value;
   if(pre.parsed.status!=='RESPONDEU'||rpm==null)throw new Error('Não foi possível confirmar a condição do motor pela RPM.');
   if(mode==='ENGINE_OFF'&&rpm>50)throw new Error(`RPM ${rpm.toFixed(0)}: o motor parece ligado. Desligue-o ou selecione Motor ligado.`);
   if(mode==='ENGINE_ON'&&rpm<400)throw new Error(`RPM ${rpm.toFixed(0)}: não foi possível confirmar motor funcionando em marcha lenta.`);
   setMessage(`Consultando ${available.length} PIDs suportados, um por vez…`);
   for(let i=0;i<available.length;i++){
    if(cancelled.current)break;
    const current=getSharedObdConnection();
    if(!current?.ecuValidated||!getSharedObdStatus().ecuConnected)throw new Error('Conexão ECU perdida. As amostras concluídas foram mantidas.');
    const pid=available[i], r=await current.session.queryPid(pid);
    const sample:SensorTestSample={pid,name:r.parsed.name,value:r.parsed.status==='RESPONDEU'?r.parsed.value:null,unit:r.parsed.unit,status:r.parsed.status,rawResponse:r.rx,elapsedMs:r.elapsedMs,timestamp:new Date().toISOString()};
    setSamples(prev=>[...prev,sample]);setProgress(i+1);
   }
   setMessage(cancelled.current?'Teste interrompido; resultados parciais mantidos.':'Varredura concluída. Revise as evidências e salve o relatório TXT.');
  }catch(e){setError(e instanceof Error?e.message:'Falha desconhecida');setMessage('O teste não foi concluído normalmente.');}
  finally{setRunning(false);}
 }
 async function saveReport(){
  if(!samples.length){setError('Ainda não há amostras para salvar.');return;}
  try{
   const dir=`${FileSystem.documentDirectory}MERIVA_SMART/testes-sensores`;await FileSystem.makeDirectoryAsync(dir,{intermediates:true});
   const path=`${dir}/teste-sensores-${new Date().toISOString().replace(/[:.]/g,'-')}.txt`;
   const lines=['MERIVA SMART DIAGNOSTIC — TESTE DE SENSORES',`Data: ${new Date().toLocaleString()}`,`Condição: ${mode==='ENGINE_OFF'?'IGNIÇÃO LIGADA / MOTOR DESLIGADO':'MOTOR LIGADO'}`,`ECU validada: ${getSharedObdConnection()?.ecuValidated?'SIM':'NÃO'}`,`Protocolo: ${getSharedObdConnection()?.protocol??'N/D'}`,'','RESULTADOS'];
   for(const s of samples){const a=assessSensorSample(s,mode,samples);lines.push(`${s.pid} — ${s.name}`,`Valor: ${valueText(s)} | Parser: ${s.status}`,`Avaliação: ${a.title} [${a.state}]`,a.explanation,`Latência: ${s.elapsedMs} ms | ${s.timestamp}`,`RX bruto: ${s.rawResponse||'VAZIO'}`,'');}
   lines.push('LIMITAÇÃO: resposta OBD válida não comprova exatidão física/elétrica. Limiares são heurísticos e não substituem especificações de fábrica ou instrumentos externos.');
   await FileSystem.writeAsStringAsync(path,lines.join('\n'));setSavedPath(path);setError('');setMessage('Relatório TXT salvo no armazenamento privado do aplicativo.');
  }catch(e){setError(e instanceof Error?e.message:'Falha ao salvar TXT.');}
 }
 const stop=()=>{cancelled.current=true;setMessage('Parada solicitada; a consulta atual será concluída antes de parar.');};
 const valid=samples.filter(s=>s.status==='RESPONDEU').length, attention=assessments.filter(x=>x.assessment.state==='INVESTIGAR').length;
 return <SafeAreaView style={st.container} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={[st.content,{paddingHorizontal:layout.horizontalPadding}]}><View style={[st.frame,{maxWidth:layout.maxContentWidth}]}>
 <Text style={st.title}>CENTRAL DE TESTES</Text><Text style={st.subtitle}>DADOS REAIS • AVALIAÇÃO LOCAL • RELATÓRIO TXT</Text>
 <View style={[st.connection,connected?st.good:st.warn]}><Text style={connected?st.goodTitle:st.warnTitle}>{connected?'● ECU VALIDADA':'● ECU NÃO VALIDADA'}</Text><Text style={st.muted}>{connection?.device.name??'Nenhum adaptador ativo'} · {connection?.protocol??'Protocolo N/D'}</Text><Text style={st.muted}>Só serão consultados PIDs anunciados como suportados pela ECU.</Text></View>
 <Text style={st.section}>CONDIÇÃO DO MOTOR</Text><View style={[st.modes,layout.landscape&&st.modesWide]}>
 <TouchableOpacity disabled={running} onPress={()=>setMode('ENGINE_OFF')} style={[st.mode,mode==='ENGINE_OFF'&&st.selected]}><Text style={st.icon}>⏻</Text><Text style={st.modeTitle}>Motor desligado</Text><Text style={st.muted}>Ignição ligada, motor parado</Text></TouchableOpacity>
 <TouchableOpacity disabled={running} onPress={()=>setMode('ENGINE_ON')} style={[st.mode,mode==='ENGINE_ON'&&st.selected]}><Text style={st.icon}>◉</Text><Text style={st.modeTitle}>Motor ligado</Text><Text style={st.muted}>Teste parado, sem conduzir</Text></TouchableOpacity></View>
 <View style={st.notice}><Text style={st.noticeTitle}>Antes de iniciar</Text><Text style={st.noticeText}>Estacione em local seguro. Motor ligado: mantenha o veículo parado e o freio de estacionamento aplicado. Não use esta tela durante a condução.</Text></View>
 <TouchableOpacity disabled={!connected||running} onPress={()=>void runTests()} style={[st.primary,(!connected||running)&&st.disabled]}>{running?<ActivityIndicator color="#06111f"/>:<Text style={st.primaryText}>▶ INICIAR VARREDURA</Text>}</TouchableOpacity>
 {running&&<TouchableOpacity onPress={stop} style={st.stop}><Text style={st.stopText}>PARAR APÓS CONSULTA ATUAL</Text></TouchableOpacity>}
 <Text style={st.message}>{message}</Text>{error?<Text style={st.error}>{error}</Text>:null}
 {running&&<Text style={st.muted}>Progresso: {progress} PIDs consultados</Text>}
 {samples.length>0&&<><View style={st.summary}><View style={st.summaryCell}><Text style={st.count}>{samples.length}</Text><Text style={st.muted}>Consultados</Text></View><View style={st.summaryCell}><Text style={st.count}>{valid}</Text><Text style={st.muted}>Válidos</Text></View><View style={st.summaryCell}><Text style={[st.count,{color:'#fbbf24'}]}>{attention}</Text><Text style={st.muted}>Investigar</Text></View></View>
 <Text style={st.section}>RESULTADOS POR SENSOR</Text>{assessments.map(({sample,assessment})=><View key={sample.pid} style={st.card}><View style={st.resultHead}><View style={{flex:1}}><Text style={st.sensor}>{sample.name}</Text><Text style={st.pid}>{sample.pid} · {sample.elapsedMs} ms</Text></View><View style={{alignItems:'flex-end',maxWidth:'55%'}}><Text style={st.value}>{valueText(sample)}</Text><Text style={[st.state,{color:colors[assessment.state]}]}>{labels[assessment.state]}</Text></View></View><Text style={st.resultTitle}>{assessment.title}</Text><Text style={st.explanation}>{assessment.explanation}</Text><Text style={st.raw}>RX: {sample.rawResponse||'SEM RESPOSTA BRUTA'}</Text></View>)}
 <TouchableOpacity onPress={()=>void saveReport()} style={st.save}><Text style={st.saveText}>SALVAR RELATÓRIO TXT</Text></TouchableOpacity>{savedPath?<Text selectable style={st.saved}>{savedPath}</Text>:null}</>}
 <View style={st.disclaimer}><Text style={st.resultTitle}>Critério técnico</Text><Text style={st.explanation}>Resposta válida não significa sensor perfeito. A avaliação separa resposta, plausibilidade e hipótese. Alguns defeitos exigem séries temporais, condições específicas ou medição elétrica externa.</Text></View>
 <Link href="/mais" asChild><TouchableOpacity style={st.back}><Text style={st.backText}>← MAIS RECURSOS</Text></TouchableOpacity></Link><Link href="/" asChild><TouchableOpacity style={st.back}><Text style={st.backText}>← COCKPIT</Text></TouchableOpacity></Link>
 </View></ScrollView></SafeAreaView>;
}
const st=StyleSheet.create({
 container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},frame:{width:'100%',alignSelf:'center'},
 title:{color:'#f8fafc',fontSize:23,fontWeight:'900',letterSpacing:1},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3,marginBottom:14},
 connection:{borderRadius:13,borderWidth:1,padding:13,marginBottom:12},good:{backgroundColor:'#10261b',borderColor:'#28613e'},warn:{backgroundColor:'#28151c',borderColor:'#713043'},goodTitle:{color:'#4ade80',fontSize:12,fontWeight:'900',marginBottom:4},warnTitle:{color:'#fb7185',fontSize:12,fontWeight:'900',marginBottom:4},muted:{color:'#a3b4ca',fontSize:10,marginTop:3},
 section:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:13,marginBottom:8},modes:{gap:9},modesWide:{flexDirection:'row'},mode:{flex:1,backgroundColor:'#0e1b2d',borderRadius:13,borderWidth:1,borderColor:'#233a56',padding:14,minHeight:112},selected:{borderColor:'#3b82f6',backgroundColor:'#122a43'},icon:{color:'#60a5fa',fontSize:23,fontWeight:'900'},modeTitle:{color:'#f8fafc',fontSize:13,fontWeight:'900',marginTop:6},
 notice:{backgroundColor:'#152238',borderRadius:11,borderWidth:1,borderColor:'#304767',padding:12,marginTop:12,marginBottom:12},noticeTitle:{color:'#fbbf24',fontSize:11,fontWeight:'900'},noticeText:{color:'#c4d2e4',fontSize:10,lineHeight:16,marginTop:4},
 primary:{backgroundColor:'#60a5fa',padding:15,borderRadius:12,alignItems:'center',justifyContent:'center',minHeight:48},primaryText:{color:'#06111f',fontSize:11,fontWeight:'900'},disabled:{opacity:.4},stop:{borderColor:'#fb7185',borderWidth:1,padding:13,borderRadius:12,alignItems:'center',marginTop:8},stopText:{color:'#fb7185',fontSize:10,fontWeight:'900'},message:{color:'#a3b4ca',fontSize:10,lineHeight:15,marginTop:10},error:{color:'#fb7185',backgroundColor:'#28151c',borderRadius:9,padding:10,fontSize:10,marginTop:8},
 summary:{flexDirection:'row',gap:7,marginTop:13},summaryCell:{flex:1,backgroundColor:'#0e1b2d',borderRadius:10,padding:10,alignItems:'center'},count:{color:'#f8fafc',fontSize:19,fontWeight:'900'},card:{backgroundColor:'#0e1b2d',borderColor:'#233a56',borderWidth:1,borderRadius:12,padding:12,marginBottom:8},resultHead:{flexDirection:'row',alignItems:'flex-start',gap:8},sensor:{color:'#e5edf7',fontSize:12,fontWeight:'900'},pid:{color:'#7185a1',fontSize:9,marginTop:3},value:{color:'#f8fafc',fontSize:14,fontWeight:'900',textAlign:'right'},state:{fontSize:9,fontWeight:'900',marginTop:3,textAlign:'right'},resultTitle:{color:'#dbeafe',fontSize:10,fontWeight:'900',marginTop:9},explanation:{color:'#9fb0c6',fontSize:10,lineHeight:15,marginTop:4},raw:{color:'#647b98',fontSize:9,marginTop:8},
 save:{backgroundColor:'#173c2b',borderColor:'#28613e',borderWidth:1,padding:14,borderRadius:11,alignItems:'center',marginTop:4},saveText:{color:'#4ade80',fontSize:10,fontWeight:'900'},saved:{color:'#93c5fd',fontSize:9,marginTop:7},disclaimer:{backgroundColor:'#101b2a',borderRadius:11,padding:12,marginTop:14},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});
