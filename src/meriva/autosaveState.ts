// MERIVA SMART DIAGNOSTIC — Estado persistível do aplicativo
// Arquivo para copiar em: <repo>/src/meriva/autosaveState.ts
//
// IMPORTANTE: os tipos vêm dos módulos que JÁ EXISTEM no repositório.
// Nada é duplicado — o autosave referencia as fontes de verdade atuais.
// Todos os imports são type-only: este módulo é puro (sem expo/react-native).

import type { VehicleProfile } from '../database/vehicleConfig';
import type { DriveCycle } from '../data/driveCycles';
import type { DtcRecord } from '../database/dtcManager';
import type { MerivaLearningProfile } from '../database/learningProfile';

/** Última leitura válida por PID (telemetria recente, não histórico). */
export interface LastPidReading {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  status: string;
  timestamp: string;
}

/** Estado da conexão OBD confirmado por comunicação real. */
export interface ObdConnectionState {
  connected: boolean;
  adapterName?: string;
  protocol?: string;
  ecuAddress?: string;
  lastConnectedAt?: string;
}

/**
 * Estado persistível. Campos são opcionais por seção para tolerar
 * evolução de schema sem quebrar o restore.
 */
export interface MerivaPersistedState {
  vehicle: VehicleProfile | null;
  obd: ObdConnectionState;
  lastReadings: LastPidReading[];
  dtcs: DtcRecord[];
  driveCycles: DriveCycle[]; // mantém o campo `source` — seeds permanecem identificados
  learning: MerivaLearningProfile | null;
  settings: Record<string, string | number | boolean>;
  metadata: { savedAt: string; appVersion: string };
}

export function createEmptyMerivaState(): MerivaPersistedState {
  return {
    vehicle: null,
    obd: { connected: false },
    lastReadings: [],
    dtcs: [],
    driveCycles: [],
    learning: null,
    settings: {},
    metadata: { savedAt: '', appVersion: '1.0.0' },
  };
}