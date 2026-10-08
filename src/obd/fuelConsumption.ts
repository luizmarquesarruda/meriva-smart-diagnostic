export interface FuelRateSample {
  fuelRateLph: number;
  timestampMs: number;
}

export interface FuelIntegrationState {
  fuelUsedL: number;
  validSamples: number;
  lastRateLph: number | null;
  lastTimestampMs: number | null;
}

const MAX_INTERVAL_MS = 30_000;

export function integrateFuelRateLph(
  previous: FuelRateSample | null,
  current: FuelRateSample,
): number {
  if (!previous) return 0;
  if (
    !Number.isFinite(previous.fuelRateLph) ||
    previous.fuelRateLph < 0 ||
    !Number.isFinite(current.fuelRateLph) ||
    current.fuelRateLph < 0
  ) return 0;

  const elapsedMs = current.timestampMs - previous.timestampMs;
  if (!Number.isFinite(elapsedMs) || elapsedMs <= 0 || elapsedMs > MAX_INTERVAL_MS) return 0;

  const averageLph = (previous.fuelRateLph + current.fuelRateLph) / 2;
  return averageLph * (elapsedMs / 3_600_000);
}

export class FuelRateIntegrator {
  private state: FuelIntegrationState = {
    fuelUsedL: 0,
    validSamples: 0,
    lastRateLph: null,
    lastTimestampMs: null,
  };

  reset(): void {
    this.state = {
      fuelUsedL: 0,
      validSamples: 0,
      lastRateLph: null,
      lastTimestampMs: null,
    };
  }

  addSample(fuelRateLph: number, timestampMs = Date.now()): FuelIntegrationState {
    const current: FuelRateSample = { fuelRateLph, timestampMs };
    const previous =
      this.state.lastRateLph != null && this.state.lastTimestampMs != null
        ? { fuelRateLph: this.state.lastRateLph, timestampMs: this.state.lastTimestampMs }
        : null;

    const increment = integrateFuelRateLph(previous, current);
    const valid = Number.isFinite(fuelRateLph) && fuelRateLph >= 0 && Number.isFinite(timestampMs);

    this.state = {
      fuelUsedL: this.state.fuelUsedL + increment,
      validSamples: this.state.validSamples + (valid ? 1 : 0),
      lastRateLph: valid ? fuelRateLph : this.state.lastRateLph,
      lastTimestampMs: valid ? timestampMs : this.state.lastTimestampMs,
    };

    return { ...this.state };
  }

  getState(): FuelIntegrationState {
    return { ...this.state };
  }
}


export type FuelRateSource = 'MEASURED_015E' | 'ESTIMATED_MAF' | 'ESTIMATED_MAP';

export type ManualFuelType = 'FLEX' | 'ETANOL' | 'GASOLINA';
export type FuelCompositionSource = 'REAL_OBD_0152' | 'ESTIMATED_MANUAL_PERCENT' | 'ESTIMATED_MANUAL_ETHANOL' | 'ESTIMATED_BRAZIL_GASOLINE_E32' | 'ESTIMATED_DEFAULT_GASOLINE_A';
export type FuelEstimateConfidence = 'DIRETA' | 'BAIXA';

export interface FuelModel {
  ethanolPercent: number;
  airFuelRatio: number;
  fuelDensityKgPerL: number;
  source: FuelCompositionSource;
  confidence: FuelEstimateConfidence;
  assumption: string;
}

export interface FuelCompositionInput {
  alcoholPercentFromObd?: number | null;
  manualFuelType?: ManualFuelType | null;
  manualAlcoholPercent?: number | null;
}

export interface FuelRateEstimateInput extends FuelCompositionInput {
  mafGs?: number | null;
  mapKpa?: number | null;
  rpm?: number | null;
  intakeAirTempC?: number | null;
  displacementCm3?: number | null;
  volumetricEfficiency?: number;
  airFuelRatio?: number;
  fuelDensityKgPerL?: number;
}

export interface FuelRateEstimate {
  rateLph: number;
  source: Exclude<FuelRateSource, 'MEASURED_015E'>;
  airFuelRatio: number;
  fuelDensityKgPerL: number;
  fuelModel: FuelModel;
}

const GASOLINE_A_AFR = 14.7;
const ETHANOL_AFR = 9.0;
const GASOLINE_A_DENSITY_KG_PER_L = 0.750;
const ETHANOL_DENSITY_KG_PER_L = 0.794;
const BRAZIL_GASOLINE_C_ETHANOL_PERCENT = 32;

function validAlcoholPercent(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value) && value >= 0 && value <= 100;
}

function buildFuelModel(ethanolPercent: number, source: FuelCompositionSource, confidence: FuelEstimateConfidence, assumption: string): FuelModel {
  const ethanolVolumeFraction = ethanolPercent / 100;
  const gasolineVolumeFraction = 1 - ethanolVolumeFraction;
  const ethanolMassFraction = (ethanolVolumeFraction * ETHANOL_DENSITY_KG_PER_L) /
    (ethanolVolumeFraction * ETHANOL_DENSITY_KG_PER_L + gasolineVolumeFraction * GASOLINE_A_DENSITY_KG_PER_L);
  const gasolineMassFraction = 1 - ethanolMassFraction;
  const airFuelRatio = 1 / (gasolineMassFraction / GASOLINE_A_AFR + ethanolMassFraction / ETHANOL_AFR);
  const fuelDensityKgPerL = gasolineVolumeFraction * GASOLINE_A_DENSITY_KG_PER_L + ethanolVolumeFraction * ETHANOL_DENSITY_KG_PER_L;
  return { ethanolPercent, airFuelRatio, fuelDensityKgPerL, source, confidence, assumption };
}

export function resolveFuelModel(input: FuelCompositionInput = {}): FuelModel {
  if (validAlcoholPercent(input.alcoholPercentFromObd)) return buildFuelModel(input.alcoholPercentFromObd, 'REAL_OBD_0152', 'DIRETA', '0152 ECU: ' + input.alcoholPercentFromObd.toFixed(1) + '% álcool');
  if (validAlcoholPercent(input.manualAlcoholPercent)) return buildFuelModel(input.manualAlcoholPercent, 'ESTIMATED_MANUAL_PERCENT', 'BAIXA', 'percentual manual informado: ' + input.manualAlcoholPercent.toFixed(1) + '% álcool');
  if (input.manualFuelType === 'ETANOL') return buildFuelModel(100, 'ESTIMATED_MANUAL_ETHANOL', 'BAIXA', 'combustível manual: etanol');
  if (input.manualFuelType === 'GASOLINA') return buildFuelModel(BRAZIL_GASOLINE_C_ETHANOL_PERCENT, 'ESTIMATED_BRAZIL_GASOLINE_E32', 'BAIXA', 'combustível manual: gasolina C comum brasileira E' + BRAZIL_GASOLINE_C_ETHANOL_PERCENT);
  return buildFuelModel(0, 'ESTIMATED_DEFAULT_GASOLINE_A', 'BAIXA', 'nenhuma composição válida disponível; AFR 14,7 assumido como fallback');
}

export function estimateFuelRateLph(input: FuelRateEstimateInput): FuelRateEstimate | null {
  const fuelModel = resolveFuelModel(input);
  const afr = input.airFuelRatio ?? fuelModel.airFuelRatio;
  const density = input.fuelDensityKgPerL ?? fuelModel.fuelDensityKgPerL;

  if (Number.isFinite(input.mafGs) && (input.mafGs ?? 0) >= 0 && afr > 0 && density > 0) {
    const fuelKgPerSecond = (input.mafGs as number) / 1000 / afr;
    return { rateLph: fuelKgPerSecond * 3600 / density, source: 'ESTIMATED_MAF', airFuelRatio: afr, fuelDensityKgPerL: density, fuelModel };
  }

  const map = input.mapKpa;
  const rpm = input.rpm;
  const iat = input.intakeAirTempC;
  const displacementL = (input.displacementCm3 ?? 0) / 1000;
  const ve = input.volumetricEfficiency ?? 0.80;
  if (
    Number.isFinite(map) && (map ?? 0) > 0
    && Number.isFinite(rpm) && (rpm ?? 0) > 0
    && Number.isFinite(iat)
    && displacementL > 0
    && afr > 0 && density > 0 && ve > 0
  ) {
    const absolutePressurePa = (map as number) * 1000;
    const temperatureK = (iat as number) + 273.15;
    const airDensityGPerL = absolutePressurePa / (287.05 * temperatureK);
    const volumetricFlowLPerSecond = displacementL * (rpm as number) / 120 * ve;
    const mafGs = airDensityGPerL * volumetricFlowLPerSecond;
    const fuelKgPerSecond = mafGs / 1000 / afr;
    return { rateLph: fuelKgPerSecond * 3600 / density, source: 'ESTIMATED_MAP', airFuelRatio: afr, fuelDensityKgPerL: density, fuelModel };
  }

  return null;
}
