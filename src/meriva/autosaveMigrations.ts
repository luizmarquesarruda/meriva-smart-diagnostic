// MERIVA SMART DIAGNOSTIC — Migrações do formato de autosave

import { AutoSaveEnvelope, AUTOSAVE_SCHEMA_VERSION } from './autosaveTypes';

export type AutosaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

export const AUTOSAVE_MIGRATIONS: Record<number, AutosaveMigration> = {};

export function migrateEnvelope<T>(envelope: AutoSaveEnvelope<T>): AutoSaveEnvelope<T> | null {
  if (!Number.isInteger(envelope.schemaVersion) || envelope.schemaVersion < 1) return null;
  if (envelope.schemaVersion > AUTOSAVE_SCHEMA_VERSION) return null;

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
