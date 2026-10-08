export type DataSource = 'REAL_OBD' | 'CARSCANNER_BASELINE' | 'USER_REAL_OBSERVATION' | 'SIMULACAO' | 'IMPORTADO';
export type ConfidenceLevel = 'LOW' | 'MEDIUM' | 'GOOD' | 'HIGH';
export type DtcStatus = 'CONFIRMED' | 'PENDING' | 'PERMANENT' | 'INACTIVE' | 'HISTORICAL' | 'CURRENT' | 'UNKNOWN';
export type VehicleCondition = 'IDLE_COLD' | 'IDLE_WARM' | 'ACCELERATION' | 'CRUISE' | 'DECELERATION' | 'UNKNOWN';

export interface SourceMetadata {
  source: DataSource;
  timestamp: string;
  confidence: ConfidenceLevel;
  seedSamples: number;
  realSamples: number;
  totalSamples: number;
  historicalReference?: boolean;
  learningWeight?: 'HIGH' | 'MEDIUM' | 'LOW';
  lastUpdate: string;
}

export interface SampleStatistics {
  mean: number;
  median: number;
  min: number;
  max: number;
  stddev: number;
  samples: number;
  realSamples: number;
  seedSamples: number;
  confidence: ConfidenceLevel;
  lastUpdate: string;
  source: DataSource[];
  /** Janela limitada para cálculo de mediana sem crescimento infinito do perfil. */
  medianWindow?: number[];
}

export interface PidObservation {
  pid: string;
  name: string;
  value: number | null;
  unit: string;
  source: DataSource;
  timestamp: string;
  confidence: ConfidenceLevel;
  /** Estado da consulta OBD; quando presente, só RESPONDEU é evidência válida. */
  status?: string;
  derived?: boolean;
  derivedFrom?: string;
  errorMessage?: string;
}

export interface BaselineContext {
  condition: VehicleCondition;
  speed: number;
  rpm: number;
  coolant: number;
  iat: number;
  stft: number;
  ltft: number;
  map: number;
  maf: number;
  tps: number;
  timing: number;
  o2: number;
  sampleCount: number;
  source: DataSource;
  confidence: ConfidenceLevel;
}

export interface DtcRecord {
  code: string;
  description?: string;
  status: DtcStatus;
  firstSeen: string;
  lastSeen: string;
  occurrences: number;
  source: DataSource;
  historical: boolean;
  confirmed?: boolean;
  intermittent?: boolean;
  freezeFrame?: { frame: number; dtc: string | null; rpm: number | null; coolantC: number | null };
}

export interface ConsumptionReference {
  distance: number;
  fuel: number;
  consumption: number;
  date: string;
  source: DataSource;
  historicalReference: boolean;
  learningWeight: 'HIGH' | 'MEDIUM' | 'LOW';
}
