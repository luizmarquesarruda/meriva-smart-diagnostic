import * as FileSystem from 'expo-file-system';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';

function csv(value: unknown): string {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

async function ensureExportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/BACKUP/EXPORTS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function exportDiagnosticsJson(basePath: string): Promise<string> {
  const state = getAutoSaveState();
  const dtcs = await readDtcs(basePath);
  const driveCycles = await readDriveCycles(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/diagnostic_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify({
    exportedAt: new Date().toISOString(),
    vehicle: state.vehicle,
    obd: state.obd,
    lastReadings: state.lastReadings,
    dtcs,
    driveCycles,
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
      csv(cycle.startedAt),
      csv(cycle.finishedAt),
      csv(cycle.distanceTotalKm),
      csv(cycle.fuelUsedL),
      csv(cycle.avgFuelConsumptionKml),
      csv(cycle.source),
      csv(cycle.fuelRateSource),
    ].join(',')),
  ];
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}
