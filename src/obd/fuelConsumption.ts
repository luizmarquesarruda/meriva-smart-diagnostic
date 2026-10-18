import * as fuelModel from '../knowledge/fuel_consumption_model.json';

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

const MAX_INTERVAL_MS = fuelModel.limits.maxIntegrationGapMs;

/** Defensive limits are model parameters, not Meriva-specific measured calibration. */
export const MAX_PLAUSIBLE_FUEL_RATE_LPH = fuelModel.limits.maxFuelRateLph;
export const MAX_PLAUSIBLE_CONSUMPTION_KML = fuelModel.limits.maxInstantConsumptionKml;
const MAX_PLAUSIBLE_MAF_GS = fuelModel.limits.maxMafGs;

function isPlausibleFuelRateLph(value: number): boolean {
  return Number.isFinite(value) && value >= 0 && value <= MAX_PLAUSIBLE_FUEL_RATE_LPH;
}

/** A zero rate or >30 km/L result is unavailable, not a valid instantaneous average. */
export function calculateInstantaneousConsumptionKml(
  speedKmh: number | null | undefined,
  fuelRateLph: number | null | undefined,
): number | null {
  if (
    !Number.isFinite(speedKmh) || (speedKmh ?? 0) <= 0 ||
    !Number.isFinite(fuelRateLph) || (fuelRateLph ?? 0) <= 0
  ) return null;
  const value = (speedKmh as number) / (fuelRateLph as number);
  return Number.isFinite(value) && value > 0 && value <= MAX_PLAUSIBLE_CONSUMPTION_KML
    ? value
    : null;
}

export function integrateFuelRateLph(
  previous: FuelRateSample | null,
  current: FuelRateSample,
): number {
  if (!previous) return 0;
  if (
    !isPlausibleFuelRateLph(previous.fuelRateLph) ||
    !isPlausibleFuelRateLph(current.fuelRateLph)
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

    const valid = isPlausibleFuelRateLph(fuelRateLph) && Number.isFinite(timestampMs);
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

  getState(): FuelIntegrationState {
    return { ...this.state };
  }
}


export type FuelRateSource = 'MEASURED_015E' | 'ESTIMATED_MAF' | 'ESTIMATED_MAP' | 'ESTIMATED_FLEX';

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
  /** Full-to-full correction, if a future persisted calibration provides one. */
  calibrationFactor?: number;
}

/**
 * Approximate stoichiometric values for MAF/MAP-derived fuel flow.
 * FLEX without PID 0152 uses an explicit 50% blend reference solely to keep an
 * estimate available. The caller must surface ESTIMATED_FLEX because this is
 * not a measured mixture. Selecting the actually used fuel or obtaining PID
 * 0152 gives a more relevant estimate. None of these replaces measured PID 015E.
 */
export function resolveFuelEstimateProperties(
  fuelType: FuelTypeForEstimate | undefined,
  ethanolPercent?: number | null,
): { airFuelRatio: number; fuelDensityKgPerL: number } | null {
  const properties = fuelModel.fuelProperties;
  if (fuelType === 'GASOLINA') {
    return {
      airFuelRatio: properties.gasolineCRetailReference.airFuelRatio,
      fuelDensityKgPerL: properties.gasolineCRetailReference.densityKgPerL,
    };
  }
  if (fuelType === 'ETANOL') {
    return {
      airFuelRatio: properties.hydrousEthanolReference.airFuelRatio,
      fuelDensityKgPerL: properties.hydrousEthanolReference.densityKgPerL,
    };
  }
  if (fuelType !== 'FLEX') return null;

  // When PID 0152 is absent, E50 is only a visible reference assumption.
  // With a reported percentage, treat it as the blend-volume percentage,
  // subject to future confirmation of the PID semantics on the Meriva ECU.
  const hasMeasuredBlend = Number.isFinite(ethanolPercent) &&
    ethanolPercent! >= 0 && ethanolPercent! <= 100;
  const ethanolFraction = (hasMeasuredBlend
    ? ethanolPercent!
    : properties.unknownFlexReferenceEthanolPercent) / 100;
  const gasoline = properties.gasolineAReference;
  const ethanol = properties.hydrousEthanolReference;
  const fuelDensityKgPerL =
    gasoline.densityKgPerL * (1 - ethanolFraction) +
    ethanol.densityKgPerL * ethanolFraction;
  if (!Number.isFinite(fuelDensityKgPerL) || fuelDensityKgPerL <= 0) return null;

  // AFR for a volumetric blend is mass-weighted; linear interpolation of AFR
  // by volume alone would introduce avoidable bias.
  const stoichiometricAirPerLiter =
    gasoline.airFuelRatio * gasoline.densityKgPerL * (1 - ethanolFraction) +
    ethanol.airFuelRatio * ethanol.densityKgPerL * ethanolFraction;
  const airFuelRatio = stoichiometricAirPerLiter / fuelDensityKgPerL;
  return Number.isFinite(airFuelRatio) && airFuelRatio > 0
    ? { airFuelRatio, fuelDensityKgPerL }
    : null;
}

function applyFuelFlowCorrection(rateLph: number, requestedFactor?: number): number {
  const calibration = fuelModel.calibration;
  const configuredDefault = calibration.defaultFlowCorrectionFactor;
  const validRequestedFactor =
    Number.isFinite(requestedFactor) &&
    (requestedFactor ?? 0) >= calibration.minFlowCorrectionFactor &&
    (requestedFactor ?? 0) <= calibration.maxFlowCorrectionFactor;
  const factor = validRequestedFactor ? requestedFactor as number : configuredDefault;
  return rateLph * factor;
}

export function estimateFuelRateLph(input: FuelRateEstimateInput): { rateLph: number; source: FuelRateSource } | null {
  const fuelProperties = resolveFuelEstimateProperties(input.fuelType, input.ethanolPercent);
  const hasMeasuredBlend = Number.isFinite(input.ethanolPercent) && input.ethanolPercent! >= 0 && input.ethanolPercent! <= 100;
  const assumedFlexBlend = input.fuelType === 'FLEX' && !hasMeasuredBlend;
  const afr = input.airFuelRatio ?? fuelProperties?.airFuelRatio;
  const density = input.fuelDensityKgPerL ?? fuelProperties?.fuelDensityKgPerL;
  if (
    afr == null || density == null ||
    !Number.isFinite(afr) || !Number.isFinite(density) ||
    afr <= 0 || density <= 0
  ) return null;

  if (
    Number.isFinite(input.mafGs)
    && (input.mafGs ?? 0) > 0
    && (input.mafGs ?? Number.POSITIVE_INFINITY) <= MAX_PLAUSIBLE_MAF_GS
    && afr > 0 && density > 0
  ) {
    const uncorrectedRateLph = ((input.mafGs as number) * 3.6) / (afr * density);
    const rateLph = applyFuelFlowCorrection(uncorrectedRateLph, input.calibrationFactor);
    return isPlausibleFuelRateLph(rateLph) && rateLph > 0
      ? { rateLph, source: assumedFlexBlend ? 'ESTIMATED_FLEX' : 'ESTIMATED_MAF' }
      : null;
  }

  const map = input.mapKpa;
  const rpm = input.rpm;
  const iat = input.intakeAirTempC;
  const displacementL = (input.displacementCm3 ?? fuelModel.vehicleDefaults.displacementCm3) / 1000;
  const ve = input.volumetricEfficiency ?? fuelModel.vehicleDefaults.volumetricEfficiency;
  if (
    Number.isFinite(map) && (map ?? 0) > 0
    && Number.isFinite(rpm) && (rpm ?? 0) > 0
    && Number.isFinite(iat)
    && displacementL > 0
    && afr > 0 && density > 0 && ve > 0
  ) {
    const absolutePressurePa = (map as number) * 1000;
    const temperatureK = (iat as number) + fuelModel.physicalConstants.celsiusToKelvin;
    const airDensityGPerL = absolutePressurePa / (fuelModel.physicalConstants.airGasConstantJPerKgK * temperatureK);
    const volumetricFlowLPerSecond =
      displacementL * (rpm as number) / fuelModel.physicalConstants.fourStrokeRpmDivisor * ve;
    const mafGs = airDensityGPerL * volumetricFlowLPerSecond;
    if (!Number.isFinite(temperatureK) || temperatureK <= 0 ||
        !Number.isFinite(mafGs) || mafGs <= 0 || mafGs > MAX_PLAUSIBLE_MAF_GS) return null;
    const uncorrectedRateLph = (mafGs * 3.6) / (afr * density);
    const rateLph = applyFuelFlowCorrection(uncorrectedRateLph, input.calibrationFactor);
    return isPlausibleFuelRateLph(rateLph) && rateLph > 0
      ? { rateLph, source: assumedFlexBlend ? 'ESTIMATED_FLEX' : 'ESTIMATED_MAP' }
      : null;
  }

  return null;
}
