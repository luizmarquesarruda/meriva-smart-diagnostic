export interface TelemetryChartSample {
  timestamp: string;
  value: number | null;
}

export interface TelemetryChartPoint {
  slot: number;
  timestamp: string;
  value: number;
  x: number;
  y: number;
}

export interface TelemetryChartSegment {
  fromSlot: number;
  toSlot: number;
  left: number;
  top: number;
  length: number;
  angleDeg: number;
}

export interface TelemetryChartModel {
  points: TelemetryChartPoint[];
  segments: TelemetryChartSegment[];
  samples: number;
  min: number;
  max: number;
  average: number;
  current: number;
  delta: number;
  firstTimestamp: string;
  lastTimestamp: string;
  ageSeconds: number;
}

interface TimedSample {
  timestamp: string;
  timestampMs: number;
  value: number | null;
}

/**
 * Build display geometry from timestamped real telemetry.
 * Missing values create a visible break: the chart never draws a line across
 * a missing response. Invalid timestamps, future samples and non-finite
 * numbers are ignored. No network or charting dependency is required.
 */
export function buildTelemetryChart(
  samples: TelemetryChartSample[],
  width: number,
  height: number,
  nowMs = Date.now(),
  maxSamples = 60,
  padding = 8,
): TelemetryChartModel | null {
  if (
    !Array.isArray(samples) ||
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    !Number.isFinite(nowMs) ||
    !Number.isFinite(maxSamples) ||
    !Number.isFinite(padding) ||
    maxSamples < 1
  ) return null;

  const safePadding = Math.max(0, padding);
  if (width <= safePadding * 2 || height <= safePadding * 2) return null;

  const chronological: TimedSample[] = samples
    .map((sample): TimedSample | null => {
      if (!sample || typeof sample.timestamp !== 'string') return null;
      const timestampMs = Date.parse(sample.timestamp);
      if (!Number.isFinite(timestampMs) || timestampMs > nowMs) return null;
      if (sample.value !== null && (typeof sample.value !== 'number' || !Number.isFinite(sample.value))) return null;
      return { timestamp: sample.timestamp, timestampMs, value: sample.value };
    })
    .filter((sample): sample is TimedSample => sample !== null)
    .sort((a, b) => a.timestampMs - b.timestampMs)
    .slice(-Math.floor(maxSamples));

  const numeric = chronological.filter(
    (sample): sample is TimedSample & { value: number } => sample.value !== null,
  );
  if (!numeric.length || !chronological.length) return null;

  const numericValues = numeric.map((sample) => sample.value);
  const min = Math.min(...numericValues);
  const max = Math.max(...numericValues);
  const current = numericValues[numericValues.length - 1];
  const firstValue = numericValues[0];
  const average = numericValues.reduce((sum, value) => sum + value, 0) / numericValues.length;
  const lastNumeric = numeric[numeric.length - 1];
  const innerWidth = width - safePadding * 2;
  const innerHeight = height - safePadding * 2;
  const range = max - min;
  const bySlot = new Map<number, TelemetryChartPoint>();

  const points: TelemetryChartPoint[] = [];
  chronological.forEach((sample, slot) => {
    if (sample.value === null) return;
    const fraction = range === 0 ? 0.5 : (max - sample.value) / range;
    const x = chronological.length === 1
      ? width / 2
      : safePadding + (slot / (chronological.length - 1)) * innerWidth;
    const y = safePadding + fraction * innerHeight;
    const point = { slot, timestamp: sample.timestamp, value: sample.value, x, y };
    points.push(point);
    bySlot.set(slot, point);
  });

  const segments: TelemetryChartSegment[] = [];
  for (let slot = 0; slot < chronological.length - 1; slot += 1) {
    const from = bySlot.get(slot);
    const to = bySlot.get(slot + 1);
    if (!from || !to) continue;
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    segments.push({
      fromSlot: from.slot,
      toSlot: to.slot,
      left: (from.x + to.x) / 2 - length / 2,
      top: (from.y + to.y) / 2 - 1,
      length,
      angleDeg: Math.atan2(dy, dx) * (180 / Math.PI),
    });
  }

  return {
    points,
    segments,
    samples: numeric.length,
    min,
    max,
    average,
    current,
    delta: current - firstValue,
    firstTimestamp: numeric[0].timestamp,
    lastTimestamp: lastNumeric.timestamp,
    ageSeconds: Math.max(0, (nowMs - lastNumeric.timestampMs) / 1000),
  };
}
