/**
 * Dados técnicos confirmados no Manual do Proprietário Chevrolet Meriva MY12.
 *
 * Fonte: Manual do Proprietário Chevrolet Meriva 2012, Seção 12 e Seção 13.
 * Este arquivo é uma referência de configuração do veículo, não substitui
 * a leitura real da ECU nem deve criar PIDs proprietários.
 */

export const MERIVA_MANUAL = {
  source: 'Manual do Proprietário Chevrolet Meriva 2012',
  sourceEdition: 'Brasil / MY12',
  model: 'Chevrolet Meriva Maxx',
  modelYear: 2012,
  modelYearReference: '2011/2012',
  engine: {
    designation: '1.4L 8V ECONO.FLEX',
    displacementCm3: 1389,
    cylinders: 4,
    layout: '4 em linha',
    fuel: 'Gasolina / Álcool',
    idleRpmMin: 700,
    idleRpmMax: 800,
    compressionRatio: 12.4,
    powerCvEthanol: 105,
    powerCvGasoline: 99,
    powerRpmEthanol: 6000,
    powerRpmGasoline: 6000,
    torqueNmEthanol: 131,
    torqueNmGasoline: 129,
    torqueRpm: 2800,
    fuelCutRpm: 6300,
  },
  electrical: {
    batteryVoltage: 12,
    batteryAh: 55,
    alternatorA: 60,
    alternatorWithAcA: 90,
    sparkPlug: 'BPR7E',
    sparkGapMinMm: 0.7,
    sparkGapMaxMm: 0.9,
  },
  transmission: {
    type: 'Manual',
    gears: 5,
    differentialRatio: 4.87,
  },
  capacities: {
    fuelTankL: 56,
    fuelReserveApproxL: 5,
    engineOilWithoutFilterL: 3.25,
    engineOilWithFilterL: 3.5,
    coolingSystemL: 6,
    powerSteeringL: 0.95,
    windshieldWasherL: 2.1,
    brakeFluidL: 0.5,
    coldStartGasolineL: 0.58,
  },
  fluids: {
    engineOil: 'API-SL ou superior / SAE 5W30',
    transmissionOil: 'Mineral SAE 75W85',
    brakeFluid: 'DOT 4',
    powerSteeringFluid: 'Dexron II',
    coolant: 'Aditivo longa duração ACDelco 35% a 50% + água potável',
    acRefrigerant: 'R134a',
  },
  maintenance: {
    normalInspectionKm: 10000,
    normalInspectionMonths: 12,
    severeOilChangeKm: 5000,
    severeOilChangeMonths: 6,
    normalOilChangeKm: 10000,
    normalOilChangeMonths: 12,
    coolantChangeKm: 150000,
    coolantChangeYears: 5,
    brakeFluidChangeYears: 2,
    tireRotationMaxKm: 10000,
  },
  tires: {
    maxx: {
      size: '185/60 R15 88H',
      frontNormalPsi: 34,
      rearNormalPsi: 30,
      frontLoadedPsi: 36,
      rearLoadedPsi: 42,
    },
    reserve: '175/70 R14 84T ou 185/60 R15 88H',
  },
  dimensionsMm: {
    wheelbase: 2630,
    length: 4042,
    width: 1694,
    groundClearance: 138,
  },
} as const;

export const MERIVA_MANUAL_SOURCE_URL =
  'https://meu.chevrolet.com.br/content/dam/gmownercenter/gmsa/gmbr/dynamic/manuals/2012/chevrolet/Meriva/pt/om_ng-chevrolet_Meriva_my12-pt_BR.pdf';
