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
      fuelUsedL: Number((this.state.fuelUsedL + increment).toFixed(6)),
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
