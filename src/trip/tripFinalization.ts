/**
 * Preserve the recorder ownership until every persistence step has completed.
 * On failure the same recorder/cycle can be retried with its stable identifier.
 */
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
