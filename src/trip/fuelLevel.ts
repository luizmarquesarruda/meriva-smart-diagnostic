export const TANK_CAPACITY_L = 56;
export const RESERVE_CAPACITY_L = 5;
export const RESERVE_THRESHOLD_PERCENT = Number(((RESERVE_CAPACITY_L / TANK_CAPACITY_L) * 100).toFixed(2));

export const MAX_FUEL_LEVEL_BUFFER_READINGS = 10;
export const MAX_FUEL_LEVEL_SAMPLE_AGE_MS = 60_000;

export interface FuelLevelBufferSnapshot {
  medianPercent: number | null;
  sampleCount: number;
  lastReadAtMs: number | null;
}

interface FuelLevelBufferReading {
  percent: number;
  timestampMs: number;
}

/** In-memory rolling window of validated, real PID 012F readings. */
export class FuelLevelBuffer {
  private readings: FuelLevelBufferReading[] = [];

  record(percent: number, timestampMs = Date.now(), nowMs = Date.now()): boolean {
    if (
      !Number.isFinite(percent) || percent < 0 || percent > 100 ||
      !Number.isFinite(timestampMs) || timestampMs <= 0 ||
      !Number.isFinite(nowMs) || nowMs <= 0 || timestampMs > nowMs
    ) return false;

    const last = this.readings[this.readings.length - 1];
    if (last && timestampMs <= last.timestampMs) return false;

    this.readings.push({ percent, timestampMs });
    if (this.readings.length > MAX_FUEL_LEVEL_BUFFER_READINGS) this.readings.shift();
    return true;
  }

  getSnapshot(nowMs = Date.now()): FuelLevelBufferSnapshot {
    const valid = this.readings.filter((reading) =>
      Number.isFinite(reading.timestampMs) &&
      reading.timestampMs > 0 &&
      reading.timestampMs <= nowMs &&
      reading.timestampMs >= nowMs - MAX_FUEL_LEVEL_SAMPLE_AGE_MS &&
      Number.isFinite(reading.percent) &&
      reading.percent >= 0 &&
      reading.percent <= 100,
    );
    if (!valid.length) return { medianPercent: null, sampleCount: 0, lastReadAtMs: null };

    const sortedPercentages = valid.map((reading) => reading.percent).sort((a, b) => a - b);
    const middle = Math.floor(sortedPercentages.length / 2);
    const medianPercent = sortedPercentages.length % 2 === 1
      ? sortedPercentages[middle]
      : (sortedPercentages[middle - 1] + sortedPercentages[middle]) / 2;
    return {
      medianPercent: Number(medianPercent.toFixed(3)),
      sampleCount: valid.length,
      lastReadAtMs: valid[valid.length - 1].timestampMs,
    };
  }

  reset(): void {
    this.readings = [];
  }
}

export function fuelLevelPercentToLiters(percent: number | null): number | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return Number((TANK_CAPACITY_L * percent / 100).toFixed(3));
}

export function isFuelReserve(percent: number | null): boolean | null {
  if (percent == null || !Number.isFinite(percent) || percent < 0 || percent > 100) return null;
  return percent <= RESERVE_THRESHOLD_PERCENT;
}

export function estimateRangeFromFuelLevel(
  percent: number | null,
  consumptionKml: number | null,
): number | null {
  const liters = fuelLevelPercentToLiters(percent);
  if (liters == null || consumptionKml == null || !Number.isFinite(consumptionKml) || consumptionKml <= 0) return null;
  return Number((liters * consumptionKml).toFixed(1));
}
