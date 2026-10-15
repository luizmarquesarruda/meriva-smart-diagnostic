// MERIVA SMART DIAGNOSTIC — Validação e recuperação de envelope (módulo puro)
// Arquivo para copiar em: <repo>/src/meriva/autosaveValidation.ts
//
// Sem dependências nativas — testável fora do runtime do Expo.

import type { AutoSaveEnvelope } from './autosaveTypes';
import type { MerivaPersistedState } from './autosaveState';
import { createEmptyMerivaState } from './autosaveState';
import type { ContextualStatistics, MerivaLearningProfile } from '../database/learningProfile';
import type { SampleStatistics, VehicleCondition } from '../types/sourceTypes';

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function finiteNonNegative(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : fallback;
}

function timestampOrNow(value: unknown, fallback: string): string {
  return typeof value === 'string' && Number.isFinite(Date.parse(value)) ? value : fallback;
}

const VALID_VEHICLE_CONDITIONS = new Set<VehicleCondition>([
  'IDLE_COLD', 'IDLE_WARM', 'ACCELERATION', 'CRUISE', 'DECELERATION', 'UNKNOWN',
]);

export function isValidEnvelope(value: unknown): value is AutoSaveEnvelope<MerivaPersistedState> {
  if (typeof value !== 'object' || value === null) return false;
  const env = value as Partial<AutoSaveEnvelope<MerivaPersistedState>>;
  return (
    typeof env.schemaVersion === 'number' &&
    typeof env.savedAt === 'string' &&
    typeof env.dataType === 'string' &&
    typeof env.source === 'string' &&
    typeof env.payload === 'object' &&
    env.payload !== null
  );
}

export function validatePayload(payload: MerivaPersistedState): boolean {
  return (
    typeof payload === 'object' &&
    payload !== null &&
    'vehicle' in payload &&
    'obd' in payload &&
    Array.isArray(payload.lastReadings) &&
    Array.isArray(payload.dtcs) &&
    Array.isArray(payload.driveCycles)
  );
}

/** Preenche campos ausentes com valores padrão — tolera schema parcial. */
export function hydrateState(payload: MerivaPersistedState): MerivaPersistedState {
  const defaults = createEmptyMerivaState();
  const hydrated = {
    ...defaults,
    ...payload,
    metadata: { ...defaults.metadata, ...(payload.metadata ?? {}) },
  };

  // Validate provenance at hydration time. Old/corrupt snapshots must not
  // promote imported readings to live evidence simply because they are present.
  hydrated.lastReadings = (Array.isArray(payload.lastReadings) ? payload.lastReadings : [])
    .filter((reading) => {
      if (!reading || typeof reading !== 'object') return false;
      const item = reading as unknown as Record<string, unknown>;
      return (
        typeof item.pid === 'string' && item.pid.trim().length > 0 &&
        typeof item.name === 'string' &&
        typeof item.unit === 'string' &&
        typeof item.status === 'string' &&
        typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)) &&
        (item.value === null || (typeof item.value === 'number' && Number.isFinite(item.value))) &&
        (item.source === 'REAL' || item.source === 'SIMULACAO')
      );
    });

  // Discard malformed DTC rows before UI/diagnostic code accesses .code or .status.
  const validDtcStatuses = new Set(['CONFIRMED', 'PENDING', 'PERMANENT', 'INACTIVE', 'HISTORICAL', 'CURRENT', 'UNKNOWN']);
  const validDtcSources = new Set(['REAL_OBD', 'CARSCANNER_BASELINE', 'USER_REAL_OBSERVATION', 'SIMULACAO', 'IMPORTADO']);
  hydrated.dtcs = (Array.isArray(payload.dtcs) ? payload.dtcs : [])
    .filter((dtc) => {
      if (!dtc || typeof dtc !== 'object') return false;
      const item = dtc as unknown as Record<string, unknown>;
      return (
        typeof item.code === 'string' && /^[PCBU][0-9A-F]{4}$/i.test(item.code) &&
        typeof item.status === 'string' && validDtcStatuses.has(item.status.toUpperCase()) &&
        typeof item.source === 'string' && validDtcSources.has(item.source)
      );
    });

  // Nunca reintroduzir viagens importadas ou aprendizado contaminado de snapshots antigos.
  hydrated.driveCycles = (Array.isArray(payload.driveCycles) ? payload.driveCycles : [])
    .filter((cycle) => cycle && cycle.source === 'REAL_OBD');
  const rawLearning = payload.learning as unknown;
  if (rawLearning && typeof rawLearning === 'object' && !Array.isArray(rawLearning)) {
    const raw = asRecord(rawLearning);
    const now = new Date().toISOString();
    const rawThresholds = asRecord(raw.confidenceThresholds);
    const lowThreshold = finiteNonNegative(rawThresholds.low, 10) || 10;
    const mediumThreshold = Math.max(lowThreshold, finiteNonNegative(rawThresholds.medium, 50) || 50);
    const goodThreshold = Math.max(mediumThreshold, finiteNonNegative(rawThresholds.good, 200) || 200);
    const thresholds = {
      low: lowThreshold,
      medium: mediumThreshold,
      good: goodThreshold,
      high: Math.max(goodThreshold, finiteNonNegative(rawThresholds.high, 500) || 500),
    };
    const rawCounts = asRecord(raw.globalSampleCounts);
    const realSamples = Math.floor(finiteNonNegative(rawCounts.realSamples));

    const cleanStats = (input: unknown): Record<string, SampleStatistics> => {
      const clean: Record<string, SampleStatistics> = {};
      for (const [name, rawStat] of Object.entries(asRecord(input))) {
        if (!rawStat || typeof rawStat !== 'object' || Array.isArray(rawStat)) continue;
        const stat = rawStat as Record<string, unknown>;
        const seedSamples = finiteNonNegative(stat.seedSamples);
        const statRealSamples = Math.floor(finiteNonNegative(stat.realSamples));
        const sources = Array.isArray(stat.source) ? stat.source : [];
        // Mixed statistics cannot be separated safely; keep only proven REAL_OBD.
        if (seedSamples > 0 || sources.includes('CARSCANNER_BASELINE')) continue;
        if (statRealSamples <= 0 || !sources.includes('REAL_OBD')) continue;

        const mean = stat.mean;
        const median = stat.median;
        const min = stat.min;
        const max = stat.max;
        const stddev = stat.stddev;
        if (
          ![mean, median, min, max, stddev].every((value) => typeof value === 'number' && Number.isFinite(value)) ||
          (min as number) > (max as number) ||
          (stddev as number) < 0
        ) continue;
        const confidenceValue = ['LOW', 'MEDIUM', 'GOOD', 'HIGH'].includes(String(stat.confidence))
          ? stat.confidence as SampleStatistics['confidence']
          : 'LOW';
        const medianWindow = Array.isArray(stat.medianWindow)
          ? stat.medianWindow.filter((value): value is number => typeof value === 'number' && Number.isFinite(value)).slice(-101)
          : undefined;
        clean[name] = {
          mean: mean as number,
          median: median as number,
          min: min as number,
          max: max as number,
          stddev: stddev as number,
          samples: statRealSamples,
          realSamples: statRealSamples,
          seedSamples: 0,
          confidence: confidenceValue,
          lastUpdate: timestampOrNow(stat.lastUpdate, now),
          source: ['REAL_OBD'],
          ...(medianWindow ? { medianWindow } : {}),
        };
      }
      return clean;
    };

    const contextualData: ContextualStatistics[] = (Array.isArray(raw.contextualData) ? raw.contextualData : [])
      .filter((value): value is Record<string, unknown> =>
        typeof value === 'object' && value !== null && !Array.isArray(value))
      .map((context) => {
        const condition = context.condition;
        const statistics = cleanStats(context.statistics);
        return {
          condition: VALID_VEHICLE_CONDITIONS.has(condition as VehicleCondition)
            ? condition as VehicleCondition
            : 'UNKNOWN',
          statistics,
          lastUpdate: timestampOrNow(context.lastUpdate, now),
          sampleCount: Object.values(statistics).reduce((sum, stat) => sum + stat.realSamples, 0),
        };
      })
      .filter((context) => Object.keys(context.statistics).length > 0);

    const overallStatistics = cleanStats(raw.overallStatistics);
    // Global count is a distinct sample counter, not the sum of per-PID counters.
    // Inferring it from that sum can overstate confidence by counting the same
    // scan multiple times; missing/corrupt count data therefore falls back to 0.
    const realCount = realSamples;
    const rawContamination = asRecord(raw.dataContamination);
    hydrated.learning = {
      vehicleId: typeof raw.vehicleId === 'string' && raw.vehicleId.trim() ? raw.vehicleId : 'MERIVA_MAXX',
      profileCreated: timestampOrNow(raw.profileCreated, now),
      lastUpdated: timestampOrNow(raw.lastUpdated, now),
      seedVersion: 'NONE',
      seedImportDate: '',
      learningStatus: realCount >= thresholds.high
        ? 'CONFIDENT'
        : realCount >= thresholds.low
          ? 'LEARNING_ACTIVE'
          : 'COLD_START',
      confidenceThresholds: thresholds,
      contextualData,
      overallStatistics,
      globalSampleCounts: {
        seedSamples: 0,
        realSamples: realCount,
        totalSamples: realCount,
      },
      source: 'REAL_ONLY',
      seedWeight: 0,
      dataContamination: {
        simulationDetected: Math.floor(finiteNonNegative(rawContamination.simulationDetected)),
        simulationFiltered: Math.floor(finiteNonNegative(rawContamination.simulationFiltered)),
      },
    } as MerivaLearningProfile;
  } else {
    hydrated.learning = null;
  }
  return hydrated;
}

/**
 * Regra central de contaminação: SOMENTE dado real com resposta válida
 * (status RESPONDEU e valor numérico) pode alimentar aprendizado/banco.
 * Simulação e seed (qualquer outra fonte) nunca passam.
 */
export function shouldFeedLearning(
  source: 'REAL' | 'SIMULACAO',
  status: string,
  value: number | null,
): boolean {
  return source === 'REAL' && status === 'RESPONDEU' && typeof value === 'number' && Number.isFinite(value);
}