import { useEffect, useMemo, useRef, useState} from 'react';
import {Link} from 'expo-router';
import {ActivityIndicator, ScrollView, StyleSheet, TouchableOpacity, View } from 'react-native';
import { AdaptiveText as Text } from '../src/ui/AdaptiveText';
import {SafeAreaView} from 'react-native-safe-area-context';
import * as FileSystem from 'expo-file-system';
import { saveSensorTestRunLazy } from '../src/database/diagnosticDatabaseAccess';
import { createLearningProfile, readLearningProfile, updateLearningProfileRealSample } from '../src/database/learningProfile';
import { readPidConfirmations, recordPidConfirmation } from '../src/database/pidBank';
import { getVehicleConditionSnapshot } from '../src/obd/liveTelemetry';
import {useMidLayout} from '../src/ui/midLayout';
import {getSharedObdConnection,getSharedObdStatus,subscribeSharedObd,subscribeSharedObdStatus} from '../src/obd/sharedConnection';
import {getPidDefinition} from '../src/obd/pidDefinition';
import {assessSensorSample,createSensorTestPlan,getSensorTestCatalog,MIN_SENSOR_TEST_READINGS,MAX_SENSOR_TEST_ATTEMPTS,summarizeSensorPidSamples,type SensorTestDefinition,type SensorTestMode,type SensorTestSample,type SensorAssessment} from '../src/diagnostics/sensorTestEngine';
const catalog=getSensorTestCatalog();
const labels:Record<SensorAssessment['state'],string>={CONSISTENTE:'COERENTE',INVESTIGAR:'INVESTIGAR',SEM_RESPOSTA:'SEM RESPOSTA',NAO_CONCLUSIVO:'NÃO CONCLUSIVO'};
const colors:Record<SensorAssessment['state'],string>={CONSISTENTE:'#4ade80',INVESTIGAR:'#fbbf24',SEM_RESPOSTA:'#fb7185',NAO_CONCLUSIVO:'#93c5fd'};

const valueText=(value:number|null,unit:string)=>value==null?'N/D':value.toFixed(2)+' '+unit;
const clock=(milliseconds:number)=>{const seconds=Math.max(0,Math.ceil(milliseconds/1000));return String(Math.floor(seconds/60)).padStart(2,'0')+':'+String(seconds%60).padStart(2,'0');};
export default function TestesSensoresScreen(){
 const layout=useMidLayout(),[mode,setMode]=useState<SensorTestMode>('ENGINE_OFF'),[running,setRunning]=useState(false),[completed,setCompleted]=useState(false),[aborted,setAborted]=useState(false);
 const [samples,setSamples]=useState<SensorTestSample[]>([]),[testPlan,setTestPlan]=useState<SensorTestDefinition[]>([]);
 const [plannedReads,setPlannedReads]=useState(0),[commandProgress,setCommandProgress]=useState(0),[commandPlan,setCommandPlan]=useState(0),[countdownMs,setCountdownMs]=useState(0);
 const [round,setRound]=useState(0),[currentPid,setCurrentPid]=useState(''),[message,setMessage]=useState('Conecte o ELM327 e valide a ECU.');
 const [error,setError]=useState(''),[savedPath,setSavedPath]=useState(''),[revision,setRevision]=useState(0);
 const cancelled=useRef(false),deadline=useRef(0),runStartedAt=useRef(0),commandsDone=useRef(0),commandElapsedTotal=useRef(0),connectedAtStart=useRef(false);
 useEffect(()=>{const refresh=()=>setRevision(n=>n+1);const a=subscribeSharedObd(refresh),b=subscribeSharedObdStatus(refresh);return()=>{cancelled.current=true;a();b();};},[]);
 useEffect(()=>{if(!running)return;const timer=setInterval(()=>{const remain=deadline.current-Date.now();setCountdownMs(remain>0?remain:1000);},1000);return()=>clearInterval(timer);},[running]);
 const connection=getSharedObdConnection(),status=getSharedObdStatus(),connected=Boolean(connection?.ecuValidated&&status.ecuConnected);
 const supported=new Set((connection?.supportedPids??[]).map(p=>p.replace(/\s/g,'').toUpperCase()));
 const grouped=useMemo(()=>testPlan.map(test=>{
  const rows=samples.filter(sample=>sample.pid===test.pid),values=rows.filter(sample=>sample.status==='RESPONDEU'&&sample.value!==null&&Number.isFinite(sample.value)).map(sample=>sample.value as number),last=rows[rows.length-1];
  const summary=summarizeSensorPidSamples(samples,test.pid,test.aggregation);
  const representative:SensorTestSample={pid:test.pid,name:test.label,value:summary.value,unit:last?.unit??getPidDefinition(test.pid)?.unit??'N/D',status:last?.status??'AINDA_NAO_TESTADO',rawResponse:last?.rawResponse??'',elapsedMs:last?.elapsedMs??0,timestamp:last?.timestamp??new Date().toISOString(),readingNumber:last?.readingNumber};
  return {test,rows,values,summary,representative,assessment:assessSensorSample(representative,mode,samples)};
 }),[testPlan,samples,mode]);
 const attention=grouped.filter(x=>x.assessment.state==='INVESTIGAR').length;
 function updateCountdown(remainingCommands:number){
  const timing=catalog.timing,average=commandsDone.current>0?commandElapsedTotal.current/commandsDone.current:timing.defaultCommandLatencyMs;
  const perCommand=Math.max(timing.minimumEstimatedCommandLatencyMs,average+timing.perCommandSafetyMarginMs),ms=Math.max(1000,Math.max(0,remainingCommands)*perCommand+timing.finalizationMarginMs);
  deadline.current=Date.now()+ms;setCountdownMs(ms);
 }
 function recordCommand(elapsedMs:number,totalCommands:number){commandsDone.current+=1;commandElapsedTotal.current+=Math.max(0,elapsedMs);setCommandProgress(commandsDone.current);updateCountdown(totalCommands-commandsDone.current);}
 async function learnCompletedPidSamples(readings:SensorTestSample[],plan:SensorTestDefinition[],selectedMode:SensorTestMode):Promise<number>{
  if(!connectedAtStart.current)return 0;
  const basePath=(FileSystem.documentDirectory??'')+'MERIVA_SMART';
  const eligible=plan.filter(test=>summarizeSensorPidSamples(readings,test.pid,test.aggregation).validSamples>=MIN_SENSOR_TEST_READINGS);
  if(!eligible.length)return 0;
  if(!await readLearningProfile(basePath))await createLearningProfile(basePath,new Date().toISOString());
  const condition=selectedMode==='ENGINE_ON'?getVehicleConditionSnapshot().condition:'UNKNOWN';
  const priorEntries=await readPidConfirmations(basePath);
  let learned=0;
  for(const test of eligible){
   const summary=summarizeSensorPidSamples(readings,test.pid,test.aggregation),valid=readings.filter(item=>item.pid===test.pid&&item.status==='RESPONDEU'&&item.value!==null&&Number.isFinite(item.value));
   if(summary.value===null||valid.length<MIN_SENSOR_TEST_READINGS)continue;
   const definition=getPidDefinition(test.pid),prior=priorEntries.find(item=>item.pid===test.pid),now=new Date().toISOString();
   try{
    await recordPidConfirmation(basePath,{pid:test.pid,name:definition?.name??test.catalogName,classification:prior?.classification??'PADRAO_OBD',status:'RESPONDEU',firstSeen:prior?.firstSeen??valid[0].timestamp,lastSeen:valid[valid.length-1].timestamp,occurrences:(prior?.occurrences??0)+valid.length,protocol:getSharedObdConnection()?.protocol??prior?.protocol??'N/D',responseTime:Math.round(valid.reduce((sum,item)=>sum+item.elapsedMs,0)/valid.length),source:'REAL_OBD',confidence:(prior?.confidence??0)+valid.length,unit:definition?.unit??test.unit,formulaId:definition?.formulaId??test.formulaId,bytes:definition?.bytes,description:definition?.description});
    await updateLearningProfileRealSample(basePath,definition?.name??test.catalogName,summary.value,condition);learned+=1;
   }catch(cause){console.warn('[IA local] não foi possível persistir aprendizado do PID '+test.pid,cause instanceof Error?cause.message:cause);}
  }
  return learned;
 }
 async function runTests(){
  cancelled.current=false;setRunning(true);setCompleted(false);setAborted(false);setCommandProgress(0);setPlannedReads(0);setTestPlan([]);setSamples([]);setError('');setSavedPath('');setRound(0);setCurrentPid('');setMessage('Preparando a varredura e estimando o tempo…');
  runStartedAt.current=Date.now();commandsDone.current=0;commandElapsedTotal.current=0;
  const active=getSharedObdConnection(),activeStatus=getSharedObdStatus();connectedAtStart.current=Boolean(active?.ecuValidated&&activeStatus.ecuConnected);
  const plan=createSensorTestPlan(active?.supportedPids??[],pid=>Boolean(getPidDefinition(pid))),expectedReads=plan.length*MIN_SENSOR_TEST_READINGS,expectedCommands=expectedReads+1;
  setTestPlan(plan);setPlannedReads(expectedReads);setCommandPlan(expectedCommands);setCommandProgress(0);updateCountdown(expectedCommands);
  if(!active?.ecuValidated||!activeStatus.ecuConnected){setError('ECU não validada. Conecte pelo módulo Bluetooth/ELM327 antes de testar.');setMessage('Teste não iniciado: ECU sem resposta válida.');setRunning(false);setAborted(true);setCountdownMs(0);return;}
  if(!supported.has('010C')){setError('A ECU não anunciou o PID 010C (RPM), obrigatório para verificar a condição do motor. Nenhum teste iniciado.');setMessage('Teste não iniciado: condição do motor não validada.');setRunning(false);setAborted(true);setCountdownMs(0);return;}
  if(!plan.some(test=>test.pid==='010C')||plan.length===0){setError('Nenhum PID do catálogo foi anunciado como suportado. Nenhum comando será enviado por tentativa.');setMessage('Teste não iniciado: bitmap sem PIDs catalogados.');setRunning(false);setAborted(true);setCountdownMs(0);return;}
  const readings:SensorTestSample[]=[];let finished=false;
  try{
   setMessage('Confirmando a condição do motor com uma leitura inicial de RPM…');
   const pre=await active.session.queryPid('010C');recordCommand(pre.elapsedMs,expectedCommands);
   const rpm=pre.parsed.status==='RESPONDEU'?pre.parsed.value:null;
   if(pre.parsed.status!=='RESPONDEU'||rpm==null)throw new Error('Não foi possível confirmar a condição do motor pela RPM.');
   if(mode==='ENGINE_OFF'&&rpm>50)throw new Error('RPM '+rpm.toFixed(0)+': o motor parece ligado. Desligue-o ou selecione Motor ligado.');
   if(mode==='ENGINE_ON'&&rpm<400)throw new Error('RPM '+rpm.toFixed(0)+': não foi possível confirmar motor funcionando em marcha lenta.');
   setMessage('Executando rodadas sequenciais para obter cinco respostas válidas por PID. Respostas ausentes também serão registradas como tentativas; nenhum PID será consultado em paralelo.');
   outer:for(let sampleRound=1;sampleRound<=MAX_SENSOR_TEST_ATTEMPTS;sampleRound++){
    setRound(sampleRound);
    for(const test of plan){
     if(cancelled.current)break outer;
     const current=getSharedObdConnection(),currentStatus=getSharedObdStatus();
     if(!current?.ecuValidated||!currentStatus.ecuConnected)throw new Error('Conexão ECU perdida. As amostras concluídas permanecem disponíveis para relatório.');
     setCurrentPid(test.pid);
     const response=await current.session.queryPid(test.pid);
     const sample:SensorTestSample={pid:test.pid,name:test.label,value:response.parsed.status==='RESPONDEU'?response.parsed.value:null,unit:response.parsed.unit||getPidDefinition(test.pid)?.unit||'N/D',status:response.parsed.status,rawResponse:response.rx,elapsedMs:response.elapsedMs,timestamp:new Date().toISOString(),readingNumber:sampleRound};
     readings.push(sample);setSamples([...readings]);recordCommand(response.elapsedMs,expectedCommands);
    }
   }
   const pidsLearned=await learnCompletedPidSamples(readings,plan,mode);
   finished=!cancelled.current&&plan.every(test=>summarizeSensorPidSamples(readings,test.pid,test.aggregation).validSamples>=MIN_SENSOR_TEST_READINGS);
   setCompleted(finished);setAborted(!finished);
   setMessage(finished?'Coleta concluída: cinco respostas válidas por PID. IA local atualizada com médias/modas reais de '+pidsLearned+' PIDs.':'Coleta parcial: apenas PIDs com cinco respostas válidas entraram no aprendizado ('+pidsLearned+'). Revise o relatório antes de concluir.');
   setRound(finished?MIN_SENSOR_TEST_READINGS:0);
  }catch(cause){setError(cause instanceof Error?cause.message:'Falha desconhecida durante a consulta.');setMessage('Varredura não concluída normalmente; leituras finalizadas permanecem disponíveis.');setAborted(true);}
  finally{setRunning(false);setCountdownMs(0);setCurrentPid('');}
 }
 const stop=()=>{cancelled.current=true;setMessage('Parada solicitada; a consulta OBD atual será concluída antes de interromper.');};
 async function saveReport(){
  if(!samples.length){setError('Ainda não há amostras para salvar.');return;}
  try{
   const dir=(FileSystem.documentDirectory??'')+'MERIVA_SMART/testes-sensores';await FileSystem.makeDirectoryAsync(dir,{intermediates:true});
   const path=dir+'/teste-sensores-'+new Date().toISOString().replace(/[:.]/g,'-')+'.txt';
   const lines=['MERIVA SMART DIAGNOSTIC — CENTRAL DE TESTES DE SENSORES','Catálogo: '+catalog.catalogId+' v'+catalog.schemaVersion,'Data: '+new Date().toLocaleString(),'Veículo de referência: Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX 2011/2012','Condição: '+(mode==='ENGINE_OFF'?'IGNIÇÃO LIGADA / MOTOR DESLIGADO':'MOTOR LIGADO, VEÍCULO PARADO'),'ECU validada no início: '+(connectedAtStart.current?'SIM':'NÃO'),'Protocolo observado: '+(getSharedObdConnection()?.protocol??'N/D'),'Leituras mínimas por PID: '+MIN_SENSOR_TEST_READINGS,'PIDs selecionados pela bitmap: '+testPlan.length,'Tentativas previstas: '+plannedReads,'Tentativas registradas: '+samples.length,'Execução completa: '+(completed?'SIM':'NÃO — RELATÓRIO PARCIAL'),'Tempo decorrido: '+Math.round((Date.now()-runStartedAt.current)/1000)+' s','','AVALIAÇÃO POR PID'];
   for(const item of grouped){
    lines.push('',item.test.pid+' — '+item.test.label,'Resultado: '+item.assessment.state+' — '+item.assessment.title,'Explicação: '+item.assessment.explanation,'Guia da IA local: '+item.test.aiGuidance,'Leituras válidas: '+item.values.length+'/'+MIN_SENSOR_TEST_READINGS);
    for(const row of item.rows)lines.push('Leitura '+row.readingNumber+': '+valueText(row.value,row.unit)+' | Parser: '+row.status+' | Latência: '+row.elapsedMs+' ms | '+row.timestamp,'RX bruto: '+(row.rawResponse||'VAZIO'));
   }
   lines.push('','POLÍTICA: resposta positiva confirma resposta do PID, não exatidão física/elétrica do sensor. PIDs fora da bitmap não foram consultados.','REFERÊNCIAS: SAE J1979 supported-PID bitmap; Dashlogic PID listing; OBD2 PID Knowledge; auditoria da Bíblia da Meriva.','Limiares são heurísticos, não especificações OEM. Algumas verificações exigem multímetro, osciloscópio ou condições controladas.');
   await FileSystem.writeAsStringAsync(path,lines.join('\\n'));setSavedPath(path);setError('');
    if(connectedAtStart.current&&runStartedAt.current>0){
     try{
      await saveSensorTestRunLazy({
       id:path.split('/').pop()?.replace(/\.txt$/,'')??('sensor-test-'+Date.now()),
       mode,
       startedAt:new Date(runStartedAt.current).toISOString(),
       finishedAt:new Date().toISOString(),
       completed,
       source:'REAL_OBD',
       samples,
       assessments:grouped.map(item=>({pid:item.test.pid,state:item.assessment.state})),
      });
      setMessage('Relatório TXT salvo; as amostras também foram indexadas no SQLite interno.');
     }catch(databaseCause){
      setMessage('Relatório TXT salvo. O histórico SQLite não foi atualizado; o arquivo TXT foi preservado.');
      setError(databaseCause instanceof Error?('SQLite: '+databaseCause.message):'Falha ao atualizar o banco SQLite.');
     }
    }else{
     setMessage('Relatório TXT salvo. Apenas testes iniciados com ECU real validada entram no histórico SQLite.');
    }
  }catch(cause){setError(cause instanceof Error?cause.message:'Falha ao salvar relatório TXT.');}
 }
 return <SafeAreaView style={st.container} edges={['top','bottom','left','right']}><ScrollView contentContainerStyle={[st.content,{paddingHorizontal:layout.horizontalPadding}]}><View style={[st.frame,{maxWidth:layout.maxContentWidth}]}>
  <Text style={st.title}>CENTRAL DE TESTES</Text><Text style={st.subtitle}>CATÁLOGO JSON • DADOS REAIS • 5 LEITURAS VÁLIDAS POR PID</Text>
  <View style={[st.connection,connected?st.good:st.warn]}><Text style={connected?st.goodTitle:st.warnTitle}>{connected?'● ECU VALIDADA':'● ECU NÃO VALIDADA'}</Text><Text style={st.muted}>{connection?.device.name??'Nenhum adaptador ativo'} · {connection?.protocol??'Protocolo N/D'}</Text><Text style={st.muted}>Só PIDs anunciados pela ECU e cadastrados no catálogo entram na varredura.</Text></View>
  <Text style={st.section}>CONDIÇÃO DO MOTOR</Text><View style={[st.modes,layout.landscape&&st.modesWide]}>
   <TouchableOpacity disabled={running} onPress={()=>setMode('ENGINE_OFF')} style={[st.mode,mode==='ENGINE_OFF'&&st.selected]}><Text style={st.icon}>⏻</Text><Text style={st.modeTitle}>Motor desligado</Text><Text style={st.muted}>Ignição ligada, motor parado</Text></TouchableOpacity>
   <TouchableOpacity disabled={running} onPress={()=>setMode('ENGINE_ON')} style={[st.mode,mode==='ENGINE_ON'&&st.selected]}><Text style={st.icon}>◉</Text><Text style={st.modeTitle}>Motor ligado</Text><Text style={st.muted}>Motor funcionando, carro parado</Text></TouchableOpacity>
  </View>
  <View style={st.notice}><Text style={st.noticeTitle}>Antes de iniciar</Text><Text style={st.noticeText}>Estacione em local seguro, aplique o freio de estacionamento e não use esta tela durante a condução. A duração depende da latência K-Line/ELM327 e da quantidade de PIDs suportados.</Text></View>
  <TouchableOpacity disabled={!connected||running} onPress={()=>void runTests()} style={[st.primary,(!connected||running)&&st.disabled]}>{running?<ActivityIndicator color="#06111f"/>:<Text style={st.primaryText}>▶ INICIAR TESTE COMPLETO</Text>}</TouchableOpacity>
  {running&&<TouchableOpacity onPress={stop} style={st.stop}><Text style={st.stopText}>PARAR APÓS A CONSULTA ATUAL</Text></TouchableOpacity>}
  <View style={st.timerCard}><Text style={st.timerLabel}>{running?'TEMPO ESTIMADO RESTANTE':completed?'TESTE CONCLUÍDO':aborted?'TESTE INTERROMPIDO':'CONTAGEM REGRESSIVA'}</Text><Text style={[st.timer,{color:running?'#60a5fa':completed?'#4ade80':aborted?'#fb7185':'#a3b4ca'}]}>{clock(countdownMs)}</Text><Text style={st.muted}>{running?'Estimativa adaptativa; só encerra após todas as tentativas terminarem.':completed?'Todos os PIDs planejados tiveram três tentativas.':aborted?'Contagem parada por erro/interrupção, não por conclusão completa.':'O contador começa quando você inicia a varredura.'}</Text></View>
  <Text style={st.message}>{message}</Text>{error?<Text style={st.error}>{error}</Text>:null}
  {testPlan.length>0&&<><View style={st.summary}><View style={st.summaryCell}><Text style={st.count}>{testPlan.length}</Text><Text style={st.muted}>PIDs suportados</Text></View><View style={st.summaryCell}><Text style={st.count}>{samples.length}/{plannedReads}</Text><Text style={st.muted}>Tentativas</Text></View><View style={st.summaryCell}><Text style={[st.count,{color:'#fbbf24'}]}>{attention}</Text><Text style={st.muted}>Investigar</Text></View></View>
  {running&&<Text style={st.progress}>Comandos: {commandProgress}/{commandPlan} · rodada {round}/{MIN_SENSOR_TEST_READINGS}{currentPid?' · PID '+currentPid:''}</Text>}
  <Text style={st.section}>RESULTADOS POR PID</Text>
  {grouped.map(({test,rows,values,representative,assessment})=><View key={test.pid} style={st.card}>
   <View style={st.resultHead}><View style={{flex:1}}><Text style={st.sensor}>{test.label}</Text><Text style={st.pid}>{test.pid} · {test.category} · {rows.length}/{MIN_SENSOR_TEST_READINGS} leituras</Text></View><View style={{alignItems:'flex-end',maxWidth:'55%'}}><Text style={st.value}>{valueText(representative.value,representative.unit)}</Text><Text style={[st.state,{color:colors[assessment.state]}]}>{labels[assessment.state]}</Text></View></View>
   <Text style={st.resultTitle}>{assessment.title}</Text><Text style={st.explanation}>{assessment.explanation}</Text><Text style={st.readings}>Valores: {rows.length?rows.map(row=>row.value==null?'N/D':row.value.toFixed(2)).join(' · '):'aguardando'} {representative.unit} | válidas {values.length}/{MIN_SENSOR_TEST_READINGS}</Text><Text style={st.raw}>RX mais recente: {representative.rawResponse||'AINDA SEM RESPOSTA'}</Text>
  </View>)}
  <TouchableOpacity onPress={()=>void saveReport()} style={st.save}><Text style={st.saveText}>SALVAR RELATÓRIO TXT</Text></TouchableOpacity>{savedPath?<Text selectable style={st.saved}>{savedPath}</Text>:null}</>}
  <View style={st.disclaimer}><Text style={st.resultTitle}>Critério da IA local</Text><Text style={st.explanation}>O JSON orienta PIDs, pré-requisitos, faixas heurísticas e recomendações. “Coerente” não certifica o sensor; “investigar” não ordena troca de peça. Três tentativas registram repetibilidade, mas O2, aquecedor, chicote e vácuo podem exigir testes próprios.</Text></View>
  <Link href="/mais" asChild><TouchableOpacity style={st.back}><Text style={st.backText}>← MAIS RECURSOS</Text></TouchableOpacity></Link><Link href="/" asChild><TouchableOpacity style={st.back}><Text style={st.backText}>← COCKPIT</Text></TouchableOpacity></Link>
 </View></ScrollView></SafeAreaView>;
}
const st=StyleSheet.create({
 container:{flex:1,backgroundColor:'#07111f'},content:{flexGrow:1,width:'100%',paddingVertical:14,paddingBottom:30},frame:{width:'100%',alignSelf:'center'},
 title:{color:'#f8fafc',fontSize:23,fontWeight:'900',letterSpacing:1},subtitle:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1,marginTop:3,marginBottom:14},
 connection:{borderRadius:13,borderWidth:1,padding:13,marginBottom:12},good:{backgroundColor:'#10261b',borderColor:'#28613e'},warn:{backgroundColor:'#28151c',borderColor:'#713043'},goodTitle:{color:'#4ade80',fontSize:12,fontWeight:'900',marginBottom:4},warnTitle:{color:'#fb7185',fontSize:12,fontWeight:'900',marginBottom:4},muted:{color:'#a3b4ca',fontSize:10,marginTop:3},
 section:{color:'#7db3ff',fontSize:10,fontWeight:'900',letterSpacing:1,marginTop:13,marginBottom:8},modes:{gap:9},modesWide:{flexDirection:'row'},mode:{flex:1,backgroundColor:'#0e1b2d',borderRadius:13,borderWidth:1,borderColor:'#233a56',padding:14,minHeight:112},selected:{borderColor:'#3b82f6',backgroundColor:'#122a43'},icon:{color:'#60a5fa',fontSize:23,fontWeight:'900'},modeTitle:{color:'#f8fafc',fontSize:13,fontWeight:'900',marginTop:6},
 notice:{backgroundColor:'#152238',borderRadius:11,borderWidth:1,borderColor:'#304767',padding:12,marginTop:12,marginBottom:12},noticeTitle:{color:'#fbbf24',fontSize:11,fontWeight:'900'},noticeText:{color:'#c4d2e4',fontSize:10,lineHeight:16,marginTop:4},
 primary:{backgroundColor:'#60a5fa',padding:15,borderRadius:12,alignItems:'center',justifyContent:'center',minHeight:48},primaryText:{color:'#06111f',fontSize:11,fontWeight:'900'},disabled:{opacity:.4},stop:{borderColor:'#fb7185',borderWidth:1,padding:13,borderRadius:12,alignItems:'center',marginTop:8},stopText:{color:'#fb7185',fontSize:10,fontWeight:'900'},
 timerCard:{backgroundColor:'#0e1b2d',borderColor:'#233a56',borderWidth:1,borderRadius:14,padding:15,alignItems:'center',marginTop:12},timerLabel:{color:'#7db3ff',fontSize:9,fontWeight:'900',letterSpacing:1},timer:{color:'#a3b4ca',fontSize:31,fontWeight:'900',fontVariant:['tabular-nums'],marginTop:4},progress:{color:'#93c5fd',fontSize:10,marginTop:8},
 message:{color:'#a3b4ca',fontSize:10,lineHeight:15,marginTop:10},error:{color:'#fb7185',backgroundColor:'#28151c',borderRadius:9,padding:10,fontSize:10,marginTop:8},
 summary:{flexDirection:'row',gap:7,marginTop:13},summaryCell:{flex:1,backgroundColor:'#0e1b2d',borderRadius:10,padding:10,alignItems:'center'},count:{color:'#f8fafc',fontSize:17,fontWeight:'900'},card:{backgroundColor:'#0e1b2d',borderColor:'#233a56',borderWidth:1,borderRadius:12,padding:12,marginBottom:8},resultHead:{flexDirection:'row',alignItems:'flex-start',gap:8},sensor:{color:'#e5edf7',fontSize:12,fontWeight:'900'},pid:{color:'#7185a1',fontSize:9,marginTop:3},value:{color:'#f8fafc',fontSize:14,fontWeight:'900',textAlign:'right'},state:{fontSize:9,fontWeight:'900',marginTop:3,textAlign:'right'},resultTitle:{color:'#dbeafe',fontSize:10,fontWeight:'900',marginTop:9},explanation:{color:'#9fb0c6',fontSize:10,lineHeight:15,marginTop:4},readings:{color:'#93c5fd',fontSize:9,lineHeight:14,marginTop:8},raw:{color:'#647b98',fontSize:9,marginTop:8},
 save:{backgroundColor:'#173c2b',borderColor:'#28613e',borderWidth:1,padding:14,borderRadius:11,alignItems:'center',marginTop:4},saveText:{color:'#4ade80',fontSize:10,fontWeight:'900'},saved:{color:'#93c5fd',fontSize:9,marginTop:7},disclaimer:{backgroundColor:'#101b2a',borderRadius:11,padding:12,marginTop:14},back:{padding:14,alignItems:'center'},backText:{color:'#7db3ff',fontSize:10,fontWeight:'900'}
});
