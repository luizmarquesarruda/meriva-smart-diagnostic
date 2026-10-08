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
  lastTimestampMs: number | null;
}

function formatDuration(ms: number): string {
  const totalSeconds = Math.max(0, Math.round(ms / 1000));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return [hours, minutes, seconds].map((part) => String(part).padStart(2, '0')).join(':');
}

function toFiniteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export class RealTripRecorder {
  private readonly startedAtMs: number;
  private readonly initialDistanceKm: number;
  private readonly fuelIntegrator = new FuelRateIntegrator();
  private lastTimestampMs: number | null = null;
  private distanceKm = 0;
  private durationMs = 0;
  private movingTimeMs = 0;
  private maxSpeedKmh = 0;
  private fuelRateSources = new Set<FuelRateSource>();

  constructor(startedAtMs = Date.now(), initialDistanceKm = 0) {
    this.startedAtMs = startedAtMs;
    this.initialDistanceKm = toFiniteNonNegative(initialDistanceKm);
  }

  addSample(sample: RealTripSample): RealTripRecorderState {
    const timestampMs = Number.isFinite(sample.timestampMs) ? sample.timestampMs : Date.now();
    const absoluteDistanceKm = toFiniteNonNegative(sample.distanceKm);
    const speedKmh = toFiniteNonNegative(sample.speedKmh);
    const deltaDistanceKm = absoluteDistanceKm >= this.initialDistanceKm
      ? absoluteDistanceKm - this.initialDistanceKm
      : 0;

    this.distanceKm = Number(deltaDistanceKm.toFixed(3));
    this.maxSpeedKmh = Number(Math.max(this.maxSpeedKmh, speedKmh).toFixed(1));

    if (
      this.lastTimestampMs != null &&
      timestampMs > this.lastTimestampMs &&
      timestampMs - this.lastTimestampMs <= 30_000
    ) {
      const deltaMs = timestampMs - this.lastTimestampMs;
      this.durationMs += deltaMs;
      if (speedKmh >= 3) this.movingTimeMs += deltaMs;
    }
    this.lastTimestampMs = timestampMs;

    if (sample.fuelRateLph != null && Number.isFinite(sample.fuelRateLph)) {
      this.fuelIntegrator.addSample(sample.fuelRateLph, timestampMs);
      if (sample.fuelRateSource) this.fuelRateSources.add(sample.fuelRateSource);
    }

    return this.getState();
  }

  getState(): RealTripRecorderState {
    const fuelState = this.fuelIntegrator.getState();
    return {
      startedAtMs: this.startedAtMs,
      distanceKm: this.distanceKm,
      fuelUsedL: fuelState.fuelUsedL,
      durationMs: this.durationMs,
      movingTimeMs: this.movingTimeMs,
      maxSpeedKmh: this.maxSpeedKmh,
      validFuelSamples: fuelState.validSamples,
      lastTimestampMs: this.lastTimestampMs,
    };
  }

  buildDriveCycle(finishedAtMs = Date.now()): DriveCycle | null {
    const state = this.getState();
    if (state.distanceKm < 0.1 || state.durationMs <= 0) return null;

    const hasFuelEvidence = state.fuelUsedL > 0 && state.validFuelSamples >= 2;
    const avgFuelConsumptionKml = hasFuelEvidence ? state.distanceKm / state.fuelUsedL : 0;
    const avgDrivingSpeedKmh = state.movingTimeMs > 0
      ? state.distanceKm / (state.movingTimeMs / 3_600_000)
      : 0;

    return {
      id: `real_obd_${this.startedAtMs}_${finishedAtMs}`,
      startedAt: new Date(this.startedAtMs).toISOString(),
      finishedAt: new Date(finishedAtMs).toISOString(),
      distanceTotalKm: state.distanceKm,
      distanceIceKm: state.distanceKm,
      fuelUsedL: hasFuelEvidence ? state.fuelUsedL : 0,
      totalTimeHms: formatDuration(state.durationMs),
      drivingTimeHms: formatDuration(state.movingTimeMs),
      standingTimeHms: formatDuration(Math.max(0, state.durationMs - state.movingTimeMs)),
      avgDrivingSpeedKmh: Number(avgDrivingSpeedKmh.toFixed(3)),
      avgFuelConsumptionKml: Number(avgFuelConsumptionKml.toFixed(3)),
      source: 'REAL_OBD',
      fuelConsumptionStatus: hasFuelEvidence ? 'AVAILABLE' : 'SEM_DADOS',
      fuelRateSource: this.fuelRateSources.size === 1
        ? [...this.fuelRateSources][0]
        : this.fuelRateSources.size > 1 ? 'MIXED' : undefined,
      importedAt: new Date().toISOString(),
    };
  }
}