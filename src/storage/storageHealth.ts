export type StorageHealthCode =
  | 'AUTOSAVE_FAILED'
  | 'HISTORY_CORRUPTED'
  | 'FUTURE_SCHEMA'
  | 'AUTOSAVE_TXT_FAILED'
  | 'DAILY_TXT_FAILED'
  | 'CSV_ROWS_DROPPED'
  | 'CSV_FLUSH_FAILED'
  | 'CLEANUP_FAILED';

export interface StorageHealthIssue {
  code: StorageHealthCode;
  title: string;
  message: string;
  severity: 'warning' | 'critical';
  updatedAt: string;
}

const issues = new Map<StorageHealthCode, StorageHealthIssue>();
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function recordStorageHealthIssue(
  code: StorageHealthCode,
  title: string,
  message: string,
  severity: 'warning' | 'critical' = 'warning',
): void {
  issues.set(code, { code, title, message, severity, updatedAt: new Date().toISOString() });
  emit();
}

export function clearStorageHealthIssue(code: StorageHealthCode): void {
  if (issues.delete(code)) emit();
}

export function getStorageHealthIssues(): StorageHealthIssue[] {
  return Array.from(issues.values()).sort((left, right) =>
    left.severity === right.severity ? left.updatedAt.localeCompare(right.updatedAt)
      : left.severity === 'critical' ? -1 : 1,
  );
}

export function subscribeStorageHealth(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}
