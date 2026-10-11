// MERIVA SMART DIAGNOSTIC: Ponte OBD -> armazenamento -> autosave
//
// Integra os módulos que já existem (obdLogger, pidBank, learningProfile)
// ao autosave. Dados de simulação são gravados nos logs, mas nunca alimentam
// o banco de PIDs confirmados nem o aprendizado.

import type { PidQueryResult } from '../obd/elm327';
import { logRawObdData, logInterpretedData } from '../database/obdLogger';
import { PidConfirmationEntry, readPidConfirmations, recordPidConfirmation } from '../database/pidBank';
import { updateLearningProfileRealSamples, type RealLearningSample } from '../database/learningProfile';
import { AppState } from 'react-native';
import type { VehicleCondition } from '../types/sourceTypes';
import { pushLastReading, updateAutoSaveState, scheduleCriticalSave } from './autosaveManager';
import { shouldFeedLearning } from './autosaveValidation';
import { getVehicleConditionSnapshot, recordLivePidQuery } from '../obd/liveTelemetry';

// Telemetria em memória/log continua por amostra; as duas gravações caras têm janelas
// independentes para que a falha de um arquivo não bloqueie a retentativa do outro.
const pidConfirmationPersistedAt = new Map<string, number>();
const learningProfilePersistedAt = new Map<string, number>();
const pidConfirmationInFlight = new Set<string>();
const learningProfileInFlight = new Set<string>();
const pidConfirmationRetryAfter = new Map<string, number>();
const learningProfileRetryAfter = new Map<string, number>();
const pendingPidConfirmations = new Map<string, { basePath: string; pid: string; result: PidQueryResult; count: number }>();
const pendingLearningSamples = new Map<string, { basePath: string; pid: string; samples: RealLearningSample[] }>();
const pendingFlushTimers = new Map<string, ReturnType<typeof setTimeout>>();
let backgroundFlushSubscription: { remove: () => void } | null = null;
const LEARNING_PERSIST_INTERVAL_MS = 60_000;
const LEARNING_PERSIST_RETRY_DELAY_MS = 5_000;

type PersistedAtMap = Map<string, number>;
type InFlightSet = Set<string>;

function learningPersistenceKey(basePath: string, pid: string): string {
  return `${basePath}::${pid}`;
}

function beginPersistence(
  basePath: string,
  pid: string,
  persistedAt: PersistedAtMap,
  inFlight: InFlightSet,
  retryAfter: PersistedAtMap,
  nowMs = Date.now(),
): boolean {
  const key = learningPersistenceKey(basePath, pid);
  const previous = persistedAt.get(key);
  if (inFlight.has(key)) return false;
  if (previous != null && nowMs - previous < LEARNING_PERSIST_INTERVAL_MS) return false;
  if (nowMs < (retryAfter.get(key) ?? 0)) return false;
  inFlight.add(key);
  return true;
}

function finishPersistence(
  basePath: string,
  pid: string,
  persistedAt: PersistedAtMap,
  inFlight: InFlightSet,
  retryAfter: PersistedAtMap,
  succeeded: boolean,
  nowMs = Date.now(),
): void {
  const key = learningPersistenceKey(basePath, pid);
  if (succeeded) {
    persistedAt.set(key, nowMs);
    retryAfter.delete(key);
  } else {
    // Falha libera retentativa após 5 s, em vez de bloquear por toda a janela de 60 s.
    retryAfter.set(key, nowMs + LEARNING_PERSIST_RETRY_DELAY_MS);
  }
  inFlight.delete(key);
}

type PersistenceKind = 'pid' | 'learning';

function timerKey(basePath: string, pid: string, kind: PersistenceKind): string {
  return learningPersistenceKey(basePath, pid) + '::' + kind;
}

function clearPendingTimer(basePath: string, pid: string, kind: PersistenceKind): void {
  const id = timerKey(basePath, pid, kind);
  const timer = pendingFlushTimers.get(id);
  if (timer) clearTimeout(timer);
  pendingFlushTimers.delete(id);
}

function schedulePendingFlush(
  basePath: string,
  pid: string,
  kind: PersistenceKind,
  delayOverrideMs?: number,
): void {
  const key = learningPersistenceKey(basePath, pid);
  const pending = kind === 'pid' ? pendingPidConfirmations.has(key) : pendingLearningSamples.has(key);
  if (!pending) return;

  const id = timerKey(basePath, pid, kind);
  if (pendingFlushTimers.has(id)) return;

  const persistedAt = kind === 'pid' ? pidConfirmationPersistedAt.get(key) : learningProfilePersistedAt.get(key);
  const inFlight = kind === 'pid' ? pidConfirmationInFlight.has(key) : learningProfileInFlight.has(key);
  const retryAt = kind === 'pid' ? pidConfirmationRetryAfter.get(key) ?? 0 : learningProfileRetryAfter.get(key) ?? 0;
  const readyAt = Math.max(
    persistedAt == null ? 0 : persistedAt + LEARNING_PERSIST_INTERVAL_MS,
    retryAt,
    inFlight ? Date.now() + 100 : 0,
  );
  const delay = delayOverrideMs ?? Math.max(100, readyAt - Date.now());

  const timer = setTimeout(() => {
    pendingFlushTimers.delete(id);
    if (kind === 'pid') void flushPendingPidBatch(basePath, pid, false);
    else void flushPendingLearningBatch(basePath, pid, false);
  }, delay);
  pendingFlushTimers.set(id, timer);
}

function queuePidConfirmation(basePath: string, pid: string, result: PidQueryResult, count = 1): void {
  const key = learningPersistenceKey(basePath, pid);
  const previous = pendingPidConfirmations.get(key);
  pendingPidConfirmations.set(key, {
    basePath,
    pid,
    result,
    count: count + (previous?.count ?? 0),
  });
  schedulePendingFlush(basePath, pid, 'pid');
}

function queueLearningSample(basePath: string, pid: string, sample: RealLearningSample): void {
  const key = learningPersistenceKey(basePath, pid);
  const previous = pendingLearningSamples.get(key);
  pendingLearningSamples.set(key, {
    basePath,
    pid,
    samples: [...(previous?.samples ?? []), sample],
  });
  schedulePendingFlush(basePath, pid, 'learning');
}

async function writePidConfirmationBatch(
  basePath: string,
  result: PidQueryResult,
  count: number,
): Promise<void> {
  const pid = result.parsed.pid;
  const now = new Date().toISOString();
  const existing = await readPidConfirmations(basePath);
  const prior = existing.find((entry) => entry.pid === pid);
  const entry: PidConfirmationEntry = {
    pid,
    name: result.parsed.name,
    classification: prior?.classification ?? 'PADRAO_OBD',
    status: 'CONFIRMADO',
    firstSeen: prior?.firstSeen ?? now,
    lastSeen: now,
    occurrences: (prior?.occurrences ?? 0) + count,
    protocol: prior?.protocol ?? result.protocol ?? 'N/D',
    responseTime: result.elapsedMs,
    source: 'REAL_OBD',
    confidence: prior ? prior.confidence + count : count,
    unit: result.parsed.unit,
    formulaId: result.parsed.definition?.formulaId,
    bytes: result.parsed.definition?.bytes,
    description: result.parsed.definition?.description,
  };
  await recordPidConfirmation(basePath, entry);
}

async function flushPendingPidBatch(basePath: string, pid: string, force: boolean): Promise<void> {
  const key = learningPersistenceKey(basePath, pid);
  const batch = pendingPidConfirmations.get(key);
  if (!batch) return;
  clearPendingTimer(basePath, pid, 'pid');
  if (pidConfirmationInFlight.has(key)) {
    schedulePendingFlush(basePath, pid, 'pid', 100);
    return;
  }

  const readyAt = Math.max(
    (pidConfirmationPersistedAt.get(key) ?? 0) + LEARNING_PERSIST_INTERVAL_MS,
    pidConfirmationRetryAfter.get(key) ?? 0,
  );
  if (!force && Date.now() < readyAt) {
    schedulePendingFlush(basePath, pid, 'pid', readyAt - Date.now());
    return;
  }

  pendingPidConfirmations.delete(key);
  pidConfirmationInFlight.add(key);
  try {
    await writePidConfirmationBatch(basePath, batch.result, batch.count);
    finishPersistence(basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, true);
  } catch (cause) {
    const newer = pendingPidConfirmations.get(key);
    pendingPidConfirmations.set(key, {
      basePath,
      pid,
      result: newer?.result ?? batch.result,
      count: batch.count + (newer?.count ?? 0),
    });
    finishPersistence(basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, false);
    console.warn('[autosave] falha ao descarregar confirmações pendentes:', cause instanceof Error ? cause.message : cause);
  }

  if (pendingPidConfirmations.has(key)) schedulePendingFlush(basePath, pid, 'pid');
}

async function flushPendingLearningBatch(basePath: string, pid: string, force: boolean): Promise<void> {
  const key = learningPersistenceKey(basePath, pid);
  const batch = pendingLearningSamples.get(key);
  if (!batch) return;
  clearPendingTimer(basePath, pid, 'learning');
  if (learningProfileInFlight.has(key)) {
    schedulePendingFlush(basePath, pid, 'learning', 100);
    return;
  }

  const readyAt = Math.max(
    (learningProfilePersistedAt.get(key) ?? 0) + LEARNING_PERSIST_INTERVAL_MS,
    learningProfileRetryAfter.get(key) ?? 0,
  );
  if (!force && Date.now() < readyAt) {
    schedulePendingFlush(basePath, pid, 'learning', readyAt - Date.now());
    return;
  }

  pendingLearningSamples.delete(key);
  learningProfileInFlight.add(key);
  try {
    await updateLearningProfileRealSamples(basePath, batch.samples);
    finishPersistence(basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, true);
  } catch (cause) {
    const newer = pendingLearningSamples.get(key);
    pendingLearningSamples.set(key, {
      basePath,
      pid,
      samples: [...batch.samples, ...(newer?.samples ?? [])],
    });
    finishPersistence(basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, false);
    console.warn('[autosave] falha ao descarregar amostras de aprendizado pendentes:', cause instanceof Error ? cause.message : cause);
  }

  if (pendingLearningSamples.has(key)) schedulePendingFlush(basePath, pid, 'learning');
}

/** Descarrega lotes pendentes, por exemplo ao ir para background ou encerrar a sessão OBD. */
export async function flushPendingObdLearningPersistence(basePath?: string): Promise<void> {
  const pairs = new Map<string, { basePath: string; pid: string }>();
  const prefix = basePath == null ? null : basePath + '::';
  for (const batch of pendingPidConfirmations.values()) {
    if (prefix == null || (batch.basePath + '::' + batch.pid).startsWith(prefix)) {
      pairs.set(learningPersistenceKey(batch.basePath, batch.pid), { basePath: batch.basePath, pid: batch.pid });
    }
  }
  for (const batch of pendingLearningSamples.values()) {
    if (prefix == null || (batch.basePath + '::' + batch.pid).startsWith(prefix)) {
      pairs.set(learningPersistenceKey(batch.basePath, batch.pid), { basePath: batch.basePath, pid: batch.pid });
    }
  }
  await Promise.all(Array.from(pairs.values()).flatMap((pair) => [
    flushPendingPidBatch(pair.basePath, pair.pid, true),
    flushPendingLearningBatch(pair.basePath, pair.pid, true),
  ]));
}

function ensureBackgroundFlushListener(): void {
  if (backgroundFlushSubscription) return;
  backgroundFlushSubscription = AppState.addEventListener('change', (state) => {
    if (state !== 'active') {
      void flushPendingObdLearningPersistence().catch((cause) => {
        console.warn('[autosave] falha ao descarregar aprendizado ao ir para background:', cause instanceof Error ? cause.message : cause);
      });
    }
  });
}

export async function registerObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  condition?: VehicleCondition,
): Promise<void> {
  ensureBackgroundFlushListener();
  try {
    await logRawObdData(basePath, result, result.parsed.pid, source);
    await logInterpretedData(basePath, result, result.parsed.pid, source);
  } catch (cause) {
    console.warn('[autosave] falha ao gravar logs OBD:', cause instanceof Error ? cause.message : cause);
  }

  recordLivePidQuery(result, source);
  pushLastReading({
    pid: result.parsed.pid,
    name: result.parsed.name,
    value: result.parsed.value,
    unit: result.parsed.unit,
    status: result.parsed.status,
    timestamp: new Date().toISOString(),
    source,
  });

  const parsedValue = result.parsed.value;
  const pid = result.parsed.pid;
  const learningCondition = condition ?? (source === 'REAL' ? getVehicleConditionSnapshot().condition : 'UNKNOWN');
  if (shouldFeedLearning(source, result.parsed.status, parsedValue) && parsedValue !== null) {
    const key = learningPersistenceKey(basePath, pid);
    if (pendingPidConfirmations.has(key) || !beginPersistence(
      basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter,
    )) {
      queuePidConfirmation(basePath, pid, result);
    } else {
      try {
        await writePidConfirmationBatch(basePath, result, 1);
        finishPersistence(basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, true);
      } catch (cause) {
        finishPersistence(basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, false);
        queuePidConfirmation(basePath, pid, result);
        console.warn('[autosave] falha ao persistir confirmação de PID:', cause instanceof Error ? cause.message : cause);
      }
    }

    if (pendingLearningSamples.has(key) || !beginPersistence(
      basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter,
    )) {
      queueLearningSample(basePath, pid, { pidName: result.parsed.name, value: parsedValue, condition: learningCondition });
    } else {
      try {
        await updateLearningProfileRealSamples(basePath, [{ pidName: result.parsed.name, value: parsedValue, condition: learningCondition }]);
        finishPersistence(basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, true);
      } catch (cause) {
        finishPersistence(basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, false);
        queueLearningSample(basePath, pid, { pidName: result.parsed.name, value: parsedValue, condition: learningCondition });
        console.warn('[autosave] falha ao persistir perfil de aprendizado:', cause instanceof Error ? cause.message : cause);
      }
    }
  }

  if (source === 'SIMULACAO') {
    updateAutoSaveState((state) => {
      state.settings.simulationQueries = (Number(state.settings.simulationQueries) || 0) + 1;
    });
  }
}

export async function forceSaveOnObdEvent(): Promise<void> {
  // Eventos críticos próximos no tempo são consolidados em um único snapshot.
  scheduleCriticalSave();
}
