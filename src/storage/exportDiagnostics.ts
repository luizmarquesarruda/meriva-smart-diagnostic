import * as FileSystem from 'expo-file-system';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';
import { readMaintenanceData } from '../database/maintenanceStorage';
import { escapeCsvCell } from './csvEncoding';

async function ensureExportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/BACKUP/EXPORTS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function exportDiagnosticsJson(basePath: string): Promise<string> {
  const state = getAutoSaveState();
  const dtcs = await readDtcs(basePath);
  const driveCycles = await readDriveCycles(basePath);
  const maintenance = await readMaintenanceData(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/diagnostic_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify({
    exportedAt: new Date().toISOString(),
    vehicle: state.vehicle,
    obd: state.obd,
    lastReadings: state.lastReadings,
    dtcs,
    driveCycles,
    maintenance,
    autonomy: state.autonomy,
    sourcePolicy: {
      realObd: 'REAL_OBD',
      importedReference: 'CARSCANNER_SEED',
    },
  }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

export async function exportDriveCyclesCsv(basePath: string): Promise<string> {
  const cycles = await readDriveCycles(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/drive_cycles_${Date.now()}.csv`;
  const header = ['startedAt','finishedAt','distanceKm','fuelUsedL','consumptionKml','source','fuelRateSource'];
  const lines = [
    header.join(','),
    ...cycles.map((cycle) => [
      escapeCsvCell(cycle.startedAt),
      escapeCsvCell(cycle.finishedAt),
      escapeCsvCell(cycle.distanceTotalKm),
      escapeCsvCell(cycle.fuelUsedL),
      escapeCsvCell(cycle.avgFuelConsumptionKml),
      escapeCsvCell(cycle.source),
      escapeCsvCell(cycle.fuelRateSource),
    ].join(',')),
  ];
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}
