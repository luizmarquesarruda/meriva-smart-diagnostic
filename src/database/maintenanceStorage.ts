import * as FileSystem from 'expo-file-system';
import type { MaintenanceRecord, MaintenanceTaskId } from '../maintenance/maintenanceRules';
import { MAINTENANCE_TASKS } from '../maintenance/maintenanceRules';

export type FuelingType = 'GASOLINA' | 'ETANOL';

export interface FuelingRecord {
  id: string;
  occurredAt: string;
  odometerKm: number;
  liters: number;
  totalCost: number | null;
  type: FuelingType;
  /** True only when the driver confirms the tank was filled to full. */
  fullTank?: boolean;
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
    fullTank: raw.fullTank === true,
  };
}

async function targetPath(basePath: string): Promise<string> {
  const target = `${basePath}/MANUTENCAO/registros.json`;
  await FileSystem.makeDirectoryAsync(`${basePath}/MANUTENCAO`, { intermediates: true });
  return target;
}

export async function readMaintenanceData(basePath: string): Promise<MaintenanceData> {
  const target = await targetPath(basePath);
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists || info.isDirectory) return { ...EMPTY_MAINTENANCE_DATA };
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 })) as Partial<MaintenanceData>;
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
  } catch {
    // Preserve corrupted input for later inspection/export; the UI can still be opened.
    return { ...EMPTY_MAINTENANCE_DATA };
  }
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
  await FileSystem.writeAsStringAsync(target, JSON.stringify(next, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}
