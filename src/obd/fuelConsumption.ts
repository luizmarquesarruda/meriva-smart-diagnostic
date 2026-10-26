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

// OBD-II input ranges: MAF (PID 0110), MAP (010B), RPM (010C), and IAT (010F).
// These caps stop synthetic/corrupt sensor values from yielding plausible-looking
// but physically impossible fuel rates. The estimate is only a fallback; 015E wins.
const MAX_OBD_MAF_GS = 655.35;
const MAX_OBD_MAP_KPA = 255;
const MAX_OBD_ENGINE_RPM = 16_383.75;
const MIN_OBD_IAT_C = -40;
const MAX_OBD_IAT_C = 215;
const MAX_ENGINE_DISPLACEMENT_L = 50;
const MAX_VOLUMETRIC_EFFICIENCY = 2;
const MAX_ESTIMATED_FUEL_RATE_LPH = 500;

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
  const increment = averageLph * (elapsedMs / 3_600_000);
  return Number.isFinite(increment) && increment >= 0 ? increment : 0;
}

export class FuelRateIntegrator {
  private gapDetected = false;
  private state: FuelIntegrationState = {
    fuelUsedL: 0,
    validSamples: 0,
    lastRateLph: null,
    lastTimestampMs: null,
  };

  reset(): void {
    this.gapDetected = false;
    this.state = {
      fuelUsedL: 0,
      validSamples: 0,
      lastRateLph: null,
      lastTimestampMs: null,
    };
  }

  /** True if any >30 s fuel-flow gap occurred during this trip. */
  hasGap(): boolean {
    return this.gapDetected;
  }

  /**
   * Notify the integrator when the trip loop had no usable fuel-rate sample.
   * If the gap exceeds the integration window, clear the old baseline.
   */
  noteMissingSample(timestampMs = Date.now()): void {
    const lastTimestampMs = this.state.lastTimestampMs;
    if (!Number.isFinite(timestampMs) || lastTimestampMs == null || timestampMs <= lastTimestampMs) return;
    if (timestampMs - lastTimestampMs > MAX_INTERVAL_MS) {
      this.gapDetected = true;
      this.state = { ...this.state, lastRateLph: null, lastTimestampMs: null };
    }
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
    if (previous && timestampMs - previous.timestampMs > MAX_INTERVAL_MS) {
      this.gapDetected = true;
    }

    const increment = integrateFuelRateLph(previous, current);
    this.state = {
      fuelUsedL: this.state.fuelUsedL + increment,
      validSamples: this.state.validSamples + 1,
      lastRateLph: fuelRateLph,
      lastTimestampMs: timestampMs,
    };

    return { ...this.state };
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

  if (Number.isFinite(input.mafGs) && (input.mafGs ?? 0) > 0 && (input.mafGs ?? 0) <= MAX_OBD_MAF_GS && afr > 0 && density > 0) {
    const fuelKgPerSecond = (input.mafGs as number) / 1000 / afr;
    const rateLph = fuelKgPerSecond * 3600 / density;
    if (Number.isFinite(rateLph) && rateLph > 0 && rateLph <= MAX_ESTIMATED_FUEL_RATE_LPH) {
      return { rateLph, source: 'ESTIMATED_MAF' };
    }
  }

  const map = input.mapKpa;
  const rpm = input.rpm;
  const iat = input.intakeAirTempC;
  const displacementL = (input.displacementCm3 ?? 0) / 1000;
  const ve = input.volumetricEfficiency ?? 0.80;
  if (
    Number.isFinite(map) && (map ?? 0) > 0 && (map ?? 0) <= MAX_OBD_MAP_KPA
    && Number.isFinite(rpm) && (rpm ?? 0) > 0 && (rpm ?? 0) <= MAX_OBD_ENGINE_RPM
    && Number.isFinite(iat) && (iat as number) >= MIN_OBD_IAT_C && (iat as number) <= MAX_OBD_IAT_C
    && Number.isFinite(displacementL) && displacementL > 0 && displacementL <= MAX_ENGINE_DISPLACEMENT_L
    && afr > 0 && density > 0 && Number.isFinite(ve) && ve > 0 && ve <= MAX_VOLUMETRIC_EFFICIENCY
  ) {
    const absolutePressurePa = (map as number) * 1000;
    const temperatureK = (iat as number) + 273.15;
    if (!Number.isFinite(temperatureK) || temperatureK <= 0) return null;
    const airDensityGPerL = absolutePressurePa / (287.05 * temperatureK);
    const volumetricFlowLPerSecond = displacementL * (rpm as number) / 120 * ve;
    const mafGs = airDensityGPerL * volumetricFlowLPerSecond;
    const fuelKgPerSecond = mafGs / 1000 / afr;
    const rateLph = fuelKgPerSecond * 3600 / density;
    if (Number.isFinite(rateLph) && rateLph > 0 && rateLph <= MAX_ESTIMATED_FUEL_RATE_LPH) {
      return { rateLph, source: 'ESTIMATED_MAP' };
    }
  }

  return null;
}
