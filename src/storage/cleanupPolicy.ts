export const CLEANUP_RETENTION_DAYS = {
  LOGS: 7,
  LEITURAS: 30,
} as const;

export const CLEANUP_DIRECTORIES = ['LOGS', 'LEITURAS'] as const;
export type CleanupDirectory = typeof CLEANUP_DIRECTORIES[number];

export interface CleanupCandidate {
  modifiedAt: number;
}

export function isCleanupDirectory(value: string): value is CleanupDirectory {
  return (CLEANUP_DIRECTORIES as readonly string[]).includes(value);
}

export function getCleanupCutoffMs(directory: CleanupDirectory, now = Date.now()): number {
  return now - CLEANUP_RETENTION_DAYS[directory] * 24 * 60 * 60 * 1000;
}

export function isExpiredCleanupFile(
  directory: CleanupDirectory,
  modifiedAtMs: number,
  now = Date.now(),
): boolean {
  return Number.isFinite(modifiedAtMs) && modifiedAtMs > 0
    && modifiedAtMs < getCleanupCutoffMs(directory, now);
}

export function sortCleanupCandidates<T extends CleanupCandidate>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.modifiedAt - b.modifiedAt);
}
