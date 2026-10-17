import type { DiagnosticHypothesis } from './diagnosticEngine';

export interface DiagnosticResponse {
  title: string;
  summary: string;
  confidenceLabel: string;
  nextAction: string;
  caution: string;
}

const TITLES: Record<string, string> = {
  FALHA_CIRCUITO_AQUECEDOR_O2_B1S1: 'Verificar circuito do aquecedor do sensor O2',
  EFICIENCIA_CATALISADOR_BAIXA: 'Investigar eficiência do catalisador',
  FALHA_DE_COMBUSTAO_CILINDRO_1: 'Investigar falha de combustão no cilindro 1',
  SINAL_DE_POSICAO_DA_BORBOLETA_ALTO: 'Verificar sinal de posição da borboleta',
  RESPOSTA_LENTA_O2_B1S1: 'Investigar resposta do sensor O2',
  MISTURA_POBRE: 'Investigar possível mistura pobre',
  MISTURA_RICA: 'Investigar possível mistura rica',
  VACUO_DO_MOTOR_POSSIVELMENTE_ANORMAL: 'Verificar pressão do coletor em marcha lenta',
};

const SUMMARIES: Record<string, string> = {
  FALHA_CIRCUITO_AQUECEDOR_O2_B1S1: 'O código pode indicar um problema no circuito do aquecedor. Ele não prova, sozinho, que o sensor precise ser substituído.',
  EFICIENCIA_CATALISADOR_BAIXA: 'A evidência é compatível com eficiência do catalisador abaixo do esperado. Antes de condenar o catalisador, investigue mistura, falhas de combustão e sinais dos sensores O2 quando disponíveis.',
  FALHA_DE_COMBUSTAO_CILINDRO_1: 'Há evidência compatível com falha de combustão no cilindro indicado. A causa pode estar em ignição, combustível, entrada de ar ou condição mecânica; é necessário testar.',
  SINAL_DE_POSICAO_DA_BORBOLETA_ALTO: 'O sinal informado pela ECU pode estar acima do esperado. Compare a leitura com a condição de operação e verifique alimentação, aterramento, conector e chicote.',
  RESPOSTA_LENTA_O2_B1S1: 'A ECU pode ter detectado resposta lenta do sensor O2. Temperatura, mistura, vazamentos e condições de malha fechada precisam ser consideradas.',
  MISTURA_POBRE: 'Os ajustes de combustível observados são compatíveis com tendência de mistura pobre no contexto informado. Confirme com leituras repetidas e verifique possíveis causas antes de trocar peças.',
  MISTURA_RICA: 'Os ajustes de combustível observados são compatíveis com tendência de mistura rica no contexto informado. Confirme com leituras repetidas e verifique possíveis causas antes de trocar peças.',
  VACUO_DO_MOTOR_POSSIVELMENTE_ANORMAL: 'A pressão do coletor observada pode ser alta para a condição declarada. Repita a leitura com motor aquecido e correlacione com RPM, carga e condições mecânicas.',
};

const CONFIDENCE_LABELS: Record<DiagnosticHypothesis['confidence'], string> = {
  LOW: 'baixa',
  MEDIUM: 'moderada',
  HIGH: 'alta',
};

export function composeDiagnosticResponse(hypothesis: DiagnosticHypothesis): DiagnosticResponse {
  const firstEvidence = hypothesis.evidence[0]?.text;
  const firstAction = hypothesis.nextTests[0];
  return {
    title: TITLES[hypothesis.id] ?? hypothesis.label,
    summary: SUMMARIES[hypothesis.id] ?? 'O motor de regras encontrou uma hipótese compatível com parte das evidências locais disponíveis.',
    confidenceLabel: CONFIDENCE_LABELS[hypothesis.confidence],
    nextAction: firstAction ?? 'Recolher mais leituras válidas da ECU antes de concluir.',
    caution: firstEvidence
      ? 'Base desta hipótese: ' + firstEvidence + ' A pontuação é heurística, não uma probabilidade calibrada; a hipótese não confirma uma peça defeituosa.'
      : 'A hipótese não contém evidência rastreável; recolha dados válidos antes de agir.',
  };
}
