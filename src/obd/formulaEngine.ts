import formulasCatalog from '../knowledge/formulas.json';
import rangesCatalog from '../knowledge/ranges.json';

type FormulaSpec = {
  operation: string;
  offset?: number;
  scale?: number;
  divisor?: number;
};

type FormulaCatalog = {
  formulas: Record<string, FormulaSpec>;
};

type RangeCatalog = {
  ranges: Record<string, { min: number; max: number }>;
};

const formulas = (formulasCatalog as FormulaCatalog).formulas;
const ranges = (rangesCatalog as RangeCatalog).ranges;

export interface FormulaResult {
  value: number;
  valid: boolean;
  reason?: string;
}

function requireBytes(data: number[], count: number): void {
  if (data.length < count) {
    throw new Error(`Fórmula exige ${count} byte(s), recebido ${data.length}`);
  }
}

export function applyFormula(formulaId: string, data: number[]): number {
  const spec = formulas[formulaId];
  if (!spec) throw new Error(`Fórmula desconhecida: ${formulaId}`);

  switch (spec.operation) {
    case 'u8':
      requireBytes(data, 1);
      return data[0];
    case 'u16':
      requireBytes(data, 2);
      return data[0] * 256 + data[1];
    case 'u32':
      requireBytes(data, 4);
      return data[0] * 16777216 + data[1] * 65536 + data[2] * 256 + data[3];
    case 'u16_div':
      requireBytes(data, 2);
      return (data[0] * 256 + data[1]) / (spec.divisor ?? 1);
    case 'u8_offset':
      requireBytes(data, 1);
      return data[0] + (spec.offset ?? 0);
    case 'u8_scale':
      requireBytes(data, 1);
      return (data[0] * (spec.scale ?? 1)) / (spec.divisor ?? 1);
    case 'u8_offset_scale':
      requireBytes(data, 1);
      return ((data[0] + (spec.offset ?? 0)) * (spec.scale ?? 1)) / (spec.divisor ?? 1);
    case 'u8_scale_offset':
      requireBytes(data, 1);
      return data[0] * (spec.scale ?? 1) + (spec.offset ?? 0);
    case 'u8_div':
      requireBytes(data, 1);
      return data[0] / (spec.divisor ?? 1);
    case 'u8_scale_div':
      requireBytes(data, 1);
      return (data[0] * (spec.scale ?? 1)) / (spec.divisor ?? 1);
    case 'u16_scale':
      requireBytes(data, 2);
      return (data[0] * 256 + data[1]) * (spec.scale ?? 1);
    case 'u16_scale_div':
      requireBytes(data, 2);
      return ((data[0] * 256 + data[1]) * (spec.scale ?? 1)) / (spec.divisor ?? 1);
    case 'u16_offset_scale':
      requireBytes(data, 2);
      return ((data[0] * 256 + data[1]) + (spec.offset ?? 0)) * (spec.scale ?? 1);
    default:
      throw new Error(`Operação de fórmula desconhecida: ${spec.operation}`);
  }
}

export function validatePidValue(pid: string, value: number): FormulaResult {
  if (!Number.isFinite(value)) {
    return { value, valid: false, reason: 'valor não finito' };
  }

  const range = ranges[pid.toUpperCase()];
  if (!range) return { value, valid: true };

  if (value < range.min || value > range.max) {
    return {
      value,
      valid: false,
      reason: `fora da faixa de plausibilidade [${range.min}, ${range.max}]`,
    };
  }

  return { value, valid: true };
}

export function decodeFormula(formulaId: string, pid: string, data: number[]): FormulaResult {
  const value = applyFormula(formulaId, data);
  return validatePidValue(pid, value);
}
