import type { VehicleProfile } from '../database/vehicleConfig';
import type { DriveCycle } from '../data/driveCycles';
import type { DtcRecord } from '../database/dtcManager';
import type { MerivaLearningProfile } from '../database/learningProfile';

export interface LastPidReading {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  status: string;
  timestamp: string;
}

export interface ObdConnectionState {
  connected: boolean;
  adapterName?: string;
  protocol?: string;
  ecuAddress?: string;
  lastConnectedAt?: string;
}

export interface MerivaPersistedState {
  vehicle: VehicleProfile | null;
  obd: ObdConnectionState;
  lastReadings: LastPidReading[];
  dtcs: DtcRecord[];
  driveCycles: DriveCycle[];
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
    metadata: { savedAt: '', appVersion: '1.0.1' },
  };
}
