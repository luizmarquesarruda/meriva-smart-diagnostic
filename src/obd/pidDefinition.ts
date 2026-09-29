export type PidByteLength = 1 | 2 | 4;
export type PidClassification = 'PADRAO_OBD' | 'MERIVA_CONFIRMADO' | 'MERIVA_NAO_CONFIRMADO' | 'DESCONHECIDO';
export interface PidDefinition { pid: string; name: string; bytes: PidByteLength; unit: string; formula: (data: number[]) => number; classification: PidClassification; description: string; }

export const PID_DATABASE: Record<string, PidDefinition> = {
  '0105': { pid: '0105', name: 'Coolant Temperature', bytes: 1, unit: '°C', formula: ([a]) => a - 40, classification: 'PADRAO_OBD', description: 'Temperatura do líquido de arrefecimento' },
  '0106': { pid: '0106', name: 'STFT Bank 1', bytes: 1, unit: '%', formula: ([a]) => ((a - 128) * 100) / 128, classification: 'PADRAO_OBD', description: 'Ajuste de combustível de curto prazo Bank 1' },
  '010B': { pid: '010B', name: 'MAP', bytes: 1, unit: 'kPa', formula: ([a]) => a, classification: 'PADRAO_OBD', description: 'Pressão absoluta do coletor' },
  '010C': { pid: '010C', name: 'Engine RPM', bytes: 2, unit: 'RPM', formula: ([a, b]) => ((a * 256) + b) / 4, classification: 'PADRAO_OBD', description: 'Rotações do motor' },
  '010D': { pid: '010D', name: 'Vehicle Speed', bytes: 1, unit: 'km/h', formula: ([a]) => a, classification: 'PADRAO_OBD', description: 'Velocidade do veículo' },
  '0110': { pid: '0110', name: 'MAF', bytes: 2, unit: 'g/s', formula: ([a, b]) => ((a * 256) + b) / 100, classification: 'PADRAO_OBD', description: 'Fluxo de ar; kg/h = g/s × 3,6' },
  '0142': { pid: '0142', name: 'ECU Voltage', bytes: 2, unit: 'V', formula: ([a, b]) => ((a * 256) + b) / 1000, classification: 'PADRAO_OBD', description: 'Tensão da ECU' },
};

export function getPidDefinition(pid: string): PidDefinition | null { return PID_DATABASE[pid.replace(/\s/g, '').toUpperCase()] ?? null; }
