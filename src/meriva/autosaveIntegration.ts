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
import { recordLivePidQuery } from '../obd/liveTelemetry';

export function recordAutomaticObdQuery(
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO' = 'REAL',
): void {
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
