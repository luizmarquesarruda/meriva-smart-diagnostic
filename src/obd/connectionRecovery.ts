export interface DisconnectCleanupResult {
  persistenceError: unknown | null;
  closeError: unknown | null;
}

/**
 * Best-effort cleanup after an unexpected disconnect.
 * A storage failure must not prevent closing the old serial session or entering recovery.
 */
export async function cleanupDisconnectedSession(
  persist: () => Promise<void>,
  close: () => Promise<void>,
): Promise<DisconnectCleanupResult> {
  let persistenceError: unknown | null = null;
  let closeError: unknown | null = null;

  try {
    await persist();
  } catch (cause) {
    persistenceError = cause;
  }

  try {
    await close();
  } catch (cause) {
    closeError = cause;
  }

  return { persistenceError, closeError };
}

/**
 * A JS timeout does not cancel the native RFCOMM request.
 * If that exact request is still registered, do not start a second socket mode concurrently.
 */
export function timedOutNativeAttemptStillPending(
  timedOut: boolean,
  currentAttempt: Promise<unknown> | null,
  registeredAttempt: Promise<unknown> | undefined,
): boolean {
  return timedOut && currentAttempt !== null && registeredAttempt === currentAttempt;
}
