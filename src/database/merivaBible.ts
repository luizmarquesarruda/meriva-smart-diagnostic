/**
 * Fonte técnica: Meriva_Biblia_Tecnica_Catalogo_GM.md
 *
 * Esta é uma camada CURADA da fonte. A Bíblia completa continua como
 * documentação, mas somente dados que têm função no aplicativo entram
 * no runtime.
 *
 * Regra: catálogo de peças não é esquema elétrico, pinout, manual de
 * diagnóstico, PID proprietário ou prova de compatibilidade individual.
 */

export const MERIVA_BIBLE_SOURCE = {
  name: 'Bíblia Técnica Meriva - Catálogo GM',
  application: 'Chevrolet Meriva',
  documentedYears: '2010; aplicações podem alcançar 2012',
  sourceType: 'CATALOGO_PECAS_APLICACAO',
  limitation: 'Não substitui esquema elétrico, manual de serviço, pinout de ECU ou documentação de diagnóstico.',
} as const;

/**
 * Somente identificação técnica útil ao perfil do veículo.
 * Referências de ECU são referências de catálogo, não confirmação da ECU instalada.
 */
export const MERIVA_TECHNICAL_PROFILE = {
  make: 'Chevrolet',
  model: 'Meriva Maxx',
  engine: '1.4 MPFI 8V ECONOFLEX',
  displacementCm3: 1389,
  cylinders: 4,
  fuel: 'Flex Fuel',
  application: 'LKF',
  ecuReferences: ['24578333', '93338267'],
} as const;

/**
 * Conteúdo que o app pode usar quando um DTC real for encontrado.
 * São árvores de investigação, não diagnóstico definitivo.
 */
export const MERIVA_DTC_GUIDANCE = {
  P0301: ['bobina', 'vela', 'injetor', 'compressao', 'fiação', 'alimentação/terra', 'sincronismo'],
  P0123: ['sensor/borboleta', 'fiação', 'alimentação', 'terra', 'ECU'],
  P0015: ['sensor de fase', 'sincronismo', 'atuador/comando', 'fiação'],
} as const;

export const MERIVA_FUEL_ODOR_CHECKLIST = [
  'linhas e conexões de combustível',
  'trilhos/injetores',
  'tanque e linhas',
  'canister e mangueiras de vapor',
] as const;

export function getMerivaDiagnosticGuidance(code: string): readonly string[] {
  const normalized = code.trim().toUpperCase();
  return MERIVA_DTC_GUIDANCE[normalized as keyof typeof MERIVA_DTC_GUIDANCE] ?? [];
}

export const MERIVA_BIBLE_LIMITS = [
  'Não inventar PID.',
  'Separar OBD padrão de dados específicos da Meriva.',
  'Guardar resposta bruta da ECU.',
  'Associar PID → função → componente físico → código GM somente quando houver confirmação real.',
  'Não usar o catálogo sozinho para fechar uma causa de falha.',
  'Informações de boia/medidor de nível permanecem fora do aplicativo.',
] as const;
