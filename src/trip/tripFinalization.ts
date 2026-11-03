/**
 * Preserve the recorder ownership until every persistence step has completed.
 * On failure the same recorder/cycle can be retried with its stable identifier.
 */
export interface PendingTripCycle<TRecorder, TCycle> {
  recorder: TRecorder;
  cycle: TCycle | null;
}

/** Reuse the exact finalized cycle while the same recorder is retried. */
export function getOrCreatePendingTripCycle<TRecorder, TCycle>(
  pending: PendingTripCycle<TRecorder, TCycle> | null,
  recorder: TRecorder,
  buildCycle: () => TCycle | null,
): PendingTripCycle<TRecorder, TCycle> {
  if (pending && pending.recorder === recorder) return pending;
  return { recorder, cycle: buildCycle() };
}

export async function persistTripBeforeRelease<T>(
  cycle: T | null,
  persist: (cycle: T) => Promise<void>,
  release: () => void,
): Promise<boolean> {
  if (cycle === null) {
    release();
    return false;
  }
  await persist(cycle);
  release();
  return true;
}
