import { FuelRateIntegrator } from '../obd/fuelConsumption';
import type { DriveCycle } from '../data/driveCycles';
import type { FuelRateSource } from '../obd/fuelConsumption';

export interface RealTripSample {
  timestampMs: number;
  distanceKm: number;
  speedKmh: number;
  fuelRateLph: number | null;
  fuelRateSource?: FuelRateSource;
}

export interface RealTripRecorderState {
  startedAtMs: number;
  distanceKm: number;
  fuelUsedL: number;
  durationMs: number;
  movingTimeMs: number;
  maxSpeedKmh: number;
  validFuelSamples: number;
  sampleCount: number;
  lastTimestampMs: number | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function finiteNonNegative(value: number): number | null {
  return Number.isFinite(value) && value >= 0 ? value : null;
}

export class RealTripRecorder {
  private readonly startedAtMs: number;
  private lastTimestampMs: number | null = null;
  private lastAbsoluteDistanceKm: number;
  private readonly fuelIntegrator = new FuelRateIntegrator();
  private distanceKm = 0;
  private durationMs = 0;
  private movingTimeMs = 0;
  private maxSpeedKmh = 0;
  private sampleCount = 0;
  private fuelRateSources = new Set<FuelRateSource>();

  constructor(startedAtMs = Date.now(), initialDistanceKm = 0) {
    this.startedAtMs = Number.isFinite(startedAtMs) ? startedAtMs : Date.now();
    this.lastAbsoluteDistanceKm = finiteNonNegative(initialDistanceKm) ?? 0;
  }

  addSample(sample: RealTripSample): RealTripRecorderState {
    // A timestamp must be valid and strictly newer. Reject the whole stale sample
    // before it can alter distance, speed, duration, or fuel integration.
    if (!Number.isFinite(sample.timestampMs)) return this.getState();
    const timestampMs = sample.timestampMs;
    if (this.lastTimestampMs != null && timestampMs <= this.lastTimestampMs) {
      return this.getState();
    }

    this.sampleCount += 1;
    const absoluteDistanceKm = finiteNonNegative(sample.distanceKm);
    const speedKmh = finiteNonNegative(sample.speedKmh) ?? 0;

    if (absoluteDistanceKm != null) {
      if (absoluteDistanceKm >= this.lastAbsoluteDistanceKm) {
        this.distanceKm += absoluteDistanceKm - this.lastAbsoluteDistanceKm;
      }
      // If GPS cumulative distance resets backwards, rebase the baseline without
      // subtracting already accumulated trip distance. Invalid distances do not
      // replace the last valid baseline.
      this.lastAbsoluteDistanceKm = absoluteDistanceKm;
    }

    this.maxSpeedKmh = Number(Math.max(this.maxSpeedKmh, speedKmh).toFixed(1));

    if (this.lastTimestampMs != null) {
      const deltaMs = timestampMs - this.lastTimestampMs;
      if (deltaMs <= 30_000) {
        this.durationMs += deltaMs;
        if (speedKmh >= 3) this.movingTimeMs += deltaMs;
      }
    }
    this.lastTimestampMs = timestampMs;

    if (sample.fuelRateLph != null && Number.isFinite(sample.fuelRateLph) && sample.fuelRateLph >= 0) {
      this.fuelIntegrator.addSample(sample.fuelRateLph, timestampMs);
      if (sample.fuelRateSource) this.fuelRateSources.add(sample.fuelRateSource);
    }

    return this.getState();
  }

  getState(): RealTripRecorderState {
    const fuelState = this.fuelIntegrator.getState();
    return {
      startedAtMs: this.startedAtMs,
      // Keep full precision internally; round only at the public state boundary so
      // repeated sub-meter segments are not individually rounded away.
      distanceKm: Number(this.distanceKm.toFixed(3)),
      fuelUsedL: fuelState.fuelUsedL,
      durationMs: this.durationMs,
      movingTimeMs: this.movingTimeMs,
      maxSpeedKmh: this.maxSpeedKmh,
      validFuelSamples: fuelState.validSamples,
      sampleCount: this.sampleCount,
      lastTimestampMs: this.lastTimestampMs,
    };
  }

  buildDriveCycle(finishedAtMs = Date.now()): DriveCycle | null {
    const state = this.getState();
    if (state.sampleCount < 1) return null;

    const reasons: string[] = [];
    if (state.distanceKm < 0.1) reasons.push('DISTANCE_TOO_SHORT');
    if (state.fuelUsedL < 0.05) reasons.push('INSUFFICIENT_FUEL_VOLUME');
    if (state.validFuelSamples < 2) reasons.push('INSUFFICIENT_FUEL_SAMPLES');

    const dataQuality: 'COMPLETE' | 'INCOMPLETE' = reasons.length === 0 ? 'COMPLETE' : 'INCOMPLETE';
    // Keep observed real trips even when short or fuel telemetry is incomplete.
    // Zero is an internal sentinel only; the UI must render it as N/D for incomplete trips.
    const avgFuelConsumptionKml = dataQuality === 'COMPLETE' ? state.distanceKm / state.fuelUsedL : 0;
    const avgDrivingSpeedKmh = state.movingTimeMs > 0
      ? state.distanceKm / (state.movingTimeMs / 3_600_000)
      : 0;

    return {
      id: `real_obd_${this.startedAtMs}_${finishedAtMs}`,
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      distanceTotalKm: state.distanceKm,
      distanceIceKm: state.distanceKm,
      fuelUsedL: state.fuelUsedL,
      totalTimeHms: formatDuration(state.durationMs),
      drivingTimeHms: formatDuration(state.movingTimeMs),
      standingTimeHms: formatDuration(Math.max(0, state.durationMs - state.movingTimeMs)),
      avgDrivingSpeedKmh: Number(avgDrivingSpeedKmh.toFixed(3)),
      avgFuelConsumptionKml: Number(avgFuelConsumptionKml.toFixed(3)),
      source: 'REAL_OBD',
      dataQuality,
      ...(reasons.length ? { incompleteReason: reasons.join(',') } : {}),
      fuelRateSource: this.fuelRateSources.size === 1
        ? [...this.fuelRateSources][0]
        : this.fuelRateSources.size > 1 ? 'MIXED' : undefined,
      importedAt: new Date().toISOString(),
    };
  }
}
