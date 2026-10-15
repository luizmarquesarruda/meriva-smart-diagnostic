import type { DriveCycle } from '../data/driveCycles';
import type { FuelType } from '../database/appSettings';
import type { FuelRateSource } from './fuelConsumption';
import policy from '../knowledge/fuel_coach_policy.json';

export type FuelCoachStatus =
  | 'WAITING_FOR_ECU'
  | 'WAITING_FOR_DATA'
  | 'COLLECTING'
  | 'CONTEXT_UNSTABLE'
  | 'CALIBRATING'
  | 'GOOD'
  | 'NORMAL'
  | 'ELEVATED';

export interface FuelCoachSample {
  timestampMs: number;
  consumptionKmL: number;
  speedKmh: number;
  source: FuelRateSource;
  fuelType: FuelType;
}

export interface FuelCoachReference {
  fuelType: FuelType;
  source: FuelRateSource | null;
  averageKmL: number | null;
  sampleCount: number;
  totalDistanceKm: number;
  ready: boolean;
  progressLabel: string;
}

export interface FuelCoachInput {
  ecuConnected: boolean;
  currentKmL: number | null;
  currentTimestampMs: number | null;
  currentSpeedKmh: number | null;
  source: FuelRateSource | null;
  fuelType: FuelType;
  samples: FuelCoachSample[];
  reference: FuelCoachReference;
  nowMs?: number;
}

export interface FuelCoachEvaluation {
  status: FuelCoachStatus;
  label: string;
  advice: string;
  rollingMedianKmL: number | null;
  referenceKmL: number | null;
  differencePercent: number | null;
  windowSampleCount: number;
  referenceTripCount: number;
  referenceDistanceKm: number;
  referenceProgressLabel: string;
}

function durationHmsToMs(value: string): number {
  const match = /^(\d+):([0-5]\d):([0-5]\d)$/.exec(value);
  if (!match) return 0;
  return (Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3])) * 1000;
}

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

/** Baseline from valid, completed REAL_OBD trips with matching fuel and rate source. */
export function buildFuelCoachReference(
  cycles: DriveCycle[],
  fuelType: FuelType,
  source: FuelRateSource | null,
  targetSpeedKmh: number | null,
): FuelCoachReference {
  // A city/highway mismatch can masquerade as a driving-efficiency change.
  // Only trips with a reasonably similar whole-trip average speed are baseline candidates.
  const referenceSpeedKmh = typeof targetSpeedKmh === 'number'
    && Number.isFinite(targetSpeedKmh)
    && targetSpeedKmh >= policy.minimumStableSpeedKmh
    ? targetSpeedKmh
    : null;
  const eligible = source && referenceSpeedKmh != null
    ? cycles.filter((cycle) =>
        cycle.source === 'REAL_OBD' &&
        cycle.fuelType === fuelType &&
        cycle.fuelRateSource === source &&
        cycle.fuelDataValid !== false &&
        Number.isFinite(cycle.distanceTotalKm) && cycle.distanceTotalKm > 0 &&
        Number.isFinite(cycle.fuelUsedL) && cycle.fuelUsedL >= 0.05 &&
        Number.isFinite(cycle.avgFuelConsumptionKml) && cycle.avgFuelConsumptionKml > 0 &&
        Number.isFinite(cycle.avgDrivingSpeedKmh) && cycle.avgDrivingSpeedKmh > 0 &&
        Math.abs(cycle.avgDrivingSpeedKmh - referenceSpeedKmh) / referenceSpeedKmh <= policy.referenceSpeedDifferenceRatio &&
        durationHmsToMs(cycle.drivingTimeHms) > 0,
      )
    : [];
  const totalDistanceKm = eligible.reduce((sum, cycle) => sum + cycle.distanceTotalKm, 0);
  const totalFuelL = eligible.reduce((sum, cycle) => sum + cycle.fuelUsedL, 0);
  const candidateAverage = totalFuelL > 0 ? totalDistanceKm / totalFuelL : null;
  const ready = eligible.length >= policy.referenceMinimumTrips
    && totalDistanceKm >= policy.referenceMinimumDistanceKm
    && candidateAverage != null && Number.isFinite(candidateAverage) && candidateAverage > 0;

  return {
    fuelType,
    source,
    averageKmL: ready && candidateAverage != null ? Number(candidateAverage.toFixed(2)) : null,
    sampleCount: eligible.length,
    totalDistanceKm: Number(totalDistanceKm.toFixed(1)),
    ready,
    progressLabel: ready
      ? 'REFERÊNCIA PESSOAL • ' + eligible.length + ' VIAGENS • VEL. COMPATÍVEL'
      : 'REFERÊNCIA EM FORMAÇÃO • ' + eligible.length + '/' + policy.referenceMinimumTrips
        + ' VIAGENS • ' + totalDistanceKm.toFixed(1) + '/' + policy.referenceMinimumDistanceKm + ' KM • VEL. COMPATÍVEL',
  };
}

const LABELS: Record<FuelCoachStatus, string> = {
  WAITING_FOR_ECU: 'AGUARDANDO ECU',
  WAITING_FOR_DATA: 'AGUARDANDO LEITURA',
  COLLECTING: 'ANALISANDO CONSUMO',
  CONTEXT_UNSTABLE: 'TRECHO INSTÁVEL',
  CALIBRATING: 'CALIBRANDO REFERÊNCIA',
  GOOD: 'BOM CONSUMO',
  NORMAL: 'DENTRO DO PADRÃO',
  ELEVATED: 'CONSUMO ELEVADO',
};

const ADVICE: Record<FuelCoachStatus, string> = {
  WAITING_FOR_ECU: 'Conecte a ECU para receber dados atuais de consumo. Nenhuma classificação foi presumida.',
  WAITING_FOR_DATA: 'Aguardando taxa de combustível e velocidade válidas e recentes; sem esses dados, não há classificação confiável.',
  COLLECTING: 'Coletando amostras recentes antes de classificar. Uma leitura isolada não define a qualidade da condução.',
  CONTEXT_UNSTABLE: 'A velocidade está baixa ou varia bastante. Trânsito, relevo e carga afetam o consumo; compare em trecho mais constante, sempre com segurança.',
  CALIBRATING: 'Sua referência pessoal está em formação. São necessárias viagens reais com o mesmo combustível, método de cálculo e velocidade média semelhante.',
  GOOD: 'Rendimento móvel acima da sua referência pessoal. Mantenha aceleração suave e condução segura.',
  NORMAL: 'Rendimento próximo da sua referência. Priorize aceleração progressiva e velocidade constante quando as condições permitirem.',
  ELEVATED: 'Rendimento móvel abaixo da sua referência pessoal. Se for seguro, suavize acelerações e antecipe desacelerações; isso não indica, por si só, defeito mecânico.',
};

/** Conservative, deterministic classification: freshness + stable window + compatible personal baseline. */
export function evaluateFuelCoach(input: FuelCoachInput): FuelCoachEvaluation {
  const nowMs = input.nowMs ?? Date.now();
  const base = {
    rollingMedianKmL: null as number | null,
    referenceKmL: input.reference.ready ? input.reference.averageKmL : null,
    differencePercent: null as number | null,
    windowSampleCount: 0,
    referenceTripCount: input.reference.sampleCount,
    referenceDistanceKm: input.reference.totalDistanceKm,
    referenceProgressLabel: input.reference.progressLabel,
  };
  const result = (
    status: FuelCoachStatus,
    rollingMedianKmL: number | null = base.rollingMedianKmL,
    windowSampleCount = base.windowSampleCount,
    differencePercent: number | null = null,
  ): FuelCoachEvaluation => ({
    ...base,
    status,
    label: LABELS[status],
    advice: ADVICE[status],
    rollingMedianKmL,
    windowSampleCount,
    differencePercent,
  });

  if (!input.ecuConnected) return result('WAITING_FOR_ECU');
  if (
    input.source == null || input.currentKmL == null ||
    !Number.isFinite(input.currentKmL) || input.currentKmL <= 0 ||
    input.currentTimestampMs == null || !Number.isFinite(input.currentTimestampMs) ||
    !Number.isFinite(nowMs)
  ) return result('WAITING_FOR_DATA');

  const currentAgeMs = nowMs - input.currentTimestampMs;
  if (currentAgeMs < 0 || currentAgeMs > policy.maximumSampleAgeMs) return result('WAITING_FOR_DATA');

  const candidates = [...input.samples];
  if (!candidates.some((sample) => sample.timestampMs === input.currentTimestampMs)) {
    candidates.push({
      timestampMs: input.currentTimestampMs,
      consumptionKmL: input.currentKmL,
      speedKmh: input.currentSpeedKmh ?? 0,
      source: input.source,
      fuelType: input.fuelType,
    });
  }

  const unique = new Map<number, FuelCoachSample>();
  for (const sample of candidates) {
    const ageMs = nowMs - sample.timestampMs;
    if (
      sample.source !== input.source || sample.fuelType !== input.fuelType ||
      !Number.isFinite(sample.timestampMs) || ageMs < 0 || ageMs > policy.sampleWindowMs ||
      !Number.isFinite(sample.consumptionKmL) || sample.consumptionKmL <= 0 ||
      !Number.isFinite(sample.speedKmh) || sample.speedKmh < 0
    ) continue;
    unique.set(sample.timestampMs, sample);
  }
  const recent = [...unique.values()].sort((a, b) => a.timestampMs - b.timestampMs);
  const rollingMedianKmL = median(recent.map((sample) => sample.consumptionKmL));
  if (
    recent.length < policy.minimumSamples ||
    recent.length < 2 ||
    recent[recent.length - 1].timestampMs - recent[0].timestampMs < policy.minimumSampleSpanMs
  ) return result('COLLECTING', rollingMedianKmL, recent.length);

  const speeds = recent.map((sample) => sample.speedKmh);
  const averageSpeed = speeds.reduce((sum, speed) => sum + speed, 0) / speeds.length;
  const speedSpread = Math.max(...speeds) - Math.min(...speeds);
  const allowedSpread = Math.max(policy.maximumSpeedSpreadKmh, averageSpeed * policy.maximumSpeedSpreadRatio);
  if (
    input.currentSpeedKmh == null || !Number.isFinite(input.currentSpeedKmh) ||
    input.currentSpeedKmh < policy.minimumStableSpeedKmh ||
    averageSpeed < policy.minimumStableSpeedKmh || speedSpread > allowedSpread
  ) return result('CONTEXT_UNSTABLE', rollingMedianKmL, recent.length);

  if (
    !input.reference.ready || input.reference.averageKmL == null ||
    input.reference.source !== input.source || input.reference.fuelType !== input.fuelType
  ) return result('CALIBRATING', rollingMedianKmL, recent.length);

  if (rollingMedianKmL == null || input.reference.averageKmL <= 0) return result('WAITING_FOR_DATA', rollingMedianKmL, recent.length);
  const ratio = rollingMedianKmL / input.reference.averageKmL;
  const differencePercent = (ratio - 1) * 100;
  if (ratio >= policy.goodRatio) return result('GOOD', rollingMedianKmL, recent.length, differencePercent);
  if (ratio <= policy.elevatedRatio) return result('ELEVATED', rollingMedianKmL, recent.length, differencePercent);
  return result('NORMAL', rollingMedianKmL, recent.length, differencePercent);
}

export function getFuelRateSourceLabel(source: FuelRateSource | null): string {
  if (source === 'MEASURED_015E') return 'MEDIDO PELA ECU • PID 015E';
  if (source === 'ESTIMATED_MAF') return 'ESTIMADO • MAF';
  if (source === 'ESTIMATED_MAP') return 'ESTIMADO • MAP/IAT';
  return 'SEM FONTE DE CONSUMO VÁLIDA';
}
