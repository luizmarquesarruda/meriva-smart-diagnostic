// MERIVA SMART DIAGNOSTIC — Ponte OBD -> armazenamento -> autosave
// Arquivo para copiar em: <repo>/src/meriva/autosaveIntegration.ts
//
// Integra os módulos que JÁ EXISTEM (obdLogger, pidBank, learningProfile)
// ao autosave, SEM criar segunda arquitetura. Dados de simulação
// são gravados nos logs com source=SIMULACAO mas NUNCA alimentam
// o banco de PIDs confirmados nem o aprendizado (regra shouldFeedLearning).

import type { PidQueryResult } from '../obd/elm327';
import { logRawObdData, logInterpretedData } from '../database/obdLogger';
import { PidConfirmationEntry, readPidConfirmations, recordPidConfirmation } from '../database/pidBank';
import { updateLearningProfileRealSample } from '../database/learningProfile';
import type { VehicleCondition } from '../types/sourceTypes';
import { pushLastReading, updateAutoSaveState, saveNow } from './autosaveManager';
import { shouldFeedLearning } from './autosaveValidation';

/**
 * Registra o resultado de uma consulta OBD real (ou de simulação,
 * explicitamente marcada) nos logs CSV existentes e no autosave.
 */
export async function registerObdQuery(
  basePath: string,
  result: PidQueryResult,
  source: 'REAL' | 'SIMULACAO',
  condition: VehicleCondition = 'UNKNOWN',
): Promise<void> {
  // 1) logs CSV que já existem no projeto (raw + interpretado)
  try {
    await logRawObdData(basePath, result, result.parsed.pid, source);
    await logInterpretedData(basePath, result, result.parsed.pid, source);
  } catch (cause) {
    console.warn('[autosave] falha ao gravar logs OBD:', cause instanceof Error ? cause.message : cause);
  }

  // 2) telemetria recente no autosave (com debounce interno)
  pushLastReading({
    pid: result.parsed.pid,
    name: result.parsed.name,
    value: result.parsed.value,
    unit: result.parsed.unit,
    status: result.parsed.status,
    timestamp: new Date().toISOString(),
  });

  // 3) banco de PIDs confirmados + aprendizado — SOMENTE dados reais válidos
  if (shouldFeedLearning(source, result.parsed.status, result.parsed.value)) {
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
        // baseline documentado do veículo (ISO 14230-4 KWP) — confirmado em comunicação real quando disponível
        protocol: prior?.protocol ?? 'ISO 14230-4 KWP',
        responseTime: result.elapsedMs,
        source: 'REAL_OBD',
        confidence: prior ? prior.confidence + 1 : 1,
      };
      await recordPidConfirmation(basePath, entry);

      await updateLearningProfileRealSample(
        basePath,
        result.parsed.name,
        result.parsed.value,
        condition,
      );
    } catch (cause) {
      console.warn('[autosave] falha ao registrar confirmação de PID:', cause instanceof Error ? cause.message : cause);
    }
  }

  // 4) simulação nunca contamina o aprendizado (contagem opcional)
  if (source === 'SIMULACAO') {
    updateAutoSaveState((state) => {
      state.settings.simulationQueries = (Number(state.settings.simulationQueries) || 0) + 1;
    });
  }
}

/** Save forçado em eventos críticos da sessão OBD (desconexão, encerramento). */
export async function forceSaveOnObdEvent(): Promise<void> {
  await saveNow('critical');
}