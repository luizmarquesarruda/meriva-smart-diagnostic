import sensorTestCatalogJson from '../knowledge/sensor_tests.json';
export type SensorTestMode='ENGINE_OFF'|'ENGINE_ON';
export type SensorAssessmentState='CONSISTENTE'|'INVESTIGAR'|'SEM_RESPOSTA'|'NAO_CONCLUSIVO';
export interface SensorTestSample{pid:string;name:string;value:number|null;unit:string;status:string;rawResponse:string;elapsedMs:number;timestamp:string;readingNumber?:number;}
export interface SensorAssessment{state:SensorAssessmentState;title:string;explanation:string;}
export interface SensorTestDefinition{id:string;pid:string;label:string;catalogName:string;unit:string;formulaId:string;category:string;evaluator:string;modes:SensorTestMode[];requiredPids:string[];minimumReadings:number;thresholds:Record<string,number>;evidenceClass:string;vehicleEvidenceStatus:string;diagnosticRuleIds:string[];aiGuidance:string;}
interface SensorTestCatalog{schemaVersion:number;catalogId:string;minimumReadingsPerPid:number;timing:{defaultCommandLatencyMs:number;minimumEstimatedCommandLatencyMs:number;perCommandSafetyMarginMs:number;finalizationMarginMs:number};tests:SensorTestDefinition[];}
const catalog=sensorTestCatalogJson as unknown as SensorTestCatalog;
export const MIN_SENSOR_TEST_READINGS=catalog.minimumReadingsPerPid;
export function getSensorTestCatalog():SensorTestCatalog{return catalog;}
export function normalizeSensorPid(pid:string):string{return pid.replace(/\s/g,'').toUpperCase();}
export function createSensorTestPlan(supportedPids:string[],hasDefinition:(pid:string)=>boolean=()=>true):SensorTestDefinition[]{
 const supported=new Set(supportedPids.map(normalizeSensorPid));
 return catalog.tests.filter(test=>supported.has(normalizeSensorPid(test.pid))&&test.modes.length>0&&hasDefinition(test.pid));
}
function validRows(samples:SensorTestSample[],pid:string):SensorTestSample[]{return samples.filter(item=>normalizeSensorPid(item.pid)===normalizeSensorPid(pid)&&item.status==='RESPONDEU'&&item.value!==null&&Number.isFinite(item.value));}
function average(values:number[]):number|null{return values.length?values.reduce((total,value)=>total+value,0)/values.length:null;}
function valueOf(samples:SensorTestSample[],pid:string):number|null{const rows=validRows(samples,pid);if(rows.length<MIN_SENSOR_TEST_READINGS)return null;return average(rows.map(item=>item.value as number));}
function result(state:SensorAssessmentState,title:string,explanation:string):SensorAssessment{return{state,title,explanation};}
function rangeAssessment(value:number,test:SensorTestDefinition):SensorAssessment{
 const min=test.thresholds.min,max=test.thresholds.max;
 if((Number.isFinite(min)&&value<min)||(Number.isFinite(max)&&value>max))return result('INVESTIGAR','Valor fora da faixa de plausibilidade','A média ficou fora da faixa ampla cadastrada. Confirme fórmula, unidade, RX bruto e especificação aplicável; isso não condena o sensor.');
 return result('NAO_CONCLUSIVO','Resposta plausível; diagnóstico não encerrado',test.aiGuidance+' A faixa cadastrada é heurística, não limite OEM de aprovação.');
}
/** Motor determinístico de triagem local, configurado pelo JSON. Nenhum estado certifica integridade física/elétrica. */
export function assessSensorSample(sample:SensorTestSample,mode:SensorTestMode,all:SensorTestSample[]):SensorAssessment{
 const pid=normalizeSensorPid(sample.pid),test=catalog.tests.find(item=>normalizeSensorPid(item.pid)===pid);
 if(!test)return result('NAO_CONCLUSIVO','PID fora do catálogo','Nenhuma regra inferida porque o PID não está cadastrado em sensor_tests.json.');
 const attempts=all.filter(item=>normalizeSensorPid(item.pid)===pid),valid=validRows(all,pid);
 if(attempts.length<test.minimumReadings)return result('NAO_CONCLUSIVO','Aguardando '+test.minimumReadings+' leituras','Leituras válidas/total: '+valid.length+'/'+attempts.length+'. O resultado requer '+test.minimumReadings+' tentativas.');
 if(valid.length===0)return result('SEM_RESPOSTA','Sem resposta interpretável nas '+test.minimumReadings+' tentativas','O PID não forneceu valor interpretável. Pode ser suporte, comunicação ou parser; não prova falha física.');
 if(valid.length<test.minimumReadings)return result('NAO_CONCLUSIVO','Menos de '+test.minimumReadings+' leituras válidas','Foram obtidas '+valid.length+' leituras válidas em '+attempts.length+' tentativas; não há amostragem suficiente.');
 const value=average(valid.map(item=>item.value as number));if(value===null||!Number.isFinite(value))return result('NAO_CONCLUSIVO','Sem média válida','As amostras não geraram valor numérico confiável.');
 const t=test.thresholds,read=(otherPid:string)=>valueOf(all,otherPid);
 if(test.evaluator==='RPM_BY_MODE'){
  if(mode==='ENGINE_OFF')return value<=t.engineOffMaxRpm?result('CONSISTENTE','RPM compatível com motor parado','A média está próxima de zero; isso confirma a condição selecionada, não o estado elétrico completo do sensor CKP.'):result('INVESTIGAR','RPM incompatível com motor parado','RPM acima do limite heurístico. Confirme a condição e o RX bruto.');
  return value>=t.engineOnMinRpm?result('CONSISTENTE','Rotação detectada','A ECU reportou rotação compatível com motor funcionando; os demais sensores ainda exigem avaliação.'):result('INVESTIGAR','RPM não confirma motor ligado','A RPM está abaixo do gatilho configurado. Confirme partida, condição do motor e comunicação.');
 }
 if(test.evaluator==='STATIONARY_SPEED')return value<=t.maxStationarySpeedKmh?result('CONSISTENTE','Velocidade compatível com veículo parado','A velocidade reportada ficou próxima de zero nas cinco leituras; não testa precisão do sensor em movimento.'):result('INVESTIGAR','Velocidade diferente de zero com veículo parado','Interrompa o teste se o carro não estiver parado. Se estiver, confira sinal, unidade e o PID com ferramenta independente.');
 if(test.evaluator==='MAP_BY_MODE'){
  if(mode==='ENGINE_OFF'){const baro=read('0133');if(baro===null)return result('NAO_CONCLUSIVO','MAP recebido; BARO sem cinco leituras válidas','O catálogo requer média BARO (0133) para comparar com motor parado. Falta de BARO não condena MAP.');
   return Math.abs(value-baro)<=t.engineOffMaxDifferenceKpa?result('CONSISTENTE','MAP próximo da pressão barométrica','Diferença entre as médias MAP/BARO dentro do gatilho heurístico; não comprova calibração nem exclui defeito sob funcionamento.'):result('INVESTIGAR','MAP diverge da pressão barométrica','A diferença entre as médias supera o gatilho heurístico. Confirme altitude, unidade, BARO e condição antes de investigar MAP, chicote ou entrada de ar.');}
  const rpm=read('010C'),ect=read('0105');if(rpm===null||ect===null||rpm<t.idleMinRpm||rpm>t.idleMaxRpm||ect<t.warmCoolantMinC)return result('NAO_CONCLUSIVO','Condição insuficiente para MAP em marcha lenta','A comparação exige cinco leituras válidas de RPM e temperatura, RPM estável e motor aquecido. '+test.aiGuidance);
  return value>=t.investigateFromKpa?result('INVESTIGAR','MAP elevado em possível marcha lenta aquecida','A média alcançou o gatilho heurístico. Verifique vácuo, entrada falsa de ar, sincronismo e condição operacional antes de suspeitar do sensor.'):result('CONSISTENTE','MAP abaixo do gatilho de investigação','A leitura não alcançou o gatilho nesta condição; isso não exclui vazamento de ar nem falha intermitente.');
 }
 if(test.evaluator==='TEMPERATURE_PLAUSIBILITY'||test.evaluator==='BARO_PLAUSIBILITY')return rangeAssessment(value,test);
 if(test.evaluator==='FUEL_TRIM_CONTEXT'){
  if(mode!=='ENGINE_ON')return result('NAO_CONCLUSIVO','Correção requer motor funcionando',test.aiGuidance);
  const rpm=read('010C'),ect=read('0105');if(rpm===null||ect===null||rpm<t.idleMinRpm||rpm>t.idleMaxRpm||ect<t.warmCoolantMinC)return result('NAO_CONCLUSIVO','Condição de mistura insuficiente','Requer motor aquecido, RPM estável e cinco leituras válidas; malha fechada não foi confirmada neste subconjunto. '+test.aiGuidance);
  if(Math.abs(value)>=t.investigateAbsPercent)return result('INVESTIGAR','Correção de combustível com magnitude elevada','A média ultrapassou o gatilho heurístico de '+t.investigateAbsPercent+'%. Cruze STFT/LTFT, sonda, MAP/MAF e DTCs reais; não troque peça pelo PID isolado.');
  return result('NAO_CONCLUSIVO','Correção dentro do gatilho amplo','Não ultrapassar o gatilho não comprova mistura correta nem exclui defeito. '+test.aiGuidance);
 }
 if(test.evaluator==='O2_NARROWBAND_LIMITATION'){
  const range=rangeAssessment(value,test);if(range.state==='INVESTIGAR')return range;
  if(mode!=='ENGINE_ON')return result('NAO_CONCLUSIVO','Sonda O2 exige motor funcionando','Motor parado não valida aquecedor, resposta nem alternância. '+test.aiGuidance);
  const ect=read('0105');if(ect===null||ect<t.warmCoolantMinC)return result('NAO_CONCLUSIVO','Motor não confirmado como aquecido','Requer cinco leituras válidas de temperatura e motor aquecido. '+test.aiGuidance);
  return result('NAO_CONCLUSIVO','Tensão plausível; alternância não validada','cinco leituras não medem frequência de comutação nem testam o circuito aquecedor. '+test.aiGuidance);
 }
 if(test.evaluator==='ECU_VOLTAGE_BY_MODE'){
  const min=mode==='ENGINE_OFF'?t.engineOffMinV:t.engineOnMinV;if(value<min||value>t.maxV)return result('INVESTIGAR','Tensão fora do gatilho heurístico','média '+value.toFixed(2)+' V fora da faixa de triagem. Confirme com multímetro nos polos da bateria antes de concluir.');
  return result('NAO_CONCLUSIVO','Tensão em faixa heurística','A leitura OBD não substitui medição externa nem confirma bateria/alternador. '+test.aiGuidance);
 }
 if(test.evaluator==='FLEX_COMPOSITION'){
  const range=rangeAssessment(value,test);return range.state==='INVESTIGAR'?range:result('NAO_CONCLUSIVO','Percentual de álcool reportado pela ECU','Valor do PID não equivale a análise independente do combustível no tanque. '+test.aiGuidance);
 }
 if(test.evaluator==='FUEL_RATE_BY_MODE'){
  const range=rangeAssessment(value,test);if(range.state==='INVESTIGAR')return range;
  if(mode==='ENGINE_OFF'&&value>0)return result('INVESTIGAR','Taxa reportada com motor parado','ECU reportou taxa acima de zero com motor selecionado como desligado. Confirme RPM, condição e RX; não assuma consumo real parado.');
  return result('NAO_CONCLUSIVO','Taxa reportada; exatidão não confirmada','É um parâmetro reportado/calculado pela ECU. Confirme suporte e repetibilidade antes de integrar ao consumo.');
 }
 if(test.evaluator==='PERCENT_PLAUSIBILITY'){
  if(value<t.min||value>t.max)return rangeAssessment(value,test);
  return result('NAO_CONCLUSIVO','Percentual plausível; teste funcional necessário',test.aiGuidance+' Nenhum comando ativo do atuador ou teste elétrico foi executado.');
 }
 return rangeAssessment(value,test);
}
export function getSensorRecommendationsForRule(ruleId:string,limit=3):string[]{
 return catalog.tests.filter(test=>test.diagnosticRuleIds.includes(ruleId)).slice(0,Math.max(0,limit)).map(test=>test.label+' (PID '+test.pid+'): '+test.aiGuidance);
}
