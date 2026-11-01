export interface HistoryIndexDocument {
  version?: string;
  schemaVersion?: number;
  cycles?: unknown[];
  totalCount?: number;
  [key: string]: unknown;
}

export const CURRENT_HISTORY_SCHEMA_VERSION = 2;

type Migration = (document: HistoryIndexDocument) => HistoryIndexDocument;

/**
 * Version 1 is the legacy JSON index (version string 1.0, without schemaVersion).
 * Version 2 adds an explicit integer schema version and reconciles totalCount.
 * Unknown/future schemas are rejected instead of being rewritten by older code.
 */
const MIGRATIONS: Record<number, Migration> = {
  1: (document) => {
    if (!Array.isArray(document.cycles)) {
      throw new Error('HISTORY_MIGRATION_V1_REQUIRES_CYCLES_ARRAY');
    }
    return {
      ...document,
      version: typeof document.version === 'string' ? document.version : '1.0',
      schemaVersion: 2,
      totalCount: document.cycles.length,
    };
  },
};

export function migrateHistoryIndexDocument(input: unknown): {
  document: HistoryIndexDocument;
  migrated: boolean;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('HISTORY_INDEX_DOCUMENT_INVALID');
  }

  let document = input as HistoryIndexDocument;
  const rawVersion = document.schemaVersion;
  let version = rawVersion === undefined ? 1 : rawVersion;
  if (!Number.isInteger(version) || version < 1) {
    throw new Error('HISTORY_SCHEMA_VERSION_INVALID');
  }
  if (version > CURRENT_HISTORY_SCHEMA_VERSION) {
    throw new Error('HISTORY_SCHEMA_VERSION_NEWER_THAN_APP');
  }

  const originalVersion = version;
  while (version < CURRENT_HISTORY_SCHEMA_VERSION) {
    const migration = MIGRATIONS[version];
    if (!migration) throw new Error('HISTORY_MIGRATION_MISSING_' + version);
    document = migration(document);
    version += 1;
  }

  return { document, migrated: originalVersion !== CURRENT_HISTORY_SCHEMA_VERSION };
}
