import * as FileSystem from 'expo-file-system';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';
import { getAppBuildInfo } from '../meriva/buildInfo';

function csv(value: unknown): string {
  const text = String(value ?? '');
  return '"' + text.replace(/"/g, '""') + '"';
}

async function ensureExportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/BACKUP/EXPORTS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true }).catch(() => undefined);
  return dir;
}

export async function exportDiagnosticsJson(basePath: string, options: { shared?: boolean } = {}): Promise<string> {
  const state = getAutoSaveState();
  const dtcs = await readDtcs(basePath);
  const driveCycles = await readDriveCycles(basePath);
  const buildInfo = state.metadata?.buildInfo ?? getAppBuildInfo();
  const now = Date.now();
  const lastReadings = state.lastReadings.map((reading) => {
    const timestampMs = Date.parse(reading.timestamp);
    const ageMs = Number.isFinite(timestampMs) ? Math.max(0, now - timestampMs) : null;
    const quality = reading.status !== 'RESPONDEU' || reading.value == null
      ? 'ERROR' : ageMs != null && ageMs <= 10_000 ? 'FRESH' : 'STALE';
    return {
      ...reading,
      dataSource: reading.dataSource ?? (reading.source === 'REAL' ? 'REAL' : 'SIMULADO'),
      ageMs,
      quality,
    };
  });
  const vehicle = options.shared && state.vehicle ? { ...state.vehicle, vin: state.vehicle.vin ? '[REDACTED]' : undefined } : state.vehicle;
  const obd = options.shared ? {
    ...state.obd,
    adapterName: state.obd.adapterName ? '[REDACTED]' : undefined,
    ecuAddress: state.obd.ecuAddress ? '[REDACTED]' : undefined,
    ecuIdentification: state.obd.ecuIdentification ? '[REDACTED]' : undefined,
    ecuName: state.obd.ecuName ? '[REDACTED]' : undefined,
  } : state.obd;
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/diagnostic_${Date.now()}.json`;
  await FileSystem.writeAsStringAsync(path, JSON.stringify({
    schemaVersion: 1,
    exportVersion: 1,
    exportedAt: new Date().toISOString(),
    buildInfo,
    vehicle,
    obd,
    lastReadings,
    dtcs,
    driveCycles,
    autonomy: state.autonomy,
    sourcePolicy: { dataSourceValues: ['REAL', 'SIMULADO', 'REPLAY'] },
  }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

export async function exportDriveCyclesCsv(basePath: string): Promise<string> {
  const cycles = await readDriveCycles(basePath);
  const dir = await ensureExportDir(basePath);
  const path = `${dir}/drive_cycles_${Date.now()}.csv`;
  const build = getAppBuildInfo();
  const header = ['schemaVersion','exportVersion','startedAt','finishedAt','distanceKm','fuelUsedL','consumptionKml','source','fuelRateSource','buildSha','branch','versionCode','buildDate','deviceModel','androidVersion'];
  const lines = [
    header.join(','),
    ...cycles.map((cycle) => [
      csv(1),
      csv(1),
      csv(cycle.startedAt),
      csv(cycle.finishedAt),
      csv(cycle.distanceTotalKm),
      csv(cycle.fuelUsedL),
      csv(cycle.avgFuelConsumptionKml),
      csv(cycle.source),
      csv(cycle.fuelRateSource),
      csv(build.gitSha),
      csv(build.branch),
      csv(build.versionCode),
      csv(build.buildDate),
      csv(build.deviceModel),
      csv(build.androidVersion),
    ].join(',')),
  ];
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}
