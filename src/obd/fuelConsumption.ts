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

export interface FuelRateEstimateInput {
  mafGs?: number | null;
  mapKpa?: number | null;
  rpm?: number | null;
  intakeAirTempC?: number | null;
  displacementCm3?: number | null;
  volumetricEfficiency?: number;
  airFuelRatio?: number;
  fuelDensityKgPerL?: number;
}

export function estimateFuelRateLph(input: FuelRateEstimateInput): { rateLph: number; source: FuelRateSource } | null {
  const afr = input.airFuelRatio ?? 14.7;
  const density = input.fuelDensityKgPerL ?? 0.745;

  if (Number.isFinite(input.mafGs) && (input.mafGs ?? 0) >= 0 && afr > 0 && density > 0) {
    const fuelKgPerSecond = (input.mafGs as number) / 1000 / afr;
    return { rateLph: fuelKgPerSecond * 3600 / density, source: 'ESTIMATED_MAF' };
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
    return { rateLph: fuelKgPerSecond * 3600 / density, source: 'ESTIMATED_MAP' };
  }

  return null;
}
