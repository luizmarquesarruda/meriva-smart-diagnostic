// MERIVA SMART DIAGNOSTIC — Envelope de autosave

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

export interface AutoSaveStatus {
  lastSavedAt: string | null;
  lastSaveReason: SaveReason | null;
  lastError: string | null;
}
