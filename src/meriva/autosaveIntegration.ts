// MERIVA SMART DIAGNOSTIC: Ponte OBD -> armazenamento -> autosave
//
// Integra os módulos que já existem (obdLogger, pidBank, learningProfile)
// ao autosave. Dados de simulação são gravados nos logs, mas nunca alimentam
// o banco de PIDs confirmados nem o aprendizado.

import type { PidQueryResult } from '../obd/elm327';
import { logRawObdData, logInterpretedData } from '../database/obdLogger';
import { PidConfirmationEntry, readPidConfirmations, recordPidConfirmation } from '../database/pidBank';
import { updateLearningProfileRealSample } from '../database/learningProfile';
import type { VehicleCondition } from '../types/sourceTypes';
import { pushLastReading, updateAutoSaveState, scheduleCriticalSave } from './autosaveManager';
import { shouldFeedLearning } from './autosaveValidation';
import { getVehicleConditionSnapshot, recordLivePidQuery } from '../obd/liveTelemetry';
import pollingPolicy from '../knowledge/polling_policy.json';
import { appendLinkEvent } from '../obd/linkEventStore';

const lastLearningPersistedAt = new Map<string, number>();
const LEARNING_SAMPLE_MIN_INTERVAL_MS = pollingPolicy.learningSampleMinIntervalMs;
let consecutiveRealQueryFailures = 0;

// Learning/profile file I/O must not hold the serial OBD polling loop. Mutations
// are serialized so simultaneous PIDs cannot overwrite each other's profile updates.
let learningPersistenceQueue: Promise<void> = Promise.resolve();

function enqueueLearningPersistence(operation: () => Promise<void>): void {
  learningPersistenceQueue = learningPersistenceQueue
    .catch(() => undefined)
    .then(operation)
    .catch((cause) => {
      console.warn('[autosave] falha ao registrar aprendizado OBD em segundo plano:',
        cause instanceof Error ? cause.message : cause);
    });
}

/** Test/lifecycle hook for callers that require all queued learning writes to finish. */
export async function flushLearningPersistenceQueue(): Promise<void> {
  await learningPersistenceQueue;
}

/** Deduplicate high-frequency repeats for persistence/learning without dropping raw CSV samples. */
export function shouldPersistRealPidSample(basePath: string, pid: string, nowMs = Date.now()): boolean {
  const key = `${basePath}:${pid.toUpperCase()}`;
  const last = lastLearningPersistedAt.get(key);
  if (last !== undefined && nowMs - last < LEARNING_SAMPLE_MIN_INTERVAL_MS) return false;
  lastLearningPersistedAt.set(key, nowMs);
  return true;
}

export async function registerObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  condition?: VehicleCondition,
): Promise<void> {
  try {
    await logRawObdData(basePath, result, result.parsed.pid, source);
    await logInterpretedData(basePath, result, result.parsed.pid, source);
  } catch (cause) {
    console.warn('[autosave] falha ao gravar logs OBD:', cause instanceof Error ? cause.message : cause);
  }

  recordLivePidQuery(result, source);

  if (source === 'REAL') {
    const responseText = String(result.rx ?? '').toUpperCase();
    const succeeded = result.commandStatus === 'OK' && result.parsed.status === 'RESPONDEU';
    consecutiveRealQueryFailures = succeeded ? 0 : consecutiveRealQueryFailures + 1;
    const cause = succeeded ? 'PID_RESPONSE'
      : responseText.includes('TIMEOUT') || result.commandStatus === 'TIMEOUT' ? 'TIMEOUT'
      : responseText.includes('NO DATA') ? 'NO_DATA'
      : responseText.includes('BUS INIT') || responseText.includes('BUS ERROR') ? 'BUS_INIT_ERROR'
      : responseText.includes('UNABLE TO CONNECT') ? 'UNABLE_TO_CONNECT'
      : responseText.includes('SOCKET') || responseText.includes('CLOSED') ? 'SOCKET'
      : 'STATE_CHANGE';
    void appendLinkEvent(basePath, {
      timestamp: new Date().toISOString(),
      state: succeeded ? 'ECU_RESPONDING' : 'ADAPTER_NO_ECU_RESPONSE',
      cause,
      consecutiveFailures: consecutiveRealQueryFailures,
      latencyMs: result.elapsedMs,
      pid: result.parsed.pid,
      ...(result.parsed.pid === '0142' && result.parsed.value != null ? { adapterVoltageV: result.parsed.value } : {}),
    }).catch((error) => console.warn('[link-event] PID event failed:', error instanceof Error ? error.message : error));
  }

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
  const learningCondition = condition ?? (source === 'REAL' ? getVehicleConditionSnapshot().condition : 'UNKNOWN');
  if (
    shouldFeedLearning(source, result.parsed.status, parsedValue) &&
    parsedValue !== null &&
    shouldPersistRealPidSample(basePath, result.parsed.pid)
  ) {
    // Snapshot the query data before leaving the real-time path. Persist the
    // learning/bank updates in order, but don't make the next ECU request wait
    // on JSON read-modify-write operations.
    const learningInput = {
      pid: result.parsed.pid,
      name: result.parsed.name,
      value: parsedValue,
      unit: result.parsed.unit,
      formulaId: result.parsed.definition?.formulaId,
      bytes: result.parsed.definition?.bytes,
      description: result.parsed.definition?.description,
      responseTime: result.elapsedMs,
      protocol: result.protocol ?? 'N/D',
      condition: learningCondition,
      timestamp: new Date().toISOString(),
    };
    enqueueLearningPersistence(async () => {
      const existing = await readPidConfirmations(basePath);
      const prior = existing.find((entry) => entry.pid === learningInput.pid);
      const entry: PidConfirmationEntry = {
        pid: learningInput.pid,
        name: learningInput.name,
        classification: prior?.classification ?? 'PADRAO_OBD',
        // A valid payload proves response, not physical sensor accuracy.
        // Uma resposta OBD válida não valida a exatidão física do sensor nem comprova exatidão elétrica.
        status: prior?.status === 'CONFIRMADO' && prior.source === 'USER_REAL_OBSERVATION' ? 'CONFIRMADO' : 'RESPONDEU',
        firstSeen: prior?.firstSeen ?? learningInput.timestamp,
        lastSeen: learningInput.timestamp,
        occurrences: (prior?.occurrences ?? 0) + 1,
        protocol: prior?.protocol ?? learningInput.protocol,
        responseTime: learningInput.responseTime,
        source: 'REAL_OBD',
        confidence: prior ? prior.confidence + 1 : 1,
        unit: learningInput.unit,
        formulaId: learningInput.formulaId,
        bytes: learningInput.bytes,
        description: learningInput.description,
      };
      await recordPidConfirmation(basePath, entry);
      await updateLearningProfileRealSample(
        basePath,
        learningInput.name,
        learningInput.value,
        learningInput.condition,
      );
    });
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
