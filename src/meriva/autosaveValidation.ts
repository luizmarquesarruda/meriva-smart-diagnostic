// MERIVA SMART DIAGNOSTIC — Validação e recuperação de envelope (módulo puro)
// Arquivo para copiar em: <repo>/src/meriva/autosaveValidation.ts
//
// Sem dependências nativas — testável fora do runtime do Expo.

import type { AutoSaveEnvelope } from './autosaveTypes';
import type { MerivaPersistedState } from './autosaveState';
import { createEmptyMerivaState } from './autosaveState';

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

  // Nunca reintroduzir viagens importadas ou aprendizado contaminado de snapshots antigos.
  hydrated.driveCycles = (Array.isArray(payload.driveCycles) ? payload.driveCycles : [])
    .filter((cycle) => cycle && cycle.source === 'REAL_OBD');
  if (hydrated.learning) {
    const cleanStats = (stats: Record<string, import('../types/sourceTypes').SampleStatistics>) => {
      const clean: Record<string, import('../types/sourceTypes').SampleStatistics> = {};
      for (const [name, stat] of Object.entries(stats ?? {})) {
        if (stat.seedSamples > 0 || (stat.source ?? []).includes('CARSCANNER_BASELINE')) continue;
        if (stat.realSamples <= 0 || !(stat.source ?? []).includes('REAL_OBD')) continue;
        clean[name] = { ...stat, samples: stat.realSamples, seedSamples: 0, source: ['REAL_OBD'] };
      }
      return clean;
    };
    hydrated.learning = {
      ...hydrated.learning,
      seedVersion: 'NONE',
      seedImportDate: '',
      learningStatus: hydrated.learning.globalSampleCounts.realSamples >= hydrated.learning.confidenceThresholds.high
        ? 'CONFIDENT'
        : hydrated.learning.globalSampleCounts.realSamples >= hydrated.learning.confidenceThresholds.low
          ? 'LEARNING_ACTIVE' : 'COLD_START',
      source: 'REAL_ONLY',
      seedWeight: 0,
      contextualData: hydrated.learning.contextualData
        .map((context) => {
          const statistics = cleanStats(context.statistics);
          return { ...context, statistics, sampleCount: Object.values(statistics).reduce((sum, stat) => sum + stat.realSamples, 0) };
        })
        .filter((context) => Object.keys(context.statistics).length > 0),
      overallStatistics: cleanStats(hydrated.learning.overallStatistics),
      globalSampleCounts: {
        ...hydrated.learning.globalSampleCounts,
        seedSamples: 0,
        totalSamples: hydrated.learning.globalSampleCounts.realSamples,
      },
    };
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