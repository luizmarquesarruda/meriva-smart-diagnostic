// MERIVA SMART DIAGNOSTIC: Ponte OBD -> telemetria em memória -> persistência.
import type { PidQueryResult } from '../obd/elm327';
import { logRawObdData, logInterpretedData } from '../database/obdLogger';
import { type PidConfirmationEntry, readPidConfirmations, recordPidConfirmation } from '../database/pidBank';
import { updateLearningProfileRealSample } from '../database/learningProfile';
import type { VehicleCondition } from '../types/sourceTypes';
import {
  pushLastReading,
  updateAutoSaveState,
  scheduleCriticalSave,
  registerBackgroundPersistenceFlushHandler,
} from './autosaveManager';
import { shouldFeedLearning } from './autosaveValidation';
import { getVehicleConditionSnapshot, recordLivePidQuery } from '../obd/liveTelemetry';
import { flushBufferedCsvRows } from '../database/csvLogger';

export interface RegisterObdQueryOptions {
  /**
   * Keeps the display/polling path non-blocking. Disk logging is buffered and
   * slower PID-bank/learning writes run behind a per-profile queue.
   */
  deferPersistence?: boolean;
}

const backgroundPersistenceQueues = new Map<string, Promise<void>>();
const lastBackgroundLearningAt = new Map<string, number>();
const BACKGROUND_LEARNING_MIN_INTERVAL_MS = 10_000;

async function persistObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  learningCondition: VehicleCondition,
  options: { bufferedLogs: boolean; persistLearning: boolean },
): Promise<void> {
  try {
    await Promise.all([
      logRawObdData(basePath, result, result.parsed.pid, source, { buffered: options.bufferedLogs }),
      logInterpretedData(basePath, result, result.parsed.pid, source, { buffered: options.bufferedLogs }),
    ]);
  } catch (cause) {
    console.warn('[autosave] falha ao gravar logs OBD:', cause instanceof Error ? cause.message : cause);
  }

  const parsedValue = result.parsed.value;
  if (!options.persistLearning || !shouldFeedLearning(source, result.parsed.status, parsedValue) || parsedValue === null) {
    return;
  }

  try {
    const now = new Date().toISOString();
    const existing = await readPidConfirmations(basePath);
    const prior = existing.find((entry) => entry.pid === result.parsed.pid);

    const entry: PidConfirmationEntry = {
      pid: result.parsed.pid,
      name: result.parsed.name,
      classification: prior?.classification ?? 'PADRAO_OBD',
      // A resposta prova que o PID respondeu, não valida a exatidão física do sensor nem comprova a calibração elétrica.
      status: prior?.status === 'CONFIRMADO' && prior.source === 'USER_REAL_OBSERVATION' ? 'CONFIRMADO' : 'RESPONDEU',
      firstSeen: prior?.firstSeen ?? now,
      lastSeen: now,
      occurrences: (prior?.occurrences ?? 0) + 1,
      protocol: prior?.protocol ?? result.protocol ?? 'N/D',
      responseTime: result.elapsedMs,
      source: 'REAL_OBD',
      confidence: prior ? prior.confidence + 1 : 1,
      unit: result.parsed.unit,
      formulaId: result.parsed.definition?.formulaId,
      bytes: result.parsed.definition?.bytes,
      description: result.parsed.definition?.description,
    };
    await recordPidConfirmation(basePath, entry);
    await updateLearningProfileRealSample(basePath, result.parsed.name, parsedValue, learningCondition);
  } catch (cause) {
    console.warn('[autosave] falha ao registrar confirmação de PID:', cause instanceof Error ? cause.message : cause);
  }
}

export function shouldPersistRealPidSample(basePath: string, pid: string, nowMs = Date.now()): boolean {
  const key = `${basePath}|${pid}`;
  const last = lastBackgroundLearningAt.get(key);
  if (last != null && nowMs - last < BACKGROUND_LEARNING_MIN_INTERVAL_MS) return false;
  lastBackgroundLearningAt.set(key, nowMs);
  return true;
}

function enqueueBackgroundPersistence(basePath: string, task: () => Promise<void>): void {
  const previous = backgroundPersistenceQueues.get(basePath) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(task);
  backgroundPersistenceQueues.set(basePath, current);
  void current.finally(() => {
    if (backgroundPersistenceQueues.get(basePath) === current) backgroundPersistenceQueues.delete(basePath);
  }).catch(() => undefined);
}

export async function registerObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  condition?: VehicleCondition,
  options: RegisterObdQueryOptions = {},
): Promise<void> {
  // Update live state before any filesystem operation so the cockpit can render
  // a new reading without waiting for CSV, PID-bank, or learning-profile I/O.
  recordLivePidQuery(result, source);
  const observedAt = new Date().toISOString();
  pushLastReading({
    pid: result.parsed.pid,
    name: result.parsed.name,
    value: result.parsed.value,
    unit: result.parsed.unit,
    status: result.parsed.status,
    timestamp: observedAt,
    source,
  });

  if (source === 'SIMULACAO') {
    updateAutoSaveState((state) => {
      state.settings.simulationQueries = (Number(state.settings.simulationQueries) || 0) + 1;
    });
  }

  const parsedValue = result.parsed.value;
  const persistLearning = shouldFeedLearning(source, result.parsed.status, parsedValue) && parsedValue !== null;
  const learningCondition = condition ?? (source === 'REAL' ? getVehicleConditionSnapshot().condition : 'UNKNOWN');
  // Aggregation applies to both the fast-path queue and legacy synchronous callers.
  // Only one sample per PID per 10 s updates persistent learning/occurrence counts;
  // every actual response still updates live telemetry, last readings, and CSV evidence.
  const persistThisLearningSample = persistLearning &&
    shouldPersistRealPidSample(basePath, result.parsed.pid, Date.now());

  if (options.deferPersistence) {
    enqueueBackgroundPersistence(basePath, () => persistObdQuery(
      basePath,
      result,
      source,
      learningCondition,
      { bufferedLogs: true, persistLearning: persistThisLearningSample },
    ));
    return;
  }

  await persistObdQuery(
    basePath,
    result,
    source,
    learningCondition,
    { bufferedLogs: false, persistLearning: persistThisLearningSample },
  );
}

/** Backward-compatible name retained for callers that drain only the learning/persistence queue. */
export async function flushLearningPersistenceQueue(): Promise<void> {
  await Promise.all(Array.from(backgroundPersistenceQueues.values(), (queue) => queue.catch(() => undefined)));
}

export async function flushObdPersistence(basePath?: string): Promise<void> {
  const queues = basePath
    ? [backgroundPersistenceQueues.get(basePath)].filter((queue): queue is Promise<void> => Boolean(queue))
    : Array.from(backgroundPersistenceQueues.values());
  await Promise.all(queues.map((queue) => queue.catch(() => undefined)));
  await flushBufferedCsvRows();
}

// Let the app-state handler drain the per-profile queue before its final CSV flush.
registerBackgroundPersistenceFlushHandler(() => flushObdPersistence());

export async function forceSaveOnObdEvent(): Promise<void> {
  // Drain queued telemetry logs/learning before an event-triggered snapshot.
  await flushObdPersistence();
  await scheduleCriticalSave();
}
