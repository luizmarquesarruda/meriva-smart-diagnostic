export const AUTONOMY_BUFFER_CAPACITY = 10;
export const AUTONOMY_BUFFER_MIN_INTERVALS = 10;
export const AUTONOMY_BUFFER_MAX_INTERVAL_MS = 10_000;
export const AUTONOMY_BUFFER_STALE_AFTER_MS = 30_000;

const MIN_MOVING_SPEED_KMH = 5;
const MAX_SPEED_KMH = 220;
const MAX_FUEL_RATE_LPH = 500;
const MIN_ROLLING_DISTANCE_KM = 0.1;
const MIN_ROLLING_FUEL_L = 0.05;

interface FuelLevelReading { percent: number; timestampMs: number; }
interface FuelFlowReading { timestampMs: number; speedKmh: number; fuelRateLph: number; }
interface FuelFlowInterval { timestampMs: number; distanceKm: number; fuelUsedL: number; }

export interface AutonomyBufferSnapshot {
  fuelLevelPercent: number | null;
  fuelLevelSampleCount: number;
  fuelLevelBufferReady: boolean;
  rollingConsumptionKml: number | null;
  rollingConsumptionSampleCount: number;
  rollingConsumptionBufferReady: boolean;
}

/**
 * Buffer móvel de autonomia alimentado apenas por leituras reais validadas.
 * Nível usa mediana contra picos; consumo usa distância/combustível integrados
 * nas dez últimas janelas de velocidade e fluxo recém-obtido.
 */
export class AutonomyBuffer {
  private fuelLevels: FuelLevelReading[] = [];
  private previousFlowReading: FuelFlowReading | null = null;
  private flowIntervals: FuelFlowInterval[] = [];

  reset(): void {
    this.fuelLevels = [];
    this.previousFlowReading = null;
    this.flowIntervals = [];
  }

  addFuelLevelSample(percent: number, timestampMs = Date.now()): boolean {
    if (!Number.isFinite(percent) || percent < 0 || percent > 100 ||
        !Number.isFinite(timestampMs) || timestampMs <= 0) return false;
    const last = this.fuelLevels[this.fuelLevels.length - 1];
    if (last && timestampMs <= last.timestampMs) return false;
    if (last && timestampMs - last.timestampMs > AUTONOMY_BUFFER_STALE_AFTER_MS) {
      this.fuelLevels = [];
    }
    this.fuelLevels.push({ percent, timestampMs });
    if (this.fuelLevels.length > AUTONOMY_BUFFER_CAPACITY) {
      this.fuelLevels.splice(0, this.fuelLevels.length - AUTONOMY_BUFFER_CAPACITY);
    }
    return true;
  }

  /** Feed only a fresh PID 015E value or freshly calculated MAF/MAP estimate. */
  addFuelFlowSample(sample: { timestampMs: number; speedKmh: number; fuelRateLph: number }): void {
    const { timestampMs, speedKmh, fuelRateLph } = sample;
    if (!Number.isFinite(timestampMs) || timestampMs <= 0 ||
        !Number.isFinite(speedKmh) || speedKmh < 0 || speedKmh > MAX_SPEED_KMH ||
        !Number.isFinite(fuelRateLph) || fuelRateLph <= 0 || fuelRateLph > MAX_FUEL_RATE_LPH) {
      this.previousFlowReading = null;
      return;
    }
    const current: FuelFlowReading = { timestampMs, speedKmh, fuelRateLph };
    const previous = this.previousFlowReading;
    if (previous) {
      const elapsedMs = timestampMs - previous.timestampMs;
      if (elapsedMs <= 0) return;
      if (elapsedMs <= AUTONOMY_BUFFER_MAX_INTERVAL_MS &&
          previous.speedKmh >= MIN_MOVING_SPEED_KMH &&
          current.speedKmh >= MIN_MOVING_SPEED_KMH) {
        const averageSpeedKmh = (previous.speedKmh + current.speedKmh) / 2;
        const averageFuelRateLph = (previous.fuelRateLph + current.fuelRateLph) / 2;
        const distanceKm = averageSpeedKmh * elapsedMs / 3_600_000;
        const fuelUsedL = averageFuelRateLph * elapsedMs / 3_600_000;
        if (Number.isFinite(distanceKm) && distanceKm > 0 &&
            Number.isFinite(fuelUsedL) && fuelUsedL > 0) {
          this.flowIntervals.push({ timestampMs, distanceKm, fuelUsedL });
          if (this.flowIntervals.length > AUTONOMY_BUFFER_CAPACITY) {
            this.flowIntervals.splice(0, this.flowIntervals.length - AUTONOMY_BUFFER_CAPACITY);
          }
        }
      }
    }
    this.previousFlowReading = current;
  }

  getFuelLevelPercent(nowMs = Date.now()): number | null {
    const last = this.fuelLevels[this.fuelLevels.length - 1];
    if (!last || !this.isFresh(last.timestampMs, nowMs)) return null;
    const sorted = this.fuelLevels.map((sample) => sample.percent).sort((a, b) => a - b);
    const middle = Math.floor(sorted.length / 2);
    const median = sorted.length % 2 === 0
      ? (sorted[middle - 1] + sorted[middle]) / 2
      : sorted[middle];
    return Number(median.toFixed(2));
  }

  getFuelLevelSampleCount(nowMs = Date.now()): number {
    return this.getFuelLevelPercent(nowMs) == null ? 0 : this.fuelLevels.length;
  }

  getRollingConsumptionKml(nowMs = Date.now()): number | null {
    const last = this.flowIntervals[this.flowIntervals.length - 1];
    if (!last || !this.isFresh(last.timestampMs, nowMs) ||
        this.flowIntervals.length < AUTONOMY_BUFFER_MIN_INTERVALS) return null;
    const distanceKm = this.flowIntervals.reduce((sum, item) => sum + item.distanceKm, 0);
    const fuelUsedL = this.flowIntervals.reduce((sum, item) => sum + item.fuelUsedL, 0);
    if (!Number.isFinite(distanceKm) || distanceKm < MIN_ROLLING_DISTANCE_KM ||
        !Number.isFinite(fuelUsedL) || fuelUsedL < MIN_ROLLING_FUEL_L) return null;
    const consumptionKml = distanceKm / fuelUsedL;
    return Number.isFinite(consumptionKml) && consumptionKml > 0
      ? Number(consumptionKml.toFixed(3))
      : null;
  }

  getRollingConsumptionSampleCount(nowMs = Date.now()): number {
    return this.getRollingConsumptionKml(nowMs) == null ? 0 : this.flowIntervals.length;
  }

  getSnapshot(nowMs = Date.now()): AutonomyBufferSnapshot {
    const fuelLevelPercent = this.getFuelLevelPercent(nowMs);
    const rollingConsumptionKml = this.getRollingConsumptionKml(nowMs);
    const fuelLevelSampleCount = this.getFuelLevelSampleCount(nowMs);
    const rollingConsumptionSampleCount = this.getRollingConsumptionSampleCount(nowMs);
    return {
      fuelLevelPercent,
      fuelLevelSampleCount,
      fuelLevelBufferReady: fuelLevelSampleCount >= AUTONOMY_BUFFER_CAPACITY,
      rollingConsumptionKml,
      rollingConsumptionSampleCount,
      rollingConsumptionBufferReady: rollingConsumptionSampleCount >= AUTONOMY_BUFFER_MIN_INTERVALS,
    };
  }

  private isFresh(timestampMs: number, nowMs: number): boolean {
    const ageMs = nowMs - timestampMs;
    return Number.isFinite(nowMs) && ageMs >= 0 && ageMs <= AUTONOMY_BUFFER_STALE_AFTER_MS;
  }
}
