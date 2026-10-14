export type SensorTestMode = 'ENGINE_OFF' | 'ENGINE_ON';
export type SensorAssessmentState = 'CONSISTENTE' | 'INVESTIGAR' | 'SEM_RESPOSTA' | 'NAO_CONCLUSIVO';
export interface SensorTestSample { pid:string; name:string; value:number|null; unit:string; status:string; rawResponse:string; elapsedMs:number; timestamp:string; }
export interface SensorAssessment { state:SensorAssessmentState; title:string; explanation:string; }
function valueOf(samples:SensorTestSample[], pid:string):number|null {
 const s=samples.find(x=>x.pid.replace(/\s/g,'').toUpperCase()===pid);
 return s?.status==='RESPONDEU' && s.value!=null && Number.isFinite(s.value) ? s.value : null;
}
/** Regras heurísticas de triagem; não comprovam exatidão física/elétrica nem substituem especificação de fábrica. */
export function assessSensorSample(s:SensorTestSample, mode:SensorTestMode, all:SensorTestSample[]):SensorAssessment {
 if(s.status!=='RESPONDEU'||s.value==null||!Number.isFinite(s.value))
  return /NÃO RESPONDEU/i.test(s.status)
   ? {state:'SEM_RESPOSTA',title:'Sem resposta válida',explanation:'Consulta sem valor interpretável. Isso não prova defeito no sensor; confirme suporte do PID, comunicação e resposta da ECU.'}
   : {state:'NAO_CONCLUSIVO',title:'Valor não interpretado',explanation:'Resposta não validada pelo parser. Verifique RX bruto, unidade e definição do PID.'};
 const v=s.value, pid=s.pid.replace(/\s/g,'').toUpperCase();
 if(pid==='010C') return mode==='ENGINE_OFF'
  ? (v<=50?{state:'CONSISTENTE',title:'RPM compatível com motor parado',explanation:'A rotação está próxima de zero nesta amostra; isso é coerente com ignição ligada e motor desligado.'}:{state:'INVESTIGAR',title:'Motor pode estar ligado',explanation:'A RPM é maior que zero de forma relevante. Confirme a condição selecionada.'})
  : (v>=400?{state:'CONSISTENTE',title:'Rotação detectada',explanation:'A ECU informou rotação compatível com motor funcionando; isso não valida os outros sensores.'}:{state:'INVESTIGAR',title:'RPM não confirma motor ligado',explanation:'A rotação está baixa para confirmar motor funcionando. Repita a medição.'});
 if(pid==='010B'){
  const baro=valueOf(all,'0133');
  if(mode==='ENGINE_OFF'){
   if(baro==null)return {state:'NAO_CONCLUSIVO',title:'MAP recebido; falta referência BARO',explanation:'Sem PID barométrico válido, não é possível comparar a pressão do coletor com a atmosférica usando apenas esta varredura.'};
   return Math.abs(v-baro)<=10
    ? {state:'CONSISTENTE',title:'MAP próximo da pressão barométrica',explanation:'MAP e BARO diferem no máximo 10 kPa nesta amostra. Isso não comprova calibração completa.'}
    : {state:'INVESTIGAR',title:'MAP diverge de BARO',explanation:'Diferença maior que 10 kPa com motor parado: repita e confirme se o PID BARO está atualizado e suportado.'};
  }
  const rpm=valueOf(all,'010C'), ect=valueOf(all,'0105');
  if(rpm!=null&&rpm>=500&&rpm<=1100&&ect!=null&&ect>=70)
   return v>=45
    ? {state:'INVESTIGAR',title:'MAP elevado em possível marcha lenta aquecida',explanation:'MAP ≥45 kPa é um gatilho heurístico para investigar carga, vácuo, entrada falsa de ar e sincronismo; não condena o sensor.'}
    : {state:'CONSISTENTE',title:'MAP plausível na condição registrada',explanation:'A leitura ficou abaixo do limiar heurístico em marcha lenta aquecida. Avalie também a resposta ao variar a carga.'};
  return {state:'NAO_CONCLUSIVO',title:'Condição insuficiente para avaliar MAP',explanation:'Registre RPM estável e temperatura do motor aquecido. Uma leitura isolada não confirma o estado físico do sensor.'};
 }
 if(['0105','010F','0146','015C'].includes(pid)) return v>=-40&&v<=215
  ? {state:'NAO_CONCLUSIVO',title:'Temperatura recebida',explanation:'Valor dentro de faixa ampla de plausibilidade. Compare sensores após repouso a frio e acompanhe o aquecimento.'}
  : {state:'INVESTIGAR',title:'Temperatura fora da faixa ampla',explanation:'Confirme unidade, fórmula, resposta bruta e especificação aplicável.'};
 if(['0111','0145','015A'].includes(pid)) return v>=0&&v<=100
  ? {state:'NAO_CONCLUSIVO',title:'Posição recebida',explanation:'Percentual numericamente plausível. Avaliação funcional exige observar a progressão do sinal durante atuação controlada.'}
  : {state:'INVESTIGAR',title:'Percentual fora de 0–100%',explanation:'Confira fórmula, unidade e resposta bruta.'};
 if(pid==='0133') return v>=10&&v<=110
  ? {state:'NAO_CONCLUSIVO',title:'Pressão barométrica recebida',explanation:'Compare com referência atmosférica local; a plausibilidade numérica não comprova calibração.'}
  : {state:'INVESTIGAR',title:'Pressão fora da faixa ampla',explanation:'Confirme unidade, fórmula e resposta da ECU.'};
 return {state:'NAO_CONCLUSIVO',title:'Resposta válida; teste complementar necessário',explanation:'A ECU respondeu e o valor foi interpretado. Este parâmetro exige série temporal, condições específicas ou instrumento externo para avaliar o sensor.'};
}
