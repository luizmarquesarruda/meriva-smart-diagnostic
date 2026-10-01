// MERIVA SMART DIAGNOSTIC — Envelope de autosave
// Arquivo para copiar em: <repo>/src/meriva/autosaveTypes.ts

export const AUTOSAVE_SCHEMA_VERSION = 1;
export const AUTOSAVE_DATA_TYPE = 'APP_STATE';
export const AUTOSAVE_SOURCE = 'autosaveManager';

export type SaveReason = 'debounce' | 'checkpoint' | 'critical' | 'background' | 'manual';

export interface AutoSaveEnvelope<T> {
  schemaVersion: number;
  savedAt: string;
  dataType: string;
  source: string;
  payload: T;
}