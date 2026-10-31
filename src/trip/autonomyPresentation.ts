import { estimateRangeFromFuelLevel } from './fuelLevel';
import { monotonicNowMs } from './fuelLevelBuffer';

export const FUEL_LEVEL_BUFFER_REQUIRED_SAMPLES = 10;
export const FUEL_LEVEL_BUFFER_STALE_AFTER_MS = 60_000;
export type CurrentAutonomySource = 'LIVE_012F' | 'BUFFER_012F';

export interface CurrentAutonomyEstimate {
  rangeKm: number;
  fuelLevelPercent: number;
  fuelLevelReadAtMs: number;
  source: CurrentAutonomySource;
  sampleCount: number;
}

export const CURRENT_FUEL_LEVEL_STALE_AFTER_MS = 30_000;

export function isCurrentFuelLevelSample(readAtMs: number | null, nowMs = Date.now()): boolean {
  if (readAtMs == null || !Number.isFinite(readAtMs) || !Number.isFinite(nowMs)) return false;
  const ageMs = nowMs - readAtMs;
  return ageMs >= 0 && ageMs <= CURRENT_FUEL_LEVEL_STALE_AFTER_MS;
}

export interface CurrentAutonomyInput {
  ecuConnected: boolean;
  tripConnected: boolean;
  fuelLevelSupported: boolean;
  fuelLevelPercent: number | null;
  fuelLevelReadAtMs: number | null;
  tripConsumptionKml: number | null;
  averageConsumptionKml: number;
  fuelLevelBufferPercent?: number | null;
  fuelLevelBufferReadAtMs?: number | null;
  fuelLevelBufferSampleCount?: number;
  bufferNowMs?: number;
  nowMs?: number;
}

export function getCurrentAutonomyEstimate(input: CurrentAutonomyInput): CurrentAutonomyEstimate | null {
  if (!input.ecuConnected || !input.tripConnected || !input.fuelLevelSupported) return null;
  const nowMs = input.nowMs ?? Date.now();
  const livePercent = input.fuelLevelPercent;
  const liveIsValid = livePercent != null && Number.isFinite(livePercent) &&
    livePercent >= 0 && livePercent <= 100 && isCurrentFuelLevelSample(input.fuelLevelReadAtMs, nowMs);

  let fuelLevelPercent: number;
  let fuelLevelReadAtMs: number;
  let source: CurrentAutonomySource;
  let sampleCount: number;

  if (liveIsValid) {
    fuelLevelPercent = livePercent as number;
    fuelLevelReadAtMs = input.fuelLevelReadAtMs as number;
    source = 'LIVE_012F';
    sampleCount = 1;
  } else {
    const bufferedPercent = input.fuelLevelBufferPercent;
    const bufferedReadAtMs = input.fuelLevelBufferReadAtMs;
    const bufferedCount = input.fuelLevelBufferSampleCount ?? 0;
    const bufferNowMs = input.bufferNowMs ?? monotonicNowMs();
    const ageMs = bufferedReadAtMs == null ? Number.POSITIVE_INFINITY : bufferNowMs - bufferedReadAtMs;
    if (
      bufferedPercent == null || !Number.isFinite(bufferedPercent) ||
      bufferedPercent < 0 || bufferedPercent > 100 ||
      bufferedReadAtMs == null || !Number.isFinite(bufferedReadAtMs) ||
      !Number.isFinite(bufferNowMs) ||
      ageMs < 0 || ageMs > FUEL_LEVEL_BUFFER_STALE_AFTER_MS ||
      bufferedCount !== FUEL_LEVEL_BUFFER_REQUIRED_SAMPLES
    ) return null;

    fuelLevelPercent = bufferedPercent;
    fuelLevelReadAtMs = bufferedReadAtMs;
    source = 'BUFFER_012F';
    sampleCount = bufferedCount;
  }

  const consumptionKml = input.tripConsumptionKml != null &&
    Number.isFinite(input.tripConsumptionKml) && input.tripConsumptionKml > 0
      ? input.tripConsumptionKml
      : input.averageConsumptionKml;
  const rangeKm = estimateRangeFromFuelLevel(fuelLevelPercent, consumptionKml);
  return rangeKm == null ? null : { rangeKm, fuelLevelPercent, fuelLevelReadAtMs, source, sampleCount };
}

export function getCurrentAutonomyRangeKm(input: CurrentAutonomyInput): number | null {
  return getCurrentAutonomyEstimate(input)?.rangeKm ?? null;
}
