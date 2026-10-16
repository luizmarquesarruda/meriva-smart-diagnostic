export type DriveabilityTone = 'muted' | 'elevated' | 'balanced' | 'efficient';
export type DriveabilityCode = 'ECU_DISCONNECTED' | 'WAITING_MOVEMENT' | 'NO_DATA' | 'ELEVATED' | 'BALANCED' | 'EFFICIENT';
export interface DriveabilityAssessment { code: DriveabilityCode; label: string; detail: string; tone: DriveabilityTone; }
export interface DriveabilityInput {
  ecuConnected: boolean;
  speedKmh: number | null | undefined;
  consumptionKml: number | null | undefined;
  fuelType: 'FLEX' | 'ETANOL' | 'GASOLINA';
}
/** Faixas provisórias, não OEM; este indicador não é diagnóstico de falha. */
export function assessDriveability(input: DriveabilityInput): DriveabilityAssessment {
  if (!input.ecuConnected) return { code:'ECU_DISCONNECTED', label:'AGUARDANDO ECU', detail:'A avaliação usa dados atuais e exige ECU validada.', tone:'muted' };
  if (input.speedKmh == null || !Number.isFinite(input.speedKmh) || input.speedKmh < 10) return { code:'WAITING_MOVEMENT', label:'AGUARDANDO MOVIMENTO', detail:'A classificação só aparece com velocidade atual de pelo menos 10 km/h.', tone:'muted' };
  const c=input.consumptionKml;
  if (c == null || !Number.isFinite(c) || c <= 0) return { code:'NO_DATA', label:'COLETANDO DADOS', detail:'Consumo instantâneo válido indisponível; nenhum número será inventado para preencher a tela.', tone:'muted' };
  const elevatedBelow=input.fuelType==='GASOLINA'?6.5:4.5;
  const efficientFrom=input.fuelType==='ETANOL'?7:10;
  if(c<elevatedBelow) return {code:'ELEVATED',label:'CONSUMO ELEVADO',detail:'Esta amostra está abaixo da faixa orientativa. Compare trajetos semelhantes antes de concluir.',tone:'elevated'};
  if(c>=efficientFrom) return {code:'EFFICIENT',label:'CONSUMO EFICIENTE',detail:'Esta amostra está na faixa orientativa de boa eficiência. Observe a tendência em trajetos comparáveis.',tone:'efficient'};
  return {code:'BALANCED',label:input.fuelType==='FLEX'?'FAIXA INTERMEDIÁRIA':'CONSUMO INTERMEDIÁRIO',detail:input.fuelType==='FLEX'?'Com combustível FLEX sem composição confirmada, esta faixa não permite classificação segura.':'A amostra está entre faixas orientativas; trânsito, carga, aclives e motor frio podem alterar o resultado.',tone:'balanced'};
}
