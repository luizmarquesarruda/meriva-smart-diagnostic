import * as FileSystem from 'expo-file-system';
import type { MaintenanceRecord, MaintenanceTaskId } from '../maintenance/maintenanceRules';
import { MAINTENANCE_TASKS } from '../maintenance/maintenanceRules';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';

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
  storageWarning?: string;
}

export const EMPTY_MAINTENANCE_DATA: MaintenanceData = {
  currentOdometerKm: null,
  severeUse: false,
  records: {},
  fuelings: [],
  updatedAt: null,
};

const MAINTENANCE_SCHEMA_VERSION = 1;
const isNonNegativeFinite = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0;

function isLocalDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day, 12);
  return date.getFullYear() === year && date.getMonth() === month - 1 && date.getDate() === day;
}

function normalizeRecord(value: unknown): MaintenanceRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<MaintenanceRecord>;
  const date = raw.lastServiceAt == null ? null : isLocalDate(raw.lastServiceAt) ? raw.lastServiceAt : undefined;
  const odometer = raw.lastServiceOdometerKm == null
    ? null
    : isNonNegativeFinite(raw.lastServiceOdometerKm) ? raw.lastServiceOdometerKm : undefined;
  if (date === undefined || odometer === undefined || (!date && odometer == null)) return null;
  return { lastServiceAt: date, lastServiceOdometerKm: odometer };
}

function normalizeFueling(value: unknown): FuelingRecord | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<FuelingRecord>;
  if (
    typeof raw.id !== 'string' || !raw.id.trim() ||
    typeof raw.occurredAt !== 'string' || !Number.isFinite(Date.parse(raw.occurredAt)) ||
    !isNonNegativeFinite(raw.odometerKm) ||
    typeof raw.liters !== 'number' || !Number.isFinite(raw.liters) || raw.liters <= 0 ||
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

function normalizeMaintenanceDocument(value: unknown): MaintenanceData | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const raw = value as Partial<MaintenanceData> & { schemaVersion?: unknown };
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== MAINTENANCE_SCHEMA_VERSION) return null;
  if (raw.currentOdometerKm != null && !isNonNegativeFinite(raw.currentOdometerKm)) return null;
  if (raw.severeUse !== undefined && typeof raw.severeUse !== 'boolean') return null;
  if (raw.records !== undefined && (!raw.records || typeof raw.records !== 'object' || Array.isArray(raw.records))) return null;
  if (raw.fuelings !== undefined && !Array.isArray(raw.fuelings)) return null;

  const allowedIds = new Set(MAINTENANCE_TASKS.map((task) => task.id));
  const records: MaintenanceData['records'] = {};
  for (const [key, record] of Object.entries(raw.records ?? {})) {
    if (!allowedIds.has(key as MaintenanceTaskId)) return null;
    const normalized = normalizeRecord(record);
    if (!normalized) return null;
    records[key as MaintenanceTaskId] = normalized;
  }

  const rawFuelings = raw.fuelings ?? [];
  const fuelings = rawFuelings.map(normalizeFueling);
  if (fuelings.some((item) => item === null)) return null;

  return {
    currentOdometerKm: raw.currentOdometerKm ?? null,
    severeUse: raw.severeUse === true,
    records,
    fuelings: fuelings as FuelingRecord[],
    updatedAt: typeof raw.updatedAt === 'string' && Number.isFinite(Date.parse(raw.updatedAt))
      ? raw.updatedAt
      : null,
  };
}

function isValidMaintenanceDocument(value: unknown): value is MaintenanceData & { schemaVersion?: number } {
  return normalizeMaintenanceDocument(value) !== null;
}

function isFutureMaintenanceDocument(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > MAINTENANCE_SCHEMA_VERSION;
}

async function targetPath(basePath: string): Promise<string> {
  const target = `${basePath}/MANUTENCAO/registros.json`;
  await FileSystem.makeDirectoryAsync(`${basePath}/MANUTENCAO`, { intermediates: true });
  return target;
}

export async function readMaintenanceData(basePath: string): Promise<MaintenanceData> {
  const target = await targetPath(basePath);
  const result = await readJsonWithRecovery(target, isValidMaintenanceDocument, isFutureMaintenanceDocument);
  const normalized = result.value ? normalizeMaintenanceDocument(result.value) : null;
  if (!normalized) return { ...EMPTY_MAINTENANCE_DATA };
  return result.recoveredFromPrevious
    ? { ...normalized, storageWarning: 'HISTÓRICO RECUPERADO DA CÓPIA ANTERIOR; O ARQUIVO PRINCIPAL FOI PRESERVADO.' }
    : normalized;
}

export async function writeMaintenanceData(basePath: string, data: MaintenanceData): Promise<void> {
  const target = await targetPath(basePath);
  const fuelings = data.fuelings.map(normalizeFueling);
  if (fuelings.some((item) => item === null)) {
    throw new Error('MANUTENCAO_CONTEM_ABASTECIMENTO_INVALIDO; DADOS_NAO_SUBSTITUIDOS.');
  }
  const next: MaintenanceData & { schemaVersion?: number } = {
    schemaVersion: MAINTENANCE_SCHEMA_VERSION,
    currentOdometerKm: isNonNegativeFinite(data.currentOdometerKm) ? data.currentOdometerKm : null,
    severeUse: data.severeUse === true,
    records: data.records,
    fuelings: fuelings as FuelingRecord[],
    updatedAt: new Date().toISOString(),
  };
  await writeJsonAtomically<MaintenanceData & { schemaVersion?: number }>(
    target, next, isValidMaintenanceDocument, isFutureMaintenanceDocument,
  );
}
