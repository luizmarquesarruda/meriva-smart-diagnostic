import type { AutoSaveEnvelope } from './autosaveTypes';
import { AUTOSAVE_SCHEMA_VERSION } from './autosaveTypes';

export type AutosaveMigration = (payload: Record<string, unknown>) => Record<string, unknown>;

export const AUTOSAVE_MIGRATIONS: Record<number, AutosaveMigration> = {};

export function migrateEnvelope<T>(envelope: AutoSaveEnvelope<T>): AutoSaveEnvelope<T> | null {
  if (!Number.isInteger(envelope.schemaVersion) || envelope.schemaVersion < 0) return null;
  if (envelope.schemaVersion > AUTOSAVE_SCHEMA_VERSION) return null;

  let schemaVersion = envelope.schemaVersion;
  let payload: unknown = envelope.payload;

  while (schemaVersion < AUTOSAVE_SCHEMA_VERSION) {
    const migration = AUTOSAVE_MIGRATIONS[schemaVersion];
    if (!migration || typeof payload !== 'object' || payload === null || Array.isArray(payload)) return null;
    payload = migration(payload as Record<string, unknown>);
    schemaVersion += 1;
  }

  return {
    ...envelope,
    schemaVersion,
    payload: payload as T,
  };
}
