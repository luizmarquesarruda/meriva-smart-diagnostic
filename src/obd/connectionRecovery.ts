export interface DisconnectCleanupResult {
  persistenceError: unknown | null;
  closeError: unknown | null;
}

export interface DisconnectPersistenceTask {
  label: string;
  run: () => Promise<void>;
}

/**
 * Run independent disconnect persistence/cleanup actions even if one fails.
 * Reject after all actions settle so the caller can record the aggregate failure.
 */
export async function runDisconnectPersistenceTasks(
  tasks: DisconnectPersistenceTask[],
): Promise<void> {
  const results = await Promise.all(tasks.map(async (task) => {
    try {
      await task.run();
      return null;
    } catch (cause) {
      const detail = cause instanceof Error ? cause.message : String(cause);
      return `${task.label}: ${detail}`;
    }
  }));
  const failures = results.filter((item): item is string => item !== null);
  if (failures.length > 0) {
    throw new Error(`FALHA NAS OPERAÇÕES DE DESCONEXÃO: ${failures.join('; ')}`);
  }
}

/**
 * Best-effort cleanup after an unexpected disconnect.
 * A storage failure must not prevent closing the old serial session or entering recovery.
 */
export async function cleanupDisconnectedSession(
  persist: () => Promise<void>,
  close: () => Promise<void>,
  persistenceTimeoutMs = 1_000,
  closeTimeoutMs = 5_000,
): Promise<DisconnectCleanupResult> {
  let persistenceError: unknown | null = null;
  let closeError: unknown | null = null;

  // Start persistence without making socket closure wait for storage I/O.
  // Normalize the promise so a late rejection is always handled.
  let persistenceOperation: Promise<void>;
  try {
    // Invoke synchronously to preserve deterministic start ordering, while
    // converting both synchronous throws and async rejections into a handled promise.
    persistenceOperation = Promise.resolve(persist());
  } catch (cause) {
    persistenceOperation = Promise.reject(cause);
  }
  const persistence = persistenceOperation.then(
    () => ({ timedOut: false as const, error: null as unknown | null }),
    (cause) => ({ timedOut: false as const, error: cause as unknown }),
  );

  // Native close() can itself stall. Bound the wait, but never interpret a
  // timeout as proof that the socket was released: the caller must block retry.
  let closeOperation: Promise<void>;
  try {
    closeOperation = Promise.resolve(close());
  } catch (cause) {
    closeOperation = Promise.reject(cause);
  }
  const closeSettled = closeOperation.then(
    () => ({ timedOut: false as const, error: null as unknown | null }),
    (cause) => ({ timedOut: false as const, error: cause as unknown }),
  );
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  const closeResult = await Promise.race([
    closeSettled,
    new Promise<{ timedOut: true; error: unknown }>((resolve) => {
      closeTimer = setTimeout(
        () => resolve({
          timedOut: true,
          error: new Error(`FECHAMENTO DA SESSÃO EXCEDEU ${closeTimeoutMs} MS; SOCKET NÃO CONSIDERADO LIBERADO`),
        }),
        Math.max(1, closeTimeoutMs),
      );
    }),
  ]).finally(() => {
    if (closeTimer) clearTimeout(closeTimer);
  });
  closeError = closeResult.error;

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

/**
 * A rejected close leaves the native socket state uncertain; retrying could create
 * concurrent RFCOMM sessions for the same adapter.
 */
export function shouldRetryAfterDisconnectCleanup(closeError: unknown | null): boolean {
  return closeError === null;
}
