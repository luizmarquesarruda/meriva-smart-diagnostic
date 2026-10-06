import * as fuelTypeCatalog from '../knowledge/fuel_types.json';

export type FuelIdentificationStatus =
  | 'SEM_DADOS'
  | 'TIPO_VEICULO'
  | 'COMPOSICAO_ECU'
  | 'DADO_INCOERENTE';

type FuelTypeCatalog = { codes: Record<string, string> };
const fuelTypes = (fuelTypeCatalog as FuelTypeCatalog).codes;

export interface FuelIdentification {
  status: FuelIdentificationStatus;
  fuelTypeCode: number | null;
  fuelTypeLabel: string | null;
  alcoholPercent: number | null;
  confidence: 'BAIXA' | 'DIRETA';
  note: string;
}

/**
 * Interpreta somente evidência fornecida pela ECU.
 * Não estima a mistura usando STFT/LTFT, lambda ou consumo.
 */
export function identifyFuelFromObd(
  fuelTypeCode: number | null,
  alcoholPercent: number | null,
): FuelIdentification {
  if (alcoholPercent != null && (!Number.isFinite(alcoholPercent) || alcoholPercent < 0 || alcoholPercent > 100)) {
    return {
      status: 'DADO_INCOERENTE',
      fuelTypeCode,
      fuelTypeLabel: fuelTypeCode == null ? null : fuelTypes[String(fuelTypeCode)] ?? 'Código não mapeado',
      alcoholPercent: null,
      confidence: 'BAIXA',
      note: 'Percentual de álcool fora da faixa válida; manter resposta bruta para investigação.',
    };
  }

  if (fuelTypeCode == null && alcoholPercent == null) {
    return {
      status: 'SEM_DADOS',
      fuelTypeCode: null,
      fuelTypeLabel: null,
      alcoholPercent: null,
      confidence: 'BAIXA',
      note: 'A ECU ainda não forneceu os PIDs de identificação de combustível.',
    };
  }

  const fuelTypeLabel =
    fuelTypeCode == null ? null : fuelTypes[String(fuelTypeCode)] ?? 'Código não mapeado';

  if (alcoholPercent != null) {
    return {
      status: 'COMPOSICAO_ECU',
      fuelTypeCode,
      fuelTypeLabel,
      alcoholPercent,
      confidence: 'DIRETA',
      note: 'Percentual informado diretamente pela ECU; não é estimativa calculada pelo aplicativo.',
    };
  }

  return {
    status: 'TIPO_VEICULO',
    fuelTypeCode,
    fuelTypeLabel,
    alcoholPercent: null,
    confidence: 'DIRETA',
    note: 'O PID 0151 identifica o tipo declarado pela ECU, mas não confirma a composição atual do tanque.',
  };
}
