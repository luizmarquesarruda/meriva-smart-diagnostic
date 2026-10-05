export type PidByteLength = 1 | 2 | 4;
export type PidClassification = 'PADRAO_OBD' | 'MERIVA_CONFIRMADO' | 'MERIVA_NAO_CONFIRMADO' | 'DESCONHECIDO';

export interface PidDefinition {
  pid: string;
  name: string;
  bytes: PidByteLength;
  unit: string;
  formula: (data: number[]) => number;
  classification: PidClassification;
  description: string;
}

export const PID_DATABASE: Record<string, PidDefinition> = {
  '0104': { pid: '0104', name: 'Calculated Engine Load', bytes: 1, unit: '%', formula: ([a]) => (a * 100) / 255, classification: 'PADRAO_OBD', description: 'Carga calculada do motor' },
  '0105': { pid: '0105', name: 'Coolant Temperature', bytes: 1, unit: '°C', formula: ([a]) => a - 40, classification: 'PADRAO_OBD', description: 'Temperatura do líquido de arrefecimento' },
  '0106': { pid: '0106', name: 'STFT Bank 1', bytes: 1, unit: '%', formula: ([a]) => ((a - 128) * 100) / 128, classification: 'PADRAO_OBD', description: 'Ajuste de combustível de curto prazo Bank 1' },
  '0107': { pid: '0107', name: 'LTFT Bank 1', bytes: 1, unit: '%', formula: ([a]) => ((a - 128) * 100) / 128, classification: 'PADRAO_OBD', description: 'Ajuste de combustível de longo prazo Bank 1' },
  '010B': { pid: '010B', name: 'MAP', bytes: 1, unit: 'kPa', formula: ([a]) => a, classification: 'PADRAO_OBD', description: 'Pressão absoluta do coletor' },
  '010C': { pid: '010C', name: 'Engine RPM', bytes: 2, unit: 'RPM', formula: ([a, b]) => ((a * 256) + b) / 4, classification: 'PADRAO_OBD', description: 'Rotações do motor' },
  '010D': { pid: '010D', name: 'Vehicle Speed', bytes: 1, unit: 'km/h', formula: ([a]) => a, classification: 'PADRAO_OBD', description: 'Velocidade do veículo' },
  '010E': { pid: '010E', name: 'Timing Advance', bytes: 1, unit: '°', formula: ([a]) => (a / 2) - 64, classification: 'PADRAO_OBD', description: 'Avanço de ignição relativo ao PMS' },
  '010F': { pid: '010F', name: 'Intake Air Temperature', bytes: 1, unit: '°C', formula: ([a]) => a - 40, classification: 'PADRAO_OBD', description: 'Temperatura do ar de admissão' },
  '0110': { pid: '0110', name: 'MAF', bytes: 2, unit: 'g/s', formula: ([a, b]) => ((a * 256) + b) / 100, classification: 'PADRAO_OBD', description: 'Fluxo de ar; kg/h = g/s × 3,6' },
  '0111': { pid: '0111', name: 'Throttle Position', bytes: 1, unit: '%', formula: ([a]) => (a * 100) / 255, classification: 'PADRAO_OBD', description: 'Posição relativa da borboleta' },
  '0114': { pid: '0114', name: 'O2 Sensor 1 Voltage', bytes: 2, unit: 'V', formula: ([a]) => a / 200, classification: 'PADRAO_OBD', description: 'Tensão do Bank 1 Sensor 1. O segundo byte (STFT) permanece preservado em rawBytes; a camada atual interpreta o primeiro valor.' },
  '0131': { pid: '0131', name: 'Distance Since DTC Clear', bytes: 2, unit: 'km', formula: ([a, b]) => (a * 256) + b, classification: 'PADRAO_OBD', description: 'Distância desde limpeza dos DTCs' },
  '0142': { pid: '0142', name: 'ECU Voltage', bytes: 2, unit: 'V', formula: ([a, b]) => ((a * 256) + b) / 1000, classification: 'PADRAO_OBD', description: 'Tensão informada pela ECU' },
  '0151': { pid: '0151', name: 'Fuel Type', bytes: 1, unit: 'código', formula: ([a]) => a, classification: 'PADRAO_OBD', description: 'Tipo de combustível declarado pela ECU. Não representa necessariamente a composição atual do tanque.' },
  '0152': { pid: '0152', name: 'Alcohol Fuel Percentage', bytes: 1, unit: '%', formula: ([a]) => (a * 100) / 255, classification: 'PADRAO_OBD', description: 'Percentual de álcool informado pela ECU quando este PID é suportado. Deve ser tratado como evidência direta, não como estimativa própria do aplicativo.' },
  '012F': { pid: '012F', name: 'Fuel Level Input', bytes: 1, unit: '%', formula: ([a]) => (a * 100) / 255, classification: 'PADRAO_OBD', description: 'Nível de combustível informado pela ECU. Pode vir diretamente do sensor ou ser inferido pela estratégia da ECU; usar somente quando a ECU responder.' },
  '015E': { pid: '015E', name: 'Engine Fuel Rate', bytes: 2, unit: 'L/h', formula: ([a, b]) => ((a * 256) + b) / 20, classification: 'PADRAO_OBD', description: 'Taxa de combustível calculada pela ECU; permite integrar litros usados quando suportada' },
};

export function getPidDefinition(pid: string): PidDefinition | null {
  return PID_DATABASE[pid.replace(/\s/g, '').toUpperCase()] ?? null;
}
