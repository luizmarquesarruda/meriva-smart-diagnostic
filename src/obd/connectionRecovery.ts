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
  persistenceTimeoutMs = 1_000,
): Promise<DisconnectCleanupResult> {
  let persistenceError: unknown | null = null;
  let closeError: unknown | null = null;

  // Start persistence without making socket closure wait for storage I/O.
  // Normalize the promise so a late rejection is always handled.
  const persistence = Promise.resolve()
    .then(persist)
    .then(
      () => ({ timedOut: false as const, error: null as unknown | null }),
      (cause) => ({ timedOut: false as const, error: cause as unknown }),
    );

  try {
    // Do not start recovery until close settles: opening a second RFCOMM socket
    // while the old session is still closing can recreate the connection loop.
    await close();
  } catch (cause) {
    closeError = cause;
  }

  let timer: ReturnType<typeof setTimeout> | undefined;
  const persistenceResult = await Promise.race([
    persistence,
    new Promise<{ timedOut: true; error: unknown }>((resolve) => {
      timer = setTimeout(
        () => resolve({
          timedOut: true,
          error: new Error(`PERSISTÊNCIA DA DESCONEXÃO EXCEDEU ${persistenceTimeoutMs} MS`),
        }),
        Math.max(1, persistenceTimeoutMs),
      );
    }),
  ]).finally(() => {
    if (timer) clearTimeout(timer);
  });

  persistenceError = persistenceResult.error;
  return { persistenceError, closeError };
}

/**
 * Wait for an earlier native request to settle, but never inherit an unbounded wait.
 * The native API itself cannot be cancelled from this layer.
 */
export async function waitForNativeConnectAttempt(
  pending: Promise<unknown>,
  timeoutMs: number,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      pending.then(() => true, () => true),
      new Promise<boolean>((resolve) => {
        timer = setTimeout(() => resolve(false), Math.max(1, timeoutMs));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
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
