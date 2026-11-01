import * as FileSystem from 'expo-file-system';
import type { MaintenanceRecord, MaintenanceTaskId } from '../maintenance/maintenanceRules';
import { MAINTENANCE_TASKS } from '../maintenance/maintenanceRules';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';
import { recordStorageHealthIssue } from '../storage/storageHealth';

export type FuelingType = 'GASOLINA' | 'ETANOL';

export interface FuelingRecord {
  id: string;
  occurredAt: string;
  odometerKm: number;
  liters: number;
  totalCost: number | null;
  type: FuelingType;
}

export interface MaintenanceData {
  currentOdometerKm: number | null;
  severeUse: boolean;
  records: Partial<Record<MaintenanceTaskId, MaintenanceRecord>>;
  fuelings: FuelingRecord[];
  updatedAt: string | null;
}

export const EMPTY_MAINTENANCE_DATA: MaintenanceData = {
  currentOdometerKm: null,
  severeUse: false,
  records: {},
  fuelings: [],
  updatedAt: null,
};
const MAINTENANCE_SCHEMA_VERSION = 1;
type StoredMaintenanceData = MaintenanceData & { schemaVersion?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isMaintenanceData(value: unknown): value is StoredMaintenanceData {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== undefined &&
      (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 0)) return false;
  if (!(
    (value.currentOdometerKm === null ||
      (typeof value.currentOdometerKm === 'number' && Number.isFinite(value.currentOdometerKm) && value.currentOdometerKm >= 0)) &&
    typeof value.severeUse === 'boolean' &&
    isRecord(value.records) &&
    Array.isArray(value.fuelings) &&
    (value.updatedAt === null ||
      (typeof value.updatedAt === 'string' && Number.isFinite(Date.parse(value.updatedAt))))
  )) return false;

  const allowedIds = new Set(MAINTENANCE_TASKS.map((task) => task.id));
  return Object.entries(value.records).every(([key, record]) =>
    allowedIds.has(key as MaintenanceTaskId) && normalizeRecord(record) !== null,
  ) && value.fuelings.every((item) => normalizeFueling(item) !== null);
}

function hasFutureMaintenanceSchema(value: unknown): boolean {
  return isRecord(value) && typeof value.schemaVersion === 'number'
    && value.schemaVersion > MAINTENANCE_SCHEMA_VERSION;
}


const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function normalizeRecord(value: unknown): MaintenanceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<MaintenanceRecord>;
  const date = typeof raw.lastServiceAt === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(raw.lastServiceAt)
    ? raw.lastServiceAt
    : null;
  const odometer = isNonNegativeFinite(raw.lastServiceOdometerKm) ? raw.lastServiceOdometerKm : null;
  if (!date && odometer == null) return null;
  return { lastServiceAt: date, lastServiceOdometerKm: odometer };
}

function normalizeFueling(value: unknown): FuelingRecord | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<FuelingRecord>;
  if (
    typeof raw.id !== 'string' ||
    typeof raw.occurredAt !== 'string' ||
    !Number.isFinite(Date.parse(raw.occurredAt)) ||
    !isNonNegativeFinite(raw.odometerKm) ||
    typeof raw.liters !== 'number' ||
    !Number.isFinite(raw.liters) ||
    raw.liters <= 0 ||
    (raw.type !== 'GASOLINA' && raw.type !== 'ETANOL') ||
    (raw.totalCost != null && !isNonNegativeFinite(raw.totalCost))
  ) return null;
  return {
    id: raw.id,
    occurredAt: raw.occurredAt,
    odometerKm: raw.odometerKm,
    liters: raw.liters,
    totalCost: raw.totalCost ?? null,
    type: raw.type,
  };
}

async function targetPath(basePath: string): Promise<string> {
  const target = `${basePath}/MANUTENCAO/registros.json`;
  await FileSystem.makeDirectoryAsync(`${basePath}/MANUTENCAO`, { intermediates: true });
  return target;
}

export async function readMaintenanceData(basePath: string): Promise<MaintenanceData> {
  const target = await targetPath(basePath);
  let parsed: StoredMaintenanceData | null;
  try {
    const result = await readJsonWithRecovery(target, isMaintenanceData, hasFutureMaintenanceSchema);
    parsed = result.value;
    if (result.recoveredFromPrevious) {
      recordStorageHealthIssue(
        'JSON_RECOVERED',
        'Manutenção recuperada da cópia anterior',
        'O arquivo principal está inválido. A cópia validada foi usada somente para leitura; a gravação permanece bloqueada.',
        'critical',
        'MANUTENCAO/registros.json',
      );
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const future = detail.includes('SCHEMA_VERSION_NEWER_THAN_APP');
    recordStorageHealthIssue(
      future ? 'FUTURE_SCHEMA' : 'JSON_CORRUPTED',
      future ? 'Schema futuro da manutenção' : 'JSON de manutenção inválido',
      detail + ' Os registros originais foram preservados; dados vazios não serão gravados sobre eles.',
      'critical',
      'MANUTENCAO/registros.json',
    );
    return { ...EMPTY_MAINTENANCE_DATA };
  }

  if (!parsed) return { ...EMPTY_MAINTENANCE_DATA };
  const allowedIds = new Set(MAINTENANCE_TASKS.map((task) => task.id));
  const records: MaintenanceData['records'] = {};
  if (parsed.records && typeof parsed.records === 'object') {
    for (const [key, value] of Object.entries(parsed.records)) {
      const normalized = normalizeRecord(value);
      if (allowedIds.has(key as MaintenanceTaskId) && normalized) records[key as MaintenanceTaskId] = normalized;
    }
  }
  const fuelings = Array.isArray(parsed.fuelings)
    ? parsed.fuelings.map(normalizeFueling).filter((item): item is FuelingRecord => item != null).slice(-100)
    : [];
  return {
    currentOdometerKm: isNonNegativeFinite(parsed.currentOdometerKm) ? parsed.currentOdometerKm : null,
    severeUse: parsed.severeUse === true,
    records,
    fuelings,
    updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : null,
  };
}
export async function writeMaintenanceData(basePath: string, data: MaintenanceData): Promise<void> {
  const target = await targetPath(basePath);
  const next: MaintenanceData = {
    currentOdometerKm: isNonNegativeFinite(data.currentOdometerKm) ? data.currentOdometerKm : null,
    severeUse: data.severeUse === true,
    records: data.records,
    fuelings: data.fuelings.map(normalizeFueling).filter((item): item is FuelingRecord => item != null).slice(-100),
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomically(
    target,
    { ...next, schemaVersion: MAINTENANCE_SCHEMA_VERSION },
    isMaintenanceData,
    hasFutureMaintenanceSchema,
  );
}
