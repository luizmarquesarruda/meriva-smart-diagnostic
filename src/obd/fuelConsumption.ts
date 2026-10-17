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

    const valid = Number.isFinite(fuelRateLph) && fuelRateLph >= 0 && Number.isFinite(timestampMs);
    const timestampIsMonotonic = previous === null || timestampMs > previous.timestampMs;

    // Ignore stale/out-of-order samples entirely. Integrating zero for an
    // invalid interval but then moving the baseline backward would corrupt the
    // next otherwise-valid interval and can over/under-count fuel.
    if (!valid || !timestampIsMonotonic) return { ...this.state };

    const increment = integrateFuelRateLph(previous, current);
    this.state = {
      fuelUsedL: this.state.fuelUsedL + increment,
      validSamples: this.state.validSamples + 1,
      lastRateLph: fuelRateLph,
      lastTimestampMs: timestampMs,
    };

    return { ...this.state };
  }

  /** Break interpolation across a telemetry gap without clearing accumulated liters. */
  breakContinuity(): void {
    this.state.lastRateLph = null;
    this.state.lastTimestampMs = null;
  }

  getState(): FuelIntegrationState {
    return { ...this.state };
  }
}


export type FuelRateSource = 'MEASURED_015E' | 'ESTIMATED_MAF' | 'ESTIMATED_MAP';

export type FuelTypeForEstimate = 'FLEX' | 'ETANOL' | 'GASOLINA';

export interface FuelRateEstimateInput {
  mafGs?: number | null;
  mapKpa?: number | null;
  rpm?: number | null;
  intakeAirTempC?: number | null;
  displacementCm3?: number | null;
  volumetricEfficiency?: number;
  /** Explicit fuel mixture from app settings or compatible ECU PID 0152. */
  fuelType?: FuelTypeForEstimate;
  ethanolPercent?: number | null;
  /** Advanced overrides are retained for calibration/tests. */
  airFuelRatio?: number;
  fuelDensityKgPerL?: number;
}

/**
 * Approximate stoichiometric values for MAF/MAP-derived fuel flow.
 * Flex fuel requires measured ethanol percentage; never silently assume gasoline.
 * These are estimates, not a substitute for directly measured PID 015E.
 */
export function resolveFuelEstimateProperties(
  fuelType: FuelTypeForEstimate | undefined,
  ethanolPercent?: number | null,
): { airFuelRatio: number; fuelDensityKgPerL: number } | null {
  if (fuelType === 'GASOLINA') return { airFuelRatio: 14.7, fuelDensityKgPerL: 0.745 };
  if (fuelType === 'ETANOL') return { airFuelRatio: 9.0, fuelDensityKgPerL: 0.789 };
  if (fuelType !== 'FLEX' || !Number.isFinite(ethanolPercent) || ethanolPercent! < 0 || ethanolPercent! > 100) {
    return null;
  }

  // First-order volumetric blend interpolation, documented as an estimate.
  const ethanolFraction = ethanolPercent! / 100;
  return {
    airFuelRatio: 14.7 * (1 - ethanolFraction) + 9.0 * ethanolFraction,
    fuelDensityKgPerL: 0.745 * (1 - ethanolFraction) + 0.789 * ethanolFraction,
  };
}

export function estimateFuelRateLph(input: FuelRateEstimateInput): { rateLph: number; source: FuelRateSource } | null {
  const fuelProperties = resolveFuelEstimateProperties(input.fuelType, input.ethanolPercent);
  const afr = input.airFuelRatio ?? fuelProperties?.airFuelRatio;
  const density = input.fuelDensityKgPerL ?? fuelProperties?.fuelDensityKgPerL;
  if (
    afr == null || density == null ||
    !Number.isFinite(afr) || !Number.isFinite(density) ||
    afr <= 0 || density <= 0
  ) return null;

  if (Number.isFinite(input.mafGs) && (input.mafGs ?? 0) > 0 && afr > 0 && density > 0) {
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
