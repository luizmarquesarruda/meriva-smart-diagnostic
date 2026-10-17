import { FuelRateIntegrator } from '../obd/fuelConsumption';
import type { DriveCycle, TripTelemetrySample } from '../data/driveCycles';
import type { FuelRateSource } from '../obd/fuelConsumption';

export interface RealTripSample {
  timestampMs: number;
  distanceKm: number;
  speedKmh: number;
  /** Fresh speed PID 010D; null means OBD distance must not be integrated for this sample. */
  obdSpeedKmh?: number | null;
  fuelRateLph: number | null;
  fuelRateSource?: FuelRateSource;
  rpm?: number | null;
  coolantTempC?: number | null;
}

/** Minimum integrated fuel required before persisting a consumption average. */
export const MIN_TRIP_FUEL_L = 0.05;

/**
 * Do not split a drive every time the vehicle stops briefly at a traffic light.
 * An explicit zero RPM is stronger evidence of engine-off than missing RPM data.
 */
export const STOPPED_ENGINE_OFF_CLOSE_DELAY_MS = 60_000;
export const STOPPED_OTHER_CLOSE_DELAY_MS = 300_000;

/** Keep a real trip open through brief ECU/Bluetooth drops; GPS itself stops immediately. */
export const LINK_LOSS_TRIP_GRACE_MS = 120_000;

export function shouldFinalizeAfterLinkLoss(linkLossDurationMs: number): boolean {
  return Number.isFinite(linkLossDurationMs) && linkLossDurationMs >= LINK_LOSS_TRIP_GRACE_MS;
}

export function shouldFinalizeStoppedTrip(
  stoppedDurationMs: number,
  rpm: number | null | undefined,
): boolean {
  if (!Number.isFinite(stoppedDurationMs) || stoppedDurationMs < 0) return false;
  const engineExplicitlyOff = rpm != null && Number.isFinite(rpm) && rpm <= 0;
  const threshold = engineExplicitlyOff
    ? STOPPED_ENGINE_OFF_CLOSE_DELAY_MS
    : STOPPED_OTHER_CLOSE_DELAY_MS;
  return stoppedDurationMs >= threshold;
}

export interface RealTripRecorderState {
  startedAtMs: number;
  distanceKm: number;
  distanceObdKm: number;
  distanceGpsKm: number;
  distanceSource: 'OBD' | 'GPS' | 'MIXED' | 'UNAVAILABLE';
  fuelUsedL: number;
  fuelCoveragePct: number;
  durationMs: number;
  movingTimeMs: number;
  maxSpeedKmh: number;
  validFuelSamples: number;
  lastTimestampMs: number | null;
  telemetrySamples: TripTelemetrySample[];
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
  private lastAbsoluteDistanceKm: number;
  private readonly fuelIntegrator = new FuelRateIntegrator();
  private lastTimestampMs: number | null = null;
  private distanceKm = 0;
  private distanceObdKm = 0;
  private distanceGpsKm = 0;
  private readonly distanceSources = new Set<'OBD' | 'GPS'>();
  private lastObdSpeedKmh: number | null = null;
  private lastObdSpeedTimestampMs: number | null = null;
  private fuelCoveredMs = 0;
  private lastFuelRateTimestampMs: number | null = null;
  private durationMs = 0;
  private movingTimeMs = 0;
  private maxSpeedKmh = 0;
  private fuelRateSources = new Set<FuelRateSource>();
  private telemetrySamples: TripTelemetrySample[] = [];
  private lastTelemetrySampleAtMs: number | null = null;

  constructor(startedAtMs = Date.now(), initialDistanceKm = 0) {
    this.startedAtMs = startedAtMs;
    this.lastAbsoluteDistanceKm = toFiniteNonNegative(initialDistanceKm);
  }

  addSample(sample: RealTripSample): RealTripRecorderState {
    const timestampMs = sample.timestampMs;

    // Older/duplicate samples must not rewind the integration clock, distance,
    // or max speed. A sample without a real timestamp is not usable telemetry.
    if (
      !Number.isFinite(timestampMs) ||
      (this.lastTimestampMs !== null && timestampMs <= this.lastTimestampMs)
    ) {
      return this.getState();
    }

    const hasValidAbsoluteDistance = Number.isFinite(sample.distanceKm) && sample.distanceKm >= 0;
    const absoluteDistanceKm = hasValidAbsoluteDistance ? sample.distanceKm : null;
    const speedKmh = toFiniteNonNegative(sample.speedKmh);

    // Preserve independent GPS and OBD distance totals. GPS resets rebase the
    // absolute counter; they are not negative distance and cannot inflate the next delta.
    let gpsDeltaKm: number | null = null;
    if (absoluteDistanceKm !== null) {
      if (absoluteDistanceKm >= this.lastAbsoluteDistanceKm) {
        gpsDeltaKm = absoluteDistanceKm - this.lastAbsoluteDistanceKm;
        this.distanceGpsKm += gpsDeltaKm;
      }
      this.lastAbsoluteDistanceKm = absoluteDistanceKm;
    }

    const obdSpeed = sample.obdSpeedKmh != null && Number.isFinite(sample.obdSpeedKmh)
      && sample.obdSpeedKmh >= 0 && sample.obdSpeedKmh <= 220
      ? sample.obdSpeedKmh : null;
    let obdDeltaKm: number | null = null;
    if (obdSpeed != null && this.lastObdSpeedKmh != null && this.lastObdSpeedTimestampMs != null) {
      const obdDtMs = timestampMs - this.lastObdSpeedTimestampMs;
      if (obdDtMs > 0 && obdDtMs <= 5000) {
        obdDeltaKm = ((this.lastObdSpeedKmh + obdSpeed) / 2) * (obdDtMs / 3_600_000);
        this.distanceObdKm += obdDeltaKm;
      }
    }
    this.lastObdSpeedKmh = obdSpeed;
    this.lastObdSpeedTimestampMs = obdSpeed == null ? null : timestampMs;

    // Fresh OBD speed is primary, including a real zero-speed interval. GPS is
    // fallback only when two fresh OBD samples do not bound this interval.
    const chosenDeltaKm = obdDeltaKm !== null ? obdDeltaKm : gpsDeltaKm;
    if (chosenDeltaKm !== null && Number.isFinite(chosenDeltaKm) && chosenDeltaKm >= 0) {
      this.distanceKm = Number((this.distanceKm + chosenDeltaKm).toFixed(3));
      this.distanceSources.add(obdDeltaKm !== null ? 'OBD' : 'GPS');
    }
    this.maxSpeedKmh = Number(Math.max(this.maxSpeedKmh, speedKmh).toFixed(1));

    if (
      this.lastTimestampMs !== null &&
      timestampMs - this.lastTimestampMs <= 30_000
    ) {
      const deltaMs = timestampMs - this.lastTimestampMs;
      this.durationMs += deltaMs;
      if (speedKmh >= 3) this.movingTimeMs += deltaMs;
    }
    this.lastTimestampMs = timestampMs;

    // Sparse chart points keep the trip index compact on long journeys.
    if (this.lastTelemetrySampleAtMs === null || timestampMs - this.lastTelemetrySampleAtMs >= 10_000) {
      const optionalValue = (value: number | null | undefined): number | null =>
        value != null && Number.isFinite(value) ? value : null;
      this.telemetrySamples.push({
        timestamp: new Date(timestampMs).toISOString(),
        speedKmh,
        rpm: optionalValue(sample.rpm),
        coolantTempC: optionalValue(sample.coolantTempC),
      });
      this.telemetrySamples = this.telemetrySamples.slice(-720);
      this.lastTelemetrySampleAtMs = timestampMs;
    }

    if (
      sample.fuelRateLph !== null &&
      Number.isFinite(sample.fuelRateLph) &&
      sample.fuelRateLph >= 0
    ) {
      if (this.lastFuelRateTimestampMs !== null) {
        const fuelDtMs = timestampMs - this.lastFuelRateTimestampMs;
        if (fuelDtMs > 0 && fuelDtMs <= 30_000) this.fuelCoveredMs += fuelDtMs;
      }
      this.fuelIntegrator.addSample(sample.fuelRateLph, timestampMs);
      this.lastFuelRateTimestampMs = timestampMs;
      if (sample.fuelRateSource) this.fuelRateSources.add(sample.fuelRateSource);
    } else {
      // Never interpolate fuel across a missing/stale sample.
      this.fuelIntegrator.breakContinuity();
      this.lastFuelRateTimestampMs = null;
    }

    return this.getState();
  }

  getState(): RealTripRecorderState {
    const fuelState = this.fuelIntegrator.getState();
    const distanceSource = this.distanceSources.size > 1
      ? 'MIXED'
      : this.distanceSources.size === 1 ? [...this.distanceSources][0] : 'UNAVAILABLE';
    const fuelCoveragePct = this.durationMs > 0
      ? Math.min(100, (this.fuelCoveredMs / this.durationMs) * 100)
      : 0;
    return {
      startedAtMs: this.startedAtMs,
      distanceKm: this.distanceKm,
      distanceObdKm: this.distanceObdKm,
      distanceGpsKm: this.distanceGpsKm,
      distanceSource,
      fuelUsedL: fuelState.fuelUsedL,
      fuelCoveragePct,
      durationMs: this.durationMs,
      movingTimeMs: this.movingTimeMs,
      maxSpeedKmh: this.maxSpeedKmh,
      validFuelSamples: fuelState.validSamples,
      lastTimestampMs: this.lastTimestampMs,
      telemetrySamples: this.telemetrySamples.map((sample) => ({ ...sample })),
    };
  }

  buildDriveCycle(finishedAtMs = Date.now()): DriveCycle | null {
    const state = this.getState();
    // Persist a real trip when distance is valid even if fuel telemetry is
    // missing/too small. In that case consumption is explicitly unavailable;
    // never discard the trip or publish an unstable km/L value.
    if (state.distanceKm < 0.1 || state.durationMs < 60_000) return null;

    const fuelDataValid = state.fuelUsedL >= MIN_TRIP_FUEL_L && state.validFuelSamples >= 2 && state.fuelCoveragePct >= 70;
    const avgFuelConsumptionKml = fuelDataValid ? state.distanceKm / state.fuelUsedL : 0;
    const tripQuality = !fuelDataValid ? 'DADOS_INSUFICIENTES'
      : avgFuelConsumptionKml < 2 || avgFuelConsumptionKml > 40 ? 'SUSPEITA' : 'OK';
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
      fuelLiters: fuelDataValid ? Number(state.fuelUsedL.toFixed(4)) : null,
      fuelCoveragePct: Number(state.fuelCoveragePct.toFixed(1)),
      fuelMethod: this.fuelRateSources.size === 1
        ? [...this.fuelRateSources][0]
        : this.fuelRateSources.size > 1 ? 'MIXED' : 'UNAVAILABLE',
      fuelUncertaintyPct: this.fuelRateSources.size === 0 ? null
        : this.fuelRateSources.size > 1 ? 40
        : this.fuelRateSources.has('MEASURED_015E') ? 5
        : this.fuelRateSources.has('ESTIMATED_MAF') ? 30 : 50,
      distObdKm: Number(state.distanceObdKm.toFixed(3)),
      distGpsKm: Number(state.distanceGpsKm.toFixed(3)),
      distFinalKm: Number(state.distanceKm.toFixed(3)),
      distSource: state.distanceSource,
      totalTimeHms: formatDuration(state.durationMs),
      drivingTimeHms: formatDuration(state.movingTimeMs),
      standingTimeHms: formatDuration(Math.max(0, state.durationMs - state.movingTimeMs)),
      avgDrivingSpeedKmh: Number(avgDrivingSpeedKmh.toFixed(3)),
      avgFuelConsumptionKml: Number(avgFuelConsumptionKml.toFixed(3)),
      maxSpeedKmh: Number(state.maxSpeedKmh.toFixed(1)),
      telemetrySamples: state.telemetrySamples,
      fuelDataValid,
      tripQuality,
      source: 'REAL_OBD',
      fuelRateSource: this.fuelRateSources.size === 1
        ? [...this.fuelRateSources][0]
        : this.fuelRateSources.size > 1 ? 'MIXED' : undefined,
      importedAt: new Date().toISOString(),
    };
  }
}