import * as FileSystem from 'expo-file-system';
import schedule from '../knowledge/meriva_maintenance.json';

export interface MaintenanceRecord { itemId: string; changedAtKm: number; changedAt: string; }
export interface MaintenanceState { vehicleOdometerKm: number | null; severeUse: boolean; records: MaintenanceRecord[]; lastGpsDistanceKm: number; updatedAt: string | null; }
const EMPTY: MaintenanceState = { vehicleOdometerKm: null, severeUse: false, records: [], lastGpsDistanceKm: 0, updatedAt: null };
function validKm(value: unknown): value is number { return typeof value === 'number' && Number.isFinite(value) && value >= 0; }
function normalize(value: unknown): MaintenanceState {
  if (!value || typeof value !== 'object') return { ...EMPTY };
  const v = value as Partial<MaintenanceState>;
  return { vehicleOdometerKm: validKm(v.vehicleOdometerKm) ? v.vehicleOdometerKm : null, severeUse: v.severeUse === true, records: Array.isArray(v.records) ? v.records.filter((r): r is MaintenanceRecord => !!r && typeof r.itemId === 'string' && validKm(r.changedAtKm) && typeof r.changedAt === 'string') : [], lastGpsDistanceKm: validKm(v.lastGpsDistanceKm) ? v.lastGpsDistanceKm : 0, updatedAt: typeof v.updatedAt === 'string' ? v.updatedAt : null };
}
async function statePath(basePath: string): Promise<string> { const dir = basePath + '/MANUTENCAO'; await FileSystem.makeDirectoryAsync(dir, { intermediates: true }); return dir + '/maintenance.json'; }
export async function readMaintenanceState(basePath: string): Promise<MaintenanceState> { const target = await statePath(basePath); try { const info = await FileSystem.getInfoAsync(target); if (!info.exists || info.isDirectory) return { ...EMPTY }; return normalize(JSON.parse(await FileSystem.readAsStringAsync(target))); } catch { return { ...EMPTY }; } }
export async function writeMaintenanceState(basePath: string, state: MaintenanceState): Promise<void> { const target = await statePath(basePath); const next = normalize({ ...state, updatedAt: new Date().toISOString() }); await FileSystem.writeAsStringAsync(target, JSON.stringify(next, null, 2), { encoding: FileSystem.EncodingType.UTF8 }); }
export async function setVehicleOdometer(basePath: string, km: number): Promise<MaintenanceState> { if (!validKm(km)) throw new Error('QUILOMETRAGEM INVÁLIDA.'); const state = await readMaintenanceState(basePath); state.vehicleOdometerKm = km; state.lastGpsDistanceKm = 0; await writeMaintenanceState(basePath, state); return state; }
export async function setSevereUse(basePath: string, severeUse: boolean): Promise<MaintenanceState> { const state = await readMaintenanceState(basePath); state.severeUse = severeUse; await writeMaintenanceState(basePath, state); return state; }
export async function recordMaintenance(basePath: string, itemId: string, changedAtKm: number): Promise<MaintenanceState> { if (!validKm(changedAtKm)) throw new Error('QUILOMETRAGEM DA TROCA INVÁLIDA.'); const state = await readMaintenanceState(basePath); state.records = [...state.records.filter((r) => r.itemId !== itemId), { itemId, changedAtKm, changedAt: new Date().toISOString() }]; if (state.vehicleOdometerKm == null || changedAtKm > state.vehicleOdometerKm) state.vehicleOdometerKm = changedAtKm; await writeMaintenanceState(basePath, state); return state; }
export async function addDrivenDistance(basePath: string, gpsDistanceKm: number): Promise<MaintenanceState> { if (!validKm(gpsDistanceKm)) return readMaintenanceState(basePath); const state = await readMaintenanceState(basePath); if (state.vehicleOdometerKm == null) return state; const delta = gpsDistanceKm >= state.lastGpsDistanceKm ? gpsDistanceKm - state.lastGpsDistanceKm : 0; state.lastGpsDistanceKm = gpsDistanceKm; if (delta > 0 && delta < 100) state.vehicleOdometerKm += delta; await writeMaintenanceState(basePath, state); return state; }
export interface MaintenanceItemStatus { item: (typeof schedule.items)[number]; lastKm: number | null; dueKm: number | null; remainingKm: number | null; overdueKm: number | null; status: 'SEM_HISTORICO' | 'OK' | 'PROXIMA' | 'VENCIDA'; note: string; }
function monthsAfter(iso: string, months: number): number { const date = new Date(iso); date.setMonth(date.getMonth() + months); return date.getTime(); }
export function getMaintenanceStatuses(state: MaintenanceState): MaintenanceItemStatus[] {
  const now = Date.now();
  return schedule.items.map((item) => {
    const record = state.records.find((r) => r.itemId === item.id);
    const lastKm = record?.changedAtKm ?? null;
    const kmInterval = item.id === 'oleo_motor' && state.severeUse ? item.intervalKmSevere : item.intervalKmNormal;
    const dueKm = lastKm != null && kmInterval ? lastKm + kmInterval : null;
    const remainingKm = dueKm != null && state.vehicleOdometerKm != null ? dueKm - state.vehicleOdometerKm : null;
    const overdueKm = remainingKm != null && remainingKm < 0 ? Math.abs(remainingKm) : null;
    if (!record) return { item, lastKm, dueKm, remainingKm, overdueKm, status: 'SEM_HISTORICO', note: item.sourceNote };
    if (item.intervalMonthsNormal && monthsAfter(record.changedAt, item.intervalMonthsNormal) <= now) return { item, lastKm, dueKm, remainingKm, overdueKm, status: 'VENCIDA', note: 'Prazo por tempo atingido. O manual manda usar o primeiro limite entre tempo e quilometragem.' };
    if (overdueKm != null) return { item, lastKm, dueKm, remainingKm, overdueKm, status: 'VENCIDA', note: item.sourceNote };
    const warningKm = kmInterval ? Math.max(1000, kmInterval * 0.1) : null;
    return { item, lastKm, dueKm, remainingKm, overdueKm, status: remainingKm != null && warningKm != null && remainingKm <= warningKm ? 'PROXIMA' : 'OK', note: item.sourceNote };
  });
}
export const maintenanceSchedule = schedule;