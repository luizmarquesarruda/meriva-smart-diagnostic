import * as FileSystem from 'expo-file-system';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';
import { escapeCsvCell } from './csvEncoding';
import { readMaintenanceData } from '../database/maintenanceStorage';
import { buildDiagnosticExportDocument } from './diagnosticExportContract';

async function ensureExportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/BACKUP/EXPORTS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function exportDiagnosticsJson(basePath: string): Promise<string> {
  const stateSnapshotAt = new Date().toISOString();
  // Keep one immutable in-memory snapshot while asynchronous files are read.
  const liveState = getAutoSaveState();
  const state = JSON.parse(JSON.stringify(liveState)) as typeof liveState;
  const [dtcs, driveCycles, maintenance] = await Promise.all([
    readDtcs(basePath),
    readDriveCycles(basePath),
    readMaintenanceData(basePath),
  ]);
  const constants = (Platform as unknown as { constants?: Record<string, unknown> }).constants ?? {};
  const getPlatformValue = (key: string): string | undefined => {
    const value = constants[key];
    return typeof value === 'string' || typeof value === 'number' ? String(value) : undefined;
  };
  const exportedAt = new Date().toISOString();
  const document = buildDiagnosticExportDocument({
    exportedAt,
    stateSnapshotAt,
    appVersion: Constants.expoConfig?.version ?? 'N/D',
    platform: {
      os: Platform.OS,
      androidRelease: getPlatformValue('Release'),
      apiLevel: Platform.OS === 'android' ? Platform.Version : undefined,
      manufacturer: getPlatformValue('Manufacturer'),
      model: getPlatformValue('Model') ?? Constants.deviceName ?? undefined,
    },
    vehicle: state.vehicle,
    obd: state.obd,
    lastReadings: state.lastReadings,
    dtcs,
    driveCycles,
    autonomy: state.autonomy,
    maintenance,
  });
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/diagnostic_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify(document, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
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
