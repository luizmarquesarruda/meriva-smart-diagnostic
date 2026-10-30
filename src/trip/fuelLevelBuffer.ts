export const FUEL_LEVEL_BUFFER_CAPACITY = 10;
export const FUEL_LEVEL_BUFFER_MAX_AGE_MS = 60_000;
export const FUEL_LEVEL_BUFFER_SAMPLE_RETENTION_MS = 120_000;

export interface FuelLevelBufferEstimate {
  percent: number;
  latestReadAtMs: number;
  sampleCount: number;
}

/**
 * Volatile rolling window for real PID 012F observations from one ECU session.
 * It is intentionally not persisted and must be reset when the ECU session changes.
 */
export class FuelLevelBuffer {
  private samples: Array<{ percent: number; timestampMs: number }> = [];

  private prune(nowMs: number): void {
    this.samples = this.samples.filter((sample) => {
      const ageMs = nowMs - sample.timestampMs;
      return ageMs >= 0 && ageMs <= FUEL_LEVEL_BUFFER_SAMPLE_RETENTION_MS;
    });
  }

  addSample(percent: number, timestampMs: number, nowMs = Date.now()): boolean {
    if (
      !Number.isFinite(percent) || percent < 0 || percent > 100 ||
      !Number.isFinite(timestampMs) || timestampMs <= 0 ||
      !Number.isFinite(nowMs) || timestampMs > nowMs ||
      nowMs - timestampMs > FUEL_LEVEL_BUFFER_SAMPLE_RETENTION_MS
    ) return false;

    this.prune(nowMs);
    const latest = this.samples[this.samples.length - 1];
    if (latest && timestampMs <= latest.timestampMs) return false;

    this.samples.push({ percent, timestampMs });
    if (this.samples.length > FUEL_LEVEL_BUFFER_CAPACITY) {
      this.samples.splice(0, this.samples.length - FUEL_LEVEL_BUFFER_CAPACITY);
    }
    return true;
  }

  getEstimate(nowMs = Date.now()): FuelLevelBufferEstimate | null {
    if (!Number.isFinite(nowMs)) return null;
    this.prune(nowMs);
    if (this.samples.length !== FUEL_LEVEL_BUFFER_CAPACITY) return null;

    const latest = this.samples[this.samples.length - 1];
    const ageMs = nowMs - latest.timestampMs;
    if (ageMs < 0 || ageMs > FUEL_LEVEL_BUFFER_MAX_AGE_MS) return null;

    const average = this.samples.reduce((sum, sample) => sum + sample.percent, 0) / this.samples.length;
    return {
      percent: Number(average.toFixed(2)),
      latestReadAtMs: latest.timestampMs,
      sampleCount: this.samples.length,
    };
  }

  getSampleCount(nowMs = Date.now()): number {
    if (!Number.isFinite(nowMs)) return 0;
    this.prune(nowMs);
    return this.samples.length;
  }

  reset(): void {
    this.samples = [];
  }
}
