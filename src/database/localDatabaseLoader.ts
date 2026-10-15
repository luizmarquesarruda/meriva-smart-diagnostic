import type * as LocalDatabaseModule from './localDatabase';

type LocalDatabaseApi = typeof import('./localDatabase');

// Delayed CommonJS require keeps legacy-only callers from initializing the
// native SQLite module until they actually need it. This also works with the
// project's current TypeScript CommonJS module setting.
declare const require: (moduleName: string) => LocalDatabaseApi;

export function loadLocalDatabase(): LocalDatabaseApi {
  return require('./localDatabase') as LocalDatabaseApi;
}
