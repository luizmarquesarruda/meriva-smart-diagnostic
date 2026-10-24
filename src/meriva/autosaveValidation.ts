// MERIVA SMART DIAGNOSTIC — Validação e recuperação de envelope (módulo puro)
// Arquivo para copiar em: <repo>/src/meriva/autosaveValidation.ts
//
// Sem dependências nativas — testável fora do runtime do Expo.

import type { AutoSaveEnvelope } from './autosaveTypes';
import type { MerivaPersistedState } from './autosaveState';
import { createEmptyMerivaState } from './autosaveState';
import { AUTOSAVE_DATA_TYPE, AUTOSAVE_SOURCE } from './autosaveTypes';

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isFiniteNonNegative(value: unknown): boolean {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

export function isValidEnvelope(value: unknown): value is AutoSaveEnvelope<MerivaPersistedState> {
  if (!isRecord(value)) return false;
  const env = value as Partial<AutoSaveEnvelope<MerivaPersistedState>>;
  const savedAtMs = typeof env.savedAt === 'string' ? Date.parse(env.savedAt) : Number.NaN;
  return (
    Number.isInteger(env.schemaVersion) &&
    (env.schemaVersion as number) >= 0 &&
    env.dataType === AUTOSAVE_DATA_TYPE &&
    typeof env.source === 'string' && env.source.trim().length > 0 &&
    Number.isFinite(savedAtMs) &&
    isRecord(env.payload)
  );
}

function validateReadings(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.pid === 'string' &&
      typeof item.name === 'string' &&
      (item.value === null || (typeof item.value === 'number' && Number.isFinite(item.value))) &&
      typeof item.unit === 'string' &&
      typeof item.status === 'string' &&
      typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)) &&
      (item.source === 'REAL' || item.source === 'SIMULACAO');
  });
}

function validateDriveCycles(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item)) return false;
    const validDate = (entry: unknown): boolean =>
      typeof entry === 'string' && entry.trim().length > 0 && Number.isFinite(Date.parse(entry));
    const nonNegativeFields = [
      'distanceTotalKm', 'distanceIceKm', 'fuelUsedL',
      'avgDrivingSpeedKmh', 'avgFuelConsumptionKml',
    ];
    return typeof item.id === 'string' && item.id.length > 0 &&
      validDate(item.startedAt) && validDate(item.finishedAt) &&
      nonNegativeFields.every((key) => isFiniteNonNegative(item[key])) &&
      typeof item.totalTimeHms === 'string' &&
      typeof item.drivingTimeHms === 'string' &&
      typeof item.standingTimeHms === 'string' &&
      (item.fuelDataValid === undefined || typeof item.fuelDataValid === 'boolean') &&
      ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(String(item.source)) &&
      validDate(item.importedAt);
  });
}

function validateDtcs(value: unknown): boolean {
  return Array.isArray(value) && value.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.code === 'string' && item.code.length > 0 &&
      typeof item.status === 'string' &&
      typeof item.firstSeen === 'string' &&
      typeof item.lastSeen === 'string' &&
      Number.isInteger(item.occurrences) &&
      typeof item.occurrences === 'number' && item.occurrences >= 0 &&
      typeof item.source === 'string' &&
      typeof item.historical === 'boolean' &&
      (item.confirmed === undefined || typeof item.confirmed === 'boolean') &&
      (item.freezeFrame === undefined || item.freezeFrame === null || isRecord(item.freezeFrame));
  });
}

function validateAutonomy(value: unknown): boolean {
  if (!isRecord(value)) return false;
  const nonNegativeKeys = [
    'tankCapacityL', 'cumulativeDistanceKm', 'cumulativeFuelUsedL',
    'averageConsumptionKml', 'estimatedRangeKm', 'realReadingCount',
  ];
  if (nonNegativeKeys.some((key) => key in value && !isFiniteNonNegative(value[key]))) return false;
  if ('fuelLevelPercent' in value && value.fuelLevelPercent !== null &&
      (typeof value.fuelLevelPercent !== 'number' || !Number.isFinite(value.fuelLevelPercent) ||
       value.fuelLevelPercent < 0 || value.fuelLevelPercent > 100)) return false;
  if ('readings' in value && !Array.isArray(value.readings)) return false;
  if (Array.isArray(value.readings) && !value.readings.every((item) => {
    if (!isRecord(item)) return false;
    return typeof item.id === 'string' &&
      typeof item.timestamp === 'string' && Number.isFinite(Date.parse(item.timestamp)) &&
      isFiniteNonNegative(item.distanceKm) &&
      isFiniteNonNegative(item.fuelUsedL) &&
      isFiniteNonNegative(item.consumptionKml) &&
      isFiniteNonNegative(item.estimatedRangeKm) &&
      item.source === 'REAL_OBD';
  })) return false;
  return true;
}

export function validatePayload(payload: MerivaPersistedState): boolean {
  if (!isRecord(payload)) return false;
  if (!('vehicle' in payload) || !('obd' in payload) ||
      !Array.isArray(payload.lastReadings) ||
      !Array.isArray(payload.dtcs) ||
      !Array.isArray(payload.driveCycles)) return false;

  if (payload.vehicle !== null && !isRecord(payload.vehicle)) return false;
  if (!isRecord(payload.obd)) return false;
  if ('connected' in payload.obd && typeof payload.obd.connected !== 'boolean') return false;
  if (!validateReadings(payload.lastReadings)) return false;
  if (!validateDriveCycles(payload.driveCycles)) return false;
  if (!validateDtcs(payload.dtcs)) return false;

  if ('learning' in payload && payload.learning !== null && !isRecord(payload.learning)) return false;
  if ('pidDiscovery' in payload && payload.pidDiscovery !== null) {
    if (!isRecord(payload.pidDiscovery)) return false;
    if ('supportedPids' in payload.pidDiscovery &&
        (!Array.isArray(payload.pidDiscovery.supportedPids) ||
         !payload.pidDiscovery.supportedPids.every((pid) => typeof pid === 'string'))) return false;
  }
  if ('autonomy' in payload && !validateAutonomy(payload.autonomy)) return false;
  if ('settings' in payload && (!isRecord(payload.settings) ||
      Object.values(payload.settings).some((value) =>
        typeof value !== 'string' && typeof value !== 'boolean' &&
        !(typeof value === 'number' && Number.isFinite(value))))) return false;
  if ('metadata' in payload && !isRecord(payload.metadata)) return false;
  return true;
}

/** Preenche campos ausentes com valores padrão — tolera schema parcial. */
export function hydrateState(payload: MerivaPersistedState): MerivaPersistedState {
  const defaults = createEmptyMerivaState();
  const raw = payload as unknown as Record<string, unknown>;
  const obd = isRecord(raw.obd) ? raw.obd : {};
  const autonomy = isRecord(raw.autonomy) ? raw.autonomy : {};
  const metadata = isRecord(raw.metadata) ? raw.metadata : {};
  const settings = isRecord(raw.settings) ? raw.settings : {};
  const pidDiscovery = isRecord(raw.pidDiscovery) &&
    Array.isArray(raw.pidDiscovery.supportedPids) &&
    raw.pidDiscovery.supportedPids.every((pid) => typeof pid === 'string')
      ? raw.pidDiscovery as unknown as MerivaPersistedState['pidDiscovery']
      : null;

  return {
    ...defaults,
    ...payload,
    vehicle: isRecord(raw.vehicle) ? raw.vehicle as unknown as MerivaPersistedState['vehicle'] : null,
    obd: { ...defaults.obd, ...obd, connected: typeof obd.connected === 'boolean' ? obd.connected : false },
    lastReadings: Array.isArray(raw.lastReadings) ? raw.lastReadings as MerivaPersistedState['lastReadings'] : [],
    dtcs: Array.isArray(raw.dtcs) ? raw.dtcs as MerivaPersistedState['dtcs'] : [],
    driveCycles: Array.isArray(raw.driveCycles) ? raw.driveCycles as MerivaPersistedState['driveCycles'] : [],
    learning: isRecord(raw.learning) ? raw.learning as unknown as MerivaPersistedState['learning'] : null,
    pidDiscovery,
    autonomy: validateAutonomy(autonomy)
      ? {
          ...defaults.autonomy,
          ...autonomy,
          readings: Array.isArray(autonomy.readings)
            ? autonomy.readings as MerivaPersistedState['autonomy']['readings']
            : [],
        }
      : defaults.autonomy,
    settings: Object.fromEntries(Object.entries(settings).filter(([, value]) =>
      typeof value === 'string' || typeof value === 'boolean' ||
      (typeof value === 'number' && Number.isFinite(value)),
    )) as MerivaPersistedState['settings'],
    metadata: {
      ...defaults.metadata,
      ...metadata,
      savedAt: typeof metadata.savedAt === 'string' ? metadata.savedAt : defaults.metadata.savedAt,
      appVersion: typeof metadata.appVersion === 'string' ? metadata.appVersion : defaults.metadata.appVersion,
    },
  };
}

/**
 * Regra central de contaminação: SOMENTE dado real com resposta válida
 * (status RESPONDEU e valor numérico) pode alimentar aprendizado/banco.
 * Simulação e seed (qualquer outra fonte) nunca passam.
 */
export function shouldFeedLearning(
  source: 'REAL' | 'SIMULACAO',
  status: string,
  value: number | null,
): boolean {
  return source === 'REAL' && status === 'RESPONDEU' && value !== null;
}