// MERIVA SMART DIAGNOSTIC — Migrações do formato de autosave
// Arquivo para copiar em: <repo>/src/meriva/autosaveMigrations.ts

import { AutoSaveEnvelope, AUTOSAVE_SCHEMA_VERSION } from './autosaveTypes';

export type AutosaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

/**
 * Cada entrada migra o payload da versão `schemaVersion` N para N+1.
 * Exemplo futuro (v1 -> v2):
 *   1: (payload) => ({ ...payload, novoCampo: valorPadrao }),
 */
export const AUTOSAVE_MIGRATIONS: Record<number, AutosaveMigration> = {};

/**
 * Aplica migrações em cadeia até a versão atual.
 * Retorna null quando o arquivo é de uma versão futura desconhecida
 * (nunca rebaixa dados — o caller usa o fallback/último estado válido).
 */
export function migrateEnvelope<T>(envelope: AutoSaveEnvelope<T>): AutoSaveEnvelope<T> | null {
  let current = envelope as unknown as AutoSaveEnvelope<Record<string, unknown>>;

  while (current.schemaVersion < AUTOSAVE_SCHEMA_VERSION) {
    const migration = AUTOSAVE_MIGRATIONS[current.schemaVersion];
    if (!migration) return null;
    current = {
      ...current,
      schemaVersion: current.schemaVersion + 1,
      payload: migration(current.payload) as unknown as T,
    };
  }

  return current as unknown as AutoSaveEnvelope<T>;
}