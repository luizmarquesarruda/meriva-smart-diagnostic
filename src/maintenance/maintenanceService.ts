import * as FileSystem from 'expo-file-system';
import schedule from '../knowledge/meriva_maintenance.json';

export interface MaintenanceRecord {
  id: string;
  itemId: string;
  changedAtKm: number;
  changedAt: string;
  brand?: string;
  location?: 'CASA' | 'OFICINA' | 'OUTRO';
  observation?: string;
}

export interface MaintenanceState {
  /** Hodômetro real informado pelo painel do veículo. */
  vehicleOdometerKm: number | null;
  /** Distância que o app confirmou/monitorou via GPS. Nunca altera o hodômetro. */
  monitoredDistanceKm: number;
  severeUse: boolean;
  records: MaintenanceRecord[];
  lastGpsDistanceKm: number;
  updatedAt: string | null;
}

const EMPTY: MaintenanceState = {
  vehicleOdometerKm: null,
  monitoredDistanceKm: 0,
  severeUse: false,
  records: [],
  lastGpsDistanceKm: 0,
  updatedAt: null,
};

function validKm(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function normalizeRecord(value: unknown, index: number): MaintenanceRecord | null {
  if (!value || typeof value !== 'object') return null;
  const r = value as Partial<MaintenanceRecord>;
  if (
    typeof r.itemId !== 'string' ||
    !validKm(r.changedAtKm) ||
    typeof r.changedAt !== 'string'
  ) return null;
  return {
    id: typeof r.id === 'string' && r.id ? r.id : `legacy-${r.itemId}-${r.changedAt}-${index}`,
    itemId: r.itemId,
    changedAtKm: r.changedAtKm,
    changedAt: r.changedAt,
    ...(typeof r.brand === 'string' && r.brand.trim() ? { brand: r.brand.trim() } : {}),
    ...(r.location === 'CASA' || r.location === 'OFICINA' || r.location === 'OUTRO'
      ? { location: r.location }
      : {}),
    ...(typeof r.observation === 'string' && r.observation.trim()
      ? { observation: r.observation.trim() }
      : {}),
  };
}

function normalize(value: unknown): MaintenanceState {
  if (!value || typeof value !== 'object') return { ...EMPTY };
  const v = value as Partial<MaintenanceState>;
  const records = Array.isArray(v.records)
    ? v.records.map(normalizeRecord).filter((r): r is MaintenanceRecord => r !== null)
    : [];
  return {
    vehicleOdometerKm: validKm(v.vehicleOdometerKm) ? v.vehicleOdometerKm : null,
    monitoredDistanceKm: validKm(v.monitoredDistanceKm) ? v.monitoredDistanceKm : 0,
    severeUse: v.severeUse === true,
    records,
    lastGpsDistanceKm: validKm(v.lastGpsDistanceKm) ? v.lastGpsDistanceKm : 0,
    updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null,
  };
}

async function statePath(basePath: string): Promise<string> {
  const dir = basePath + '/MANUTENCAO';
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir + '/maintenance.json';
}

export async function readMaintenanceState(basePath: string): Promise<MaintenanceState> {
  const target = await statePath(basePath);
  try {
    const info = await FileSystem.getInfoAsync(target);
    if (!info.exists || info.isDirectory) return { ...EMPTY };
    return normalize(JSON.parse(await FileSystem.readAsStringAsync(target)));
  } catch {
    return { ...EMPTY };
  }
}

export async function writeMaintenanceState(basePath: string, state: MaintenanceState): Promise<void> {
  const target = await statePath(basePath);
  const next = normalize({ ...state, updatedAt: new Date().toISOString() });
  await FileSystem.writeAsStringAsync(target, JSON.stringify(next, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export async function setVehicleOdometer(basePath: string, km: number): Promise<MaintenanceState> {
  if (!validKm(km)) throw new Error('QUILOMETRAGEM INVÁLIDA.');
  const state = await readMaintenanceState(basePath);
  state.vehicleOdometerKm = km;
  // Este valor é somente o hodômetro informado pelo painel. GPS nunca o altera.
  await writeMaintenanceState(basePath, state);
  return state;
}

export async function setSevereUse(basePath: string, severeUse: boolean): Promise<MaintenanceState> {
  const state = await readMaintenanceState(basePath);
  state.severeUse = severeUse;
  await writeMaintenanceState(basePath, state);
  return state;
}

export async function recordMaintenance(
  basePath: string,
  itemId: string,
  changedAtKm: number,
  details: Pick<MaintenanceRecord, 'brand' | 'location' | 'observation'> = {},
): Promise<MaintenanceState> {
  if (!validKm(changedAtKm)) throw new Error('QUILOMETRAGEM DA TROCA INVÁLIDA.');
  const state = await readMaintenanceState(basePath);
  const record: MaintenanceRecord = {
    id: `${itemId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    itemId,
    changedAtKm,
    changedAt: new Date().toISOString(),
    ...(details.brand?.trim() ? { brand: details.brand.trim() } : {}),
    ...(details.location ? { location: details.location } : {}),
    ...(details.observation?.trim() ? { observation: details.observation.trim() } : {}),
  };

  // A quilometragem da troca é histórica. Não altera o hodômetro atual.
  state.records = [...state.records, record];
  await writeMaintenanceState(basePath, state);
  return state;
}

export async function setGpsDistanceBaseline(
  basePath: string,
  gpsDistanceKm: number,
): Promise<MaintenanceState> {
  const state = await readMaintenanceState(basePath);
  state.lastGpsDistanceKm = validKm(gpsDistanceKm) ? gpsDistanceKm : 0;
  await writeMaintenanceState(basePath, state);
  return state;
}

export async function addDrivenDistance(
  basePath: string,
  gpsDistanceKm: number,
): Promise<MaintenanceState> {
  if (!validKm(gpsDistanceKm)) return readMaintenanceState(basePath);
  const state = await readMaintenanceState(basePath);
  if (state.vehicleOdometerKm == null) return state;

  // GPS é somente distância monitorada. Nunca incrementa o hodômetro real.
  if (gpsDistanceKm < state.lastGpsDistanceKm) {
    state.lastGpsDistanceKm = gpsDistanceKm;
    await writeMaintenanceState(basePath, state);
    return state;
  }

  const delta = gpsDistanceKm - state.lastGpsDistanceKm;
  state.lastGpsDistanceKm = gpsDistanceKm;
  if (delta > 0 && delta < 100) {
    state.monitoredDistanceKm = Number((state.monitoredDistanceKm + delta).toFixed(3));
  }
  await writeMaintenanceState(basePath, state);
  return state;
}

export interface MaintenanceItemStatus {
  item: (typeof schedule.items)[number];
  lastKm: number | null;
  dueKm: number | null;
  remainingKm: number | null;
  overdueKm: number | null;
  status: 'SEM_HISTORICO' | 'OK' | 'PROXIMA' | 'VENCIDA';
  note: string;
  lastRecord: MaintenanceRecord | null;
  dependentChangesSinceLast: number | null;
}

function monthsAfter(iso: string, months: number): number {
  const date = new Date(iso);
  date.setMonth(date.getMonth() + months);
  return date.getTime();
}

function latestRecord(records: MaintenanceRecord[], itemId: string): MaintenanceRecord | null {
  return records
    .filter((record) => record.itemId === itemId)
    .sort((a, b) => Date.parse(b.changedAt) - Date.parse(a.changedAt))[0] ?? null;
}

export function getMaintenanceStatuses(state: MaintenanceState): MaintenanceItemStatus[] {
  const now = Date.now();
  return schedule.items.map((item) => {
    const record = latestRecord(state.records, item.id);
    const lastKm = record?.changedAtKm ?? null;

    const kmInterval =
      item.id === 'oleo_motor' && state.severeUse
        ? item.intervalKmSevere
        : item.intervalKmNormal;

    let dueKm = lastKm != null && kmInterval ? lastKm + kmInterval : null;
    let dependentChangesSinceLast: number | null = null;

    if (item.dependsOnItemId && item.changeEveryDependentChanges) {
      const dependencyRecords = state.records
        .filter((r) => r.itemId === item.dependsOnItemId)
        .sort((a, b) => Date.parse(a.changedAt) - Date.parse(b.changedAt));

      if (!record) {
        dependentChangesSinceLast = dependencyRecords.length;
        if (item.firstChangeWithOil && dependencyRecords[0]) {
          dueKm = dependencyRecords[0].changedAtKm;
        }
      } else {
        const filterTime = Date.parse(record.changedAt);
        const changesSinceFilter = dependencyRecords.filter(
          (r) => Date.parse(r.changedAt) > filterTime,
        );
        dependentChangesSinceLast = changesSinceFilter.length;

        // After a filter change, the next filter is due on the Nth dependent change.
        const requiredChanges = item.changeEveryDependentChanges;
        const nextDependency = changesSinceFilter[requiredChanges - 1];
        if (nextDependency) {
          dueKm = nextDependency.changedAtKm;
        } else {
          const lastOil = latestRecord(state.records, item.dependsOnItemId);
          dueKm = lastOil && kmInterval ? lastOil.changedAtKm + kmInterval : null;
        }
      }
    }
    const remainingKm =
      dueKm != null && state.vehicleOdometerKm != null
        ? dueKm - state.vehicleOdometerKm
        : null;
    const overdueKm = remainingKm != null && remainingKm < 0 ? Math.abs(remainingKm) : null;

    if (!record) {
      return {
        item,
        lastKm,
        dueKm,
        remainingKm,
        overdueKm,
        status: 'SEM_HISTORICO',
        note: item.sourceNote,
        lastRecord: null,
        dependentChangesSinceLast,
      };
    }

    const intervalMonths = item.id === 'oleo_motor' && state.severeUse
      ? item.intervalMonthsSevere
      : item.intervalMonthsNormal;

    if (intervalMonths && monthsAfter(record.changedAt, intervalMonths) <= now) {
      return {
        item, lastKm, dueKm, remainingKm, overdueKm,
        status: 'VENCIDA',
        note: 'Prazo por tempo atingido. O manual manda usar o primeiro limite entre tempo e quilometragem.',
        lastRecord: record,
        dependentChangesSinceLast,
      };
    }

    if (overdueKm != null) {
      return {
        item, lastKm, dueKm, remainingKm, overdueKm,
        status: 'VENCIDA',
        note: item.sourceNote,
        lastRecord: record,
        dependentChangesSinceLast,
      };
    }

    const warningKm = kmInterval ? Math.max(1000, kmInterval * 0.1) : null;
    return {
      item,
      lastKm,
      dueKm,
      remainingKm,
      overdueKm,
      status:
        remainingKm != null && warningKm != null && remainingKm <= warningKm
          ? 'PROXIMA'
          : 'OK',
      note: item.sourceNote,
      lastRecord: record,
      dependentChangesSinceLast,
    };
  });
}

export const maintenanceSchedule = schedule;
