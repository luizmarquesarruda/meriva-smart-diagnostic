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
  return {
    ...defaults,
    ...payload,
    metadata: { ...defaults.metadata, ...(payload.metadata ?? {}) },
  };
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
  return source === 'REAL' && status === 'RESPONDEU' && value !== null;
}