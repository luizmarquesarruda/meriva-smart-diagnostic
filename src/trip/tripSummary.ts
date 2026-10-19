import type { TripTelemetrySample } from '../data/driveCycles';

export interface TelemetryMetricSummary {
  count: number;
  min: number;
  max: number;
  average: number;
}

export interface TripTelemetrySummary {
  sampleCount: number;
  speed: TelemetryMetricSummary | null;
  rpm: TelemetryMetricSummary | null;
  coolant: TelemetryMetricSummary | null;
}

function summarize(values: Array<number | null | undefined>, allowNegative = false): TelemetryMetricSummary | null {
  const valid = values.filter((value): value is number =>
    value != null && Number.isFinite(value) && (allowNegative || value >= 0),
  );
  if (!valid.length) return null;
  return {
    count: valid.length,
    min: Math.min(...valid),
    max: Math.max(...valid),
    average: valid.reduce((sum, value) => sum + value, 0) / valid.length,
  };
}

/**
 * Computes reproducible per-trip min/average/max only from saved, numeric
 * telemetry samples. Missing values remain absent; they are never coerced to 0.
 */
export function summarizeTripTelemetry(samples: TripTelemetrySample[] | null | undefined): TripTelemetrySummary {
  const data = samples ?? [];
  return {
    sampleCount: data.length,
    speed: summarize(data.map((item) => item.speedKmh)),
    rpm: summarize(data.map((item) => item.rpm)),
    coolant: summarize(data.map((item) => item.coolantTempC), true),
  };
}
