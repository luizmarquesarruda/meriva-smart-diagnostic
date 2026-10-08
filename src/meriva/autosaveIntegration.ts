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
import { pushLastReading, updateAutoSaveState, scheduleCriticalSave, scheduleTelemetrySave } from './autosaveManager';
import { shouldFeedLearning } from './autosaveValidation';
import { recordLivePidQuery } from '../obd/liveTelemetry';
import { emitAppEvent } from '../state/appEventBus';

export function recordAutomaticObdQuery(
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO' = 'REAL',
): void {
  recordLivePidQuery(result, source);

  if (result.parsed.status === 'RESPONDEU' && result.parsed.value !== null && Number.isFinite(result.parsed.value)) {
    pushLastReading({
      pid: result.parsed.pid,
      name: result.parsed.name,
      value: result.parsed.value,
      unit: result.parsed.unit,
      status: result.parsed.status,
      timestamp: new Date().toISOString(),
      source,
    }, { schedulePersist: false });
  } else {
    updateAutoSaveState((state) => {
      state.lastQueryAttempts = [
        {
          pid: result.parsed.pid,
          timestamp: new Date().toISOString(),
          status: result.parsed.status,
          value: result.parsed.value,
          errorMessage: result.parsed.errorMessage,
          source,
        },
        ...state.lastQueryAttempts,
      ].slice(0, 50);
    }, { schedulePersist: false });
  }
  scheduleTelemetrySave();
}

export async function registerObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  condition: VehicleCondition = 'UNKNOWN',
): Promise<void> {
  try {
    await logRawObdData(basePath, result, result.parsed.pid, source);
    await logInterpretedData(basePath, result, result.parsed.pid, source);
  } catch (cause) {
    console.warn('[autosave] falha ao gravar logs OBD:', cause instanceof Error ? cause.message : cause);
  }

  recordAutomaticObdQuery(result, source);


  const parsedValue = result.parsed.value;
  if (shouldFeedLearning(source, result.parsed.status, parsedValue) && parsedValue !== null) {
    try {
      const now = new Date().toISOString();
      const existing = await readPidConfirmations(basePath);
      const prior = existing.find((entry) => entry.pid === result.parsed.pid);

      const entry: PidConfirmationEntry = {
        pid: result.parsed.pid,
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
      };
      await recordPidConfirmation(basePath, entry);

      await updateLearningProfileRealSample(
        basePath,
        result.parsed.name,
        parsedValue,
        condition,
      );
      emitAppEvent('LEARNING_UPDATED');
    } catch (cause) {
      console.warn('[autosave] falha ao registrar confirmação de PID:', cause instanceof Error ? cause.message : cause);
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
