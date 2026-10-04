/**
 * Fonte técnica: Meriva_Biblia_Tecnica_Catalogo_GM.md
 * Regra: este módulo contém somente dados sustentados pela fonte.
 * Não é esquema elétrico, pinout de ECU, manual de diagnóstico ou protocolo proprietário.
 */

export const MERIVA_BIBLE_SOURCE = {
  name: 'Bíblia Técnica Meriva - Catálogo GM',
  application: 'Chevrolet Meriva',
  documentedYears: '2010; aplicações podem alcançar 2012',
  sourceType: 'CATALOGO_PECAS_APLICACAO',
  limitation: 'Não substitui esquema elétrico, manual de serviço, pinout de ECU ou documentação de diagnóstico.',
} as const;

export const MERIVA_TECHNICAL_PROFILE = {
  make: 'Chevrolet',
  model: 'Meriva Maxx',
  engine: '1.4 MPFI 8V ECONOFLEX',
  displacementCm3: 1389,
  cylinders: 4,
  fuel: 'Flex Fuel',
  application: 'LKF',
  confirmedApplicationCodes: ['NF7', 'NF2'],
  ecuReferences: ['24578333', '93338267'],
  groundCableReference: '93291478',
  componentReferences: {
    coolantTemperatureSensor: '93313156',
    mapIatSensor: '93313154',
    throttleSensor: '98500113 / 98500112',
    crankSensor: '93393867',
    camSensor: '94705176',
    knockSensor: '93313158',
    oxygenSensor: '93310435',
    ignitionCoil: '93363483 / 94716808',
    vehicleSpeedSensor: '90560092 / 09114603',
    tid: '93351575',
    mid: '93355352',
    externalTemperatureSensor: '09152245',
    externalTemperatureHarness: '93301225',
    instrumentHarness: '93355033 / 93385621',
  },
  diagnosticRules: {
    P0301: ['bobina', 'vela', 'injetor', 'compressao', 'fiação', 'alimentação/terra', 'sincronismo'],
    P0123: ['sensor/borboleta', 'fiação', 'alimentação', 'terra', 'ECU'],
    P0015: ['sensor de fase', 'sincronismo', 'atuador/comando', 'fiação'],
  },
  fuelSmellInspection: [
    'linhas e conexões de combustível',
    'trilhos/injetores',
    'tanque e linhas',
    'canister e mangueiras de vapor',
  ],
  excludedFromAppByUser: ['informações de boia/medidor de nível'],
} as const;

export const MERIVA_BIBLE_LIMITS = [
  'Não inventar PID.',
  'Separar OBD padrão de dados específicos da Meriva.',
  'Guardar resposta bruta da ECU.',
  'Associar PID → função → componente físico → código GM somente quando houver confirmação real.',
  'Não usar o catálogo sozinho para fechar uma causa de falha.',
] as const;
