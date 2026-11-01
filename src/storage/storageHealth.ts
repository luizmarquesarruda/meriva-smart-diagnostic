export type StorageHealthCode =
  | 'AUTOSAVE_FAILED'
  | 'HISTORY_CORRUPTED'
  | 'JSON_CORRUPTED'
  | 'JSON_RECOVERED'
  | 'FUTURE_SCHEMA'
  | 'AUTOSAVE_TXT_FAILED'
  | 'DAILY_TXT_FAILED'
  | 'CSV_ROWS_DROPPED'
  | 'CSV_FLUSH_FAILED'
  | 'CLEANUP_FAILED';

export interface StorageHealthIssue {
  id: string;
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
  resource?: string,
): void {
  const id = code + ':' + (resource ?? code);
  issues.set(id, { id, code, title, message, severity, updatedAt: new Date().toISOString() });
  emit();
}

export function clearStorageHealthIssue(code: StorageHealthCode, resource?: string): void {
  let changed = false;
  if (resource !== undefined) changed = issues.delete(code + ':' + resource);
  else {
    for (const [id, issue] of issues) {
      if (issue.code === code) changed = issues.delete(id) || changed;
    }
  }
  if (changed) emit();
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
