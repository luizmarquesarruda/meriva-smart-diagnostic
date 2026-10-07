import { decodeFormula } from './formulaEngine';
import pidCatalog from '../knowledge/pids.json';

export type PidByteLength = 1 | 2 | 4;
export type PidClassification = 'PADRAO_OBD' | 'MERIVA_CONFIRMADO' | 'MERIVA_NAO_CONFIRMADO' | 'DESCONHECIDO';

export interface PidDefinition {
  pid: string;
  name: string;
  bytes: PidByteLength;
  unit: string;
  formulaId: string;
  formula: (data: number[]) => number;
  classification: PidClassification;
  description: string;
}

type JsonPid = {
  pid: string;
  name: string;
  bytes: PidByteLength;
  unit: string;
  formulaId: string;
  classification: PidClassification;
  description: string;
};

const definitions = new Map<string, JsonPid>(
  (pidCatalog.pids as JsonPid[]).map((item) => [item.pid.toUpperCase(), item]),
);

export const PID_DATABASE: Record<string, PidDefinition> = Object.fromEntries(
  Array.from(definitions.values()).map((item) => [
    item.pid,
    {
      ...item,
      formula: (data: number[]) => {
        const result = decodeFormula(item.formulaId, item.pid, data);
        return result.value;
      },
    },
  ]),
);

export function getPidDefinition(pid: string): PidDefinition | null {
  return PID_DATABASE[pid.replace(/\s/g, '').toUpperCase()] ?? null;
}
