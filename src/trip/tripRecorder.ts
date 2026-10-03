import { FuelRateIntegrator } from '../obd/fuelConsumption';
import type { DriveCycle } from '../data/driveCycles';

export interface RealTripSample {
  timestampMs: number;
  distanceKm: number;
  speedKmh: number;
  fuelRateLph: number | null;
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
    if (state.distanceKm < 0.1 || state.fuelUsedL <= 0 || state.validFuelSamples < 2) return null;

    const avgFuelConsumptionKml = state.distanceKm / state.fuelUsedL;
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
      importedAt: new Date().toISOString(),
    };
  }
}