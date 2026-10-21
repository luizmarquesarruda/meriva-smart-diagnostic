import type { SharedObdConnection } from '../obd/sharedConnection';
import { getPidDefinition } from '../obd/pidDefinition';
import { createSensorTestPlan, MIN_SENSOR_TEST_READINGS, normalizeSensorPid } from './sensorTestEngine';

export const STARTUP_PID_PREFLIGHT_PIDS = ['010C', '0105', '0142', '0111'] as const;

export type StartupPidPreflightStatus = 'idle' | 'running' | 'complete' | 'partial';

export interface StartupPidPreflightSnapshot {
  status: StartupPidPreflightStatus;
  totalPids: number;
  completedPids: number;
  currentPid: string | null;
  currentLabel: string | null;
  currentAttempt: number;
  validReadings: number;
  verifiedPids: string[];
  unsupportedPids: string[];
  failedPids: string[];
  cancelled: boolean;
  message: string | null;
}

export const INITIAL_STARTUP_PID_PREFLIGHT: StartupPidPreflightSnapshot = {
  status: 'idle',
  totalPids: 0,
  completedPids: 0,
  currentPid: null,
  currentLabel: null,
  currentAttempt: 0,
  validReadings: 0,
  verifiedPids: [],
  unsupportedPids: [],
  failedPids: [],
  cancelled: false,
  message: null,
};

export interface StartupPidPreflightOptions {
  onProgress?: (snapshot: StartupPidPreflightSnapshot) => void;
  shouldCancel?: () => boolean;
}

function snapshotCopy(snapshot: StartupPidPreflightSnapshot): StartupPidPreflightSnapshot {
  return {
    ...snapshot,
    verifiedPids: [...snapshot.verifiedPids],
    unsupportedPids: [...snapshot.unsupportedPids],
    failedPids: [...snapshot.failedPids],
  };
}

/**
 * Verifica repetibilidade/parsing dos PIDs essenciais anunciados pela ECU.
 * Não avalia o estado físico dos sensores nem substitui o Laboratório.
 * Cada PID selecionado recebe cinco tentativas sequenciais; só 5/5 respostas
 * válidas contam como PID verificado. PIDs não anunciados não são consultados.
 */
export async function runStartupPidPreflight(
  connection: Pick<SharedObdConnection, 'session' | 'supportedPids' | 'ecuValidated'>,
  options: StartupPidPreflightOptions = {},
): Promise<StartupPidPreflightSnapshot> {
  const supportedSet = new Set(connection.supportedPids.map(normalizeSensorPid));
  const unsupportedPids = STARTUP_PID_PREFLIGHT_PIDS.filter((pid) => !supportedSet.has(pid));
  const allowlisted = new Set<string>(STARTUP_PID_PREFLIGHT_PIDS);
  const plan = createSensorTestPlan(
    connection.supportedPids,
    (pid) => allowlisted.has(normalizeSensorPid(pid)) && Boolean(getPidDefinition(pid)),
  );

  let current: StartupPidPreflightSnapshot = {
    ...INITIAL_STARTUP_PID_PREFLIGHT,
    status: 'running',
    totalPids: plan.length,
    unsupportedPids: [...unsupportedPids],
    message: null,
  };
  const emit = () => options.onProgress?.(snapshotCopy(current));
  const wasCancelled = () => options.shouldCancel?.() === true;

  if (!connection.ecuValidated) {
    return {
      ...current,
      status: 'partial',
      message: 'A ECU não foi validada por uma resposta OBD real; a verificação inicial não foi executada.',
    };
  }

  if (plan.length === 0) {
    return {
      ...current,
      status: 'partial',
      message: 'A ECU não anunciou PIDs essenciais deste painel na bitmap de suporte. Nenhum PID opcional foi consultado.',
    };
  }

  emit();
  for (const test of plan) {
    let validReadings = 0;
    let attempts = 0;
    current = {
      ...current,
      currentPid: test.pid,
      currentLabel: test.label,
      currentAttempt: 0,
      validReadings: 0,
    };
    emit();

    for (let round = 1; round <= MIN_SENSOR_TEST_READINGS; round += 1) {
      if (wasCancelled()) {
        current = {
          ...current,
          status: 'partial',
          cancelled: true,
          currentAttempt: attempts,
          validReadings,
          message: 'A verificação inicial foi interrompida pelo limite de tempo; os dados ausentes não foram convertidos em zero.',
        };
        emit();
        return snapshotCopy(current);
      }

      attempts += 1;
      current = { ...current, currentAttempt: round, validReadings };
      emit();

      try {
        const response = await connection.session.queryPid(test.pid);
        if (
          response.commandStatus === 'OK'
          && response.parsed.status === 'RESPONDEU'
          && response.parsed.value !== null
          && Number.isFinite(response.parsed.value)
        ) {
          validReadings += 1;
        }
      } catch {
        // Uma falha conta como tentativa sem resposta, não como valor zero.
      }

      current = { ...current, currentAttempt: round, validReadings };
      emit();
    }

    if (validReadings === MIN_SENSOR_TEST_READINGS) {
      current = { ...current, verifiedPids: [...current.verifiedPids, test.pid] };
    } else {
      current = { ...current, failedPids: [...current.failedPids, test.pid] };
    }
    current = {
      ...current,
      completedPids: current.completedPids + 1,
      currentPid: null,
      currentLabel: null,
      currentAttempt: 0,
      validReadings: 0,
    };
    emit();
  }

  const successful = current.failedPids.length === 0 && current.verifiedPids.length === plan.length;
  current = {
    ...current,
    status: successful ? 'complete' : 'partial',
    message: successful
      ? 'Todos os PIDs essenciais anunciados foram lidos cinco vezes com resposta numérica válida.'
      : 'Um ou mais PIDs essenciais não completaram cinco respostas válidas. A ECU continua separada do resultado de cada PID.',
  };
  emit();
  return snapshotCopy(current);
}
