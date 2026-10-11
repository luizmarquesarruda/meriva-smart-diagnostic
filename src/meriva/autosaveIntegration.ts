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

// Telemetria em memória/log continua por amostra; as duas gravações caras têm janelas
// independentes para que a falha de um arquivo não bloqueie a retentativa do outro.
const pidConfirmationPersistedAt = new Map<string, number>();
const learningProfilePersistedAt = new Map<string, number>();
const pidConfirmationInFlight = new Set<string>();
const learningProfileInFlight = new Set<string>();
const pidConfirmationRetryAfter = new Map<string, number>();
const learningProfileRetryAfter = new Map<string, number>();
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
    if (beginPersistence(
      basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter,
    )) {
      try {
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
        finishPersistence(
          basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, true,
        );
      } catch (cause) {
        finishPersistence(
          basePath, pid, pidConfirmationPersistedAt, pidConfirmationInFlight, pidConfirmationRetryAfter, false,
        );
        console.warn('[autosave] falha ao persistir confirmação de PID:', cause instanceof Error ? cause.message : cause);
      }
    }

    if (beginPersistence(
      basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter,
    )) {
      try {
        await updateLearningProfileRealSample(basePath, result.parsed.name, parsedValue, learningCondition);
        finishPersistence(
          basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, true,
        );
      } catch (cause) {
        finishPersistence(
          basePath, pid, learningProfilePersistedAt, learningProfileInFlight, learningProfileRetryAfter, false,
        );
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
