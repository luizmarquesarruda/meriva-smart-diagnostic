import type { LastPidReading } from '../meriva/autosaveState';
import type { VehicleCondition } from '../types/sourceTypes';
import type { PidQueryResult } from './elm327';
import { emitAppEvent } from '../state/appEventBus';

export interface LiveTelemetryPoint {
  pid: string;
  name: string;
  value: number;
  unit: string;
  timestamp: string;
  source: 'REAL_OBD';
}

export interface PidTrend {
  pid: string;
  current: number;
  min: number;
  max: number;
  average: number;
  delta: number;
  samples: number;
  firstTimestamp: string;
  lastTimestamp: string;
  ageSeconds: number;
  values: number[];
}

export interface VehicleConditionSnapshot {
  condition: VehicleCondition;
  reason: string;
}

const MAX_POINTS_PER_PID = 120;
const STALE_AFTER_MS = 10_000;
const series = new Map<string, LiveTelemetryPoint[]>();
const latest = new Map<string, LiveTelemetryPoint>();

function normalizePid(pid: string): string {
  return pid.replace(/\s/g, '').toUpperCase();
}

function finiteValue(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function store(point: LiveTelemetryPoint): void {
  const pid = normalizePid(point.pid);
  const current = series.get(pid) ?? [];
  const next = [...current, point].slice(-MAX_POINTS_PER_PID);
  series.set(pid, next);
  latest.set(pid, point);
  emitAppEvent('OBD_TELEMETRY_UPDATED', { pid });
}

export function resetLiveTelemetry(): void {
  series.clear();
  latest.clear();
  emitAppEvent('OBD_TELEMETRY_UPDATED');
}

export function recordLivePidReading(
  reading: Pick<LastPidReading, 'pid' | 'name' | 'value' | 'unit' | 'timestamp' | 'source'>,
): void {
  if (reading.source !== 'REAL' || !finiteValue(reading.value)) return;
  store({
    pid: normalizePid(reading.pid),
    name: reading.name,
    value: reading.value,
    unit: reading.unit,
    timestamp: reading.timestamp,
    source: 'REAL_OBD',
  });
}

export function recordLivePidQuery(result: PidQueryResult, source: 'REAL' | 'SIMULACAO' = 'REAL'): void {
  if (source !== 'REAL' || result.parsed.status !== 'RESPONDEU' || !finiteValue(result.parsed.value)) return;
  recordLivePidReading({
    pid: result.parsed.pid,
    name: result.parsed.name,
    value: result.parsed.value,
    unit: result.parsed.unit,
    timestamp: new Date().toISOString(),
    source: 'REAL',
  });
}

export function getLiveSeries(pid: string): LiveTelemetryPoint[] {
  return [...(series.get(normalizePid(pid)) ?? [])];
}

export function getLivePidCurrent(pid: string): number | null {
  const trend = getLivePidTrend(pid);
  if (!trend || trend.ageSeconds * 1000 > STALE_AFTER_MS) return null;
  return trend.current;
}

export function getLiveTelemetryWindow(timestamp: string, beforeMs = 30_000, afterMs = 30_000): LiveTelemetryPoint[] {
  const center = Date.parse(timestamp);
  if (!Number.isFinite(center)) return [];
  return Array.from(series.values()).flat().filter((point) => {
    const time = Date.parse(point.timestamp);
    return Number.isFinite(time) && time >= center - beforeMs && time <= center + afterMs;
  }).sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp));
}

export function getLivePidTrend(pid: string): PidTrend | null {
  const values = getLiveSeries(pid);
  if (!values.length) return null;

  const numeric = values.map((item) => item.value);
  const current = numeric[numeric.length - 1];
  const previous = numeric.length > 1 ? numeric[numeric.length - 2] : current;
  const min = Math.min(...numeric);
  const max = Math.max(...numeric);
  const average = numeric.reduce((sum, value) => sum + value, 0) / numeric.length;
  const lastTimestamp = values[values.length - 1].timestamp;
  const parsedTimestamp = Date.parse(lastTimestamp);
  const ageSeconds = Number.isFinite(parsedTimestamp)
    ? Math.max(0, (Date.now() - parsedTimestamp) / 1000)
    : 0;

  return {
    pid: normalizePid(pid),
    current,
    min,
    max,
    average,
    delta: current - previous,
    samples: numeric.length,
    firstTimestamp: values[0].timestamp,
    lastTimestamp,
    ageSeconds,
    values: numeric.slice(-30),
  };
}

function valueOf(values: Map<string, number>, pid: string): number | null {
  const value = values.get(normalizePid(pid));
  return finiteValue(value) ? value : null;
}

export function classifyVehicleCondition(
  values: Map<string, number>,
  previousSpeedKmh: number | null = null,
): VehicleCondition {
  const speed = valueOf(values, '010D');
  const rpm = valueOf(values, '010C');
  const coolant = valueOf(values, '0105');
  const throttle = valueOf(values, '0111');

  if (speed != null && previousSpeedKmh != null) {
    const delta = speed - previousSpeedKmh;
    if (delta >= 4) return 'ACCELERATION';
    if (delta <= -4) return 'DECELERATION';
  }

  if (speed != null && speed <= 2 && rpm != null && rpm >= 450 && rpm <= 1400) {
    if (coolant != null && coolant < 70) return 'IDLE_COLD';
    if (coolant != null && coolant >= 70) return 'IDLE_WARM';
  }

  if (speed != null && speed >= 30) {
    if (previousSpeedKmh == null || Math.abs(speed - previousSpeedKmh) <= 2) return 'CRUISE';
  }

  if (throttle != null && throttle >= 25 && speed != null && speed > 2) return 'ACCELERATION';
  if (speed != null && speed <= 2 && coolant != null && coolant < 70) return 'IDLE_COLD';

  return 'UNKNOWN';
}

export function getVehicleConditionSnapshot(): VehicleConditionSnapshot {
  const now = Date.now();
  const values = new Map<string, number>();
  for (const [pid, point] of latest.entries()) {
    const timestamp = Date.parse(point.timestamp);
    if (Number.isFinite(timestamp) && now - timestamp <= STALE_AFTER_MS) {
      values.set(pid, point.value);
    }
  }

  const speedSeries = (series.get('010D') ?? []).filter((point) => {
    const timestamp = Date.parse(point.timestamp);
    return Number.isFinite(timestamp) && now - timestamp <= STALE_AFTER_MS;
  });
  const previousSpeed = speedSeries.length > 1
    ? speedSeries[speedSeries.length - 2].value
    : null;

  const condition = classifyVehicleCondition(values, previousSpeed);
  const speed = valueOf(values, '010D');
  const rpm = valueOf(values, '010C');
  const coolant = valueOf(values, '0105');

  const reason = condition === 'IDLE_WARM'
    ? 'Velocidade praticamente zero, RPM compatível com marcha lenta e motor aquecido.'
    : condition === 'IDLE_COLD'
      ? 'Veículo parado com temperatura ainda abaixo da faixa de aquecimento.'
      : condition === 'ACCELERATION'
        ? 'A velocidade ou a posição da borboleta indicam aumento de carga.'
        : condition === 'DECELERATION'
          ? 'A velocidade apresenta queda significativa entre amostras.'
          : condition === 'CRUISE'
            ? 'Velocidade estabilizada em faixa de rodagem.'
            : speed == null && rpm == null && coolant == null
              ? 'Dados reais insuficientes para classificar o contexto.'
              : 'Dados reais ainda não formam um contexto operacional estável.';

  return { condition, reason };
}

export function formatSparkline(values: number[]): string {
  if (!values.length) return '—';
  const bars = '▁▂▃▄▅▆▇█';
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min;
  return values.map((value) => {
    const index = range <= 0 ? 0 : Math.min(
      bars.length - 1,
      Math.max(0, Math.round(((value - min) / range) * (bars.length - 1))),
    );
    return bars[index];
  }).join('');
}

export function getLiveTelemetryPidCount(): number {
  return series.size;
}

export const LIVE_TELEMETRY_MAX_POINTS = MAX_POINTS_PER_PID;
export const LIVE_TELEMETRY_STALE_AFTER_MS = STALE_AFTER_MS;
