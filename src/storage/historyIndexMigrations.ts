export interface HistoryIndexDocument {
  schemaVersion?: number;
  version?: string;
  cycles?: unknown[];
  totalCount?: number;
  [key: string]: unknown;
}

export const CURRENT_HISTORY_SCHEMA_VERSION = 1;

type HistoryMigration = (document: HistoryIndexDocument) => HistoryIndexDocument;

const MIGRATIONS: Record<number, HistoryMigration> = {
  0: (document) => {
    if (!Array.isArray(document.cycles)) {
      throw new Error('HISTORY_MIGRATION_LEGACY_REQUIRES_CYCLES_ARRAY');
    }
    return {
      ...document,
      version: typeof document.version === 'string' ? document.version : '1.0',
      schemaVersion: 1,
      totalCount: document.cycles.length,
    };
  },
};

/**
 * Migra apenas documentos conhecidos. Versões futuras e JSON inválido
 * são rejeitados; o chamador deve preservar o arquivo de origem.
 */
export function migrateHistoryIndexDocument(input: unknown): {
  document: HistoryIndexDocument;
  migrated: boolean;
} {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    throw new Error('HISTORY_INDEX_DOCUMENT_INVALID');
  }

  let document = input as HistoryIndexDocument;
  let version = document.schemaVersion === undefined ? 0 : document.schemaVersion;

  if (!Number.isInteger(version) || version < 0) {
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
