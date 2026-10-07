import type { VehicleProfile } from '../database/vehicleConfig';
import type { DriveCycle } from '../data/driveCycles';
import type { DtcRecord } from '../types/sourceTypes';
import type { MerivaLearningProfile } from '../database/learningProfile';

export interface LastPidReading {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  status: string;
  timestamp: string;
  source: 'REAL' | 'SIMULACAO';
}

export interface ObdConnectionState {
  connected: boolean;
  adapterName?: string;
  protocol?: string;
  ecuAddress?: string;
  lastConnectedAt?: string;
}

export interface PidDiscoveryCache {
  supportedPids: string[];
  protocol: string;
  discoveredAt: string;
}

export interface AutonomyReading {
  id: string;
  timestamp: string;
  distanceKm: number;
  fuelUsedL: number;
  consumptionKml: number;
  estimatedRangeKm: number;
  source: 'REAL_OBD';
}

export interface AutonomyState {
  tankCapacityL: number;
  cumulativeDistanceKm: number;
  cumulativeFuelUsedL: number;
  averageConsumptionKml: number;
  estimatedRangeKm: number;
  fuelLevelPercent: number | null;
  fuelRemainingL: number | null;
  fuelReserve: boolean | null;
  realReadingCount: number;
  lastReadingAt: string | null;
  readings: AutonomyReading[];
}

export interface MerivaPersistedState {
  vehicle: VehicleProfile | null;
  obd: ObdConnectionState;
  lastReadings: LastPidReading[];
  dtcs: DtcRecord[];
  driveCycles: DriveCycle[];
  learning: MerivaLearningProfile | null;
  pidDiscovery: PidDiscoveryCache | null;
  autonomy: AutonomyState;
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
    pidDiscovery: null,
    autonomy: {
      tankCapacityL: 56,
      cumulativeDistanceKm: 0,
      cumulativeFuelUsedL: 0,
      averageConsumptionKml: 0,
      estimatedRangeKm: 0,
      fuelLevelPercent: null,
      fuelRemainingL: null,
      fuelReserve: null,
      realReadingCount: 0,
      lastReadingAt: null,
      readings: [],
    },
    settings: {},
    metadata: { savedAt: '', appVersion: '1.0.1' },
  };
}
