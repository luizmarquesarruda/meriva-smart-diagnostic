import { MERIVA_MANUAL } from '../database/merivaManual';

export const MAINTENANCE_TASKS = [
  {
    id: 'ENGINE_OIL',
    title: 'Óleo do motor e filtro',
    description: 'Use o óleo e a especificação indicados no manual do veículo.',
    normalIntervalKm: MERIVA_MANUAL.maintenance.normalOilChangeKm,
    normalIntervalMonths: MERIVA_MANUAL.maintenance.normalOilChangeMonths,
    severeIntervalKm: MERIVA_MANUAL.maintenance.severeOilChangeKm,
    severeIntervalMonths: MERIVA_MANUAL.maintenance.severeOilChangeMonths,
  },
  {
    id: 'GENERAL_INSPECTION',
    title: 'Revisão periódica',
    description: 'Verificação geral de segurança, filtros, freios e componentes.',
    normalIntervalKm: MERIVA_MANUAL.maintenance.normalInspectionKm,
    normalIntervalMonths: MERIVA_MANUAL.maintenance.normalInspectionMonths,
    severeIntervalKm: null,
    severeIntervalMonths: null,
  },
  {
    id: 'COOLANT',
    title: 'Líquido de arrefecimento',
    description: 'Inspecione o nível e a condição; troca conforme manual e produto utilizado.',
    normalIntervalKm: MERIVA_MANUAL.maintenance.coolantChangeKm,
    normalIntervalMonths: MERIVA_MANUAL.maintenance.coolantChangeYears * 12,
    severeIntervalKm: null,
    severeIntervalMonths: null,
  },
  {
    id: 'BRAKE_FLUID',
    title: 'Fluido de freio',
    description: 'Prazo de referência; confirme especificação e procedimento no manual.',
    normalIntervalKm: null,
    normalIntervalMonths: MERIVA_MANUAL.maintenance.brakeFluidChangeYears * 12,
    severeIntervalKm: null,
    severeIntervalMonths: null,
  },
  {
    id: 'TIRE_ROTATION',
    title: 'Rodízio dos pneus',
    description: 'Verifique desgaste, pressão e padrão de rodízio recomendado.',
    normalIntervalKm: MERIVA_MANUAL.maintenance.tireRotationMaxKm,
    normalIntervalMonths: null,
    severeIntervalKm: null,
    severeIntervalMonths: null,
  },
] as const;

export type MaintenanceTaskId = (typeof MAINTENANCE_TASKS)[number]['id'];

export interface MaintenanceTask {
  id: MaintenanceTaskId;
  title: string;
  description: string;
  intervalKm: number | null;
  intervalMonths: number | null;
}

export interface MaintenanceRecord {
  lastServiceAt: string | null;
  lastServiceOdometerKm: number | null;
}

export type MaintenanceEvaluationStatus = 'DUE' | 'UP_TO_DATE' | 'INCOMPLETE';

export interface MaintenanceEvaluation {
  status: MaintenanceEvaluationStatus;
  dueByKm: boolean;
  dueByDate: boolean;
  kmRemaining: number | null;
  dueDate: string | null;
  kmDueAt: number | null;
}

export function getMaintenanceTasks(severeUse = false): MaintenanceTask[] {
  return MAINTENANCE_TASKS.map((task) => ({
    id: task.id,
    title: task.title,
    description: task.description,
    intervalKm: severeUse && task.severeIntervalKm != null ? task.severeIntervalKm : task.normalIntervalKm,
    intervalMonths: severeUse && task.severeIntervalMonths != null ? task.severeIntervalMonths : task.normalIntervalMonths,
  }));
}

export function parseLocalDate(value: string | null | undefined): Date | null {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map(Number);
  const parsed = new Date(year, month - 1, day, 12, 0, 0, 0);
  if (parsed.getFullYear() !== year || parsed.getMonth() !== month - 1 || parsed.getDate() !== day) return null;
  return parsed;
}

export function addCalendarMonths(date: Date, months: number): Date {
  const targetFirst = new Date(date.getFullYear(), date.getMonth() + months, 1, 12, 0, 0, 0);
  const lastTargetDay = new Date(targetFirst.getFullYear(), targetFirst.getMonth() + 1, 0, 12, 0, 0, 0).getDate();
  targetFirst.setDate(Math.min(date.getDate(), lastTargetDay));
  return targetFirst;
}

export function evaluateMaintenance(
  task: MaintenanceTask,
  record: MaintenanceRecord | null | undefined,
  currentOdometerKm: number | null,
  now = new Date(),
): MaintenanceEvaluation {
  let dueByKm = false;
  let dueByDate = false;
  let kmRemaining: number | null = null;
  let dueDate: string | null = null;
  let kmDueAt: number | null = null;
  let kmEvaluated = task.intervalKm == null;
  let dateEvaluated = task.intervalMonths == null;

  const lastOdometer = record?.lastServiceOdometerKm;
  if (
    task.intervalKm != null &&
    typeof lastOdometer === 'number' &&
    Number.isFinite(lastOdometer) &&
    lastOdometer >= 0 &&
    currentOdometerKm != null &&
    Number.isFinite(currentOdometerKm) &&
    currentOdometerKm >= 0
  ) {
    kmEvaluated = true;
    kmDueAt = lastOdometer + task.intervalKm;
    kmRemaining = Math.max(0, kmDueAt - currentOdometerKm);
    dueByKm = currentOdometerKm >= kmDueAt;
  }

  const lastServiceDate = parseLocalDate(record?.lastServiceAt);
  if (task.intervalMonths != null && lastServiceDate) {
    dateEvaluated = true;
    const due = addCalendarMonths(lastServiceDate, task.intervalMonths);
    dueDate = [
      String(due.getFullYear()).padStart(4, '0'),
      String(due.getMonth() + 1).padStart(2, '0'),
      String(due.getDate()).padStart(2, '0'),
    ].join('-');
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 12, 0, 0, 0);
    dueByDate = today.getTime() >= due.getTime();
  }

  const status: MaintenanceEvaluationStatus = dueByKm || dueByDate
    ? 'DUE'
    : kmEvaluated && dateEvaluated && (task.intervalKm != null || task.intervalMonths != null)
      ? 'UP_TO_DATE'
      : 'INCOMPLETE';

  return { status, dueByKm, dueByDate, kmRemaining, dueDate, kmDueAt };
}
