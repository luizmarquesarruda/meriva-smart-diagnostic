import * as FileSystem from 'expo-file-system';

export type FuelType = 'FLEX' | 'ETANOL' | 'GASOLINA';
export type DistanceUnit = 'KM' | 'MI';
export interface AppSettings {
  fuelType: FuelType;
  distanceUnit: DistanceUnit;
  autoConnectObd: boolean;
  diagnosticAlerts: boolean;
  selectedAdapterAddress: string | null;
  elmIoTimeoutMs: number;
  elmBluetoothTimeoutMs: number;
  elmCommandDelayMs: number;
  elmMaxConnectionAttempts: number;
  elmNoDataReconnectThreshold: number;
  elmPartialResponseAction: 'RECONNECT_AND_INITIALIZE' | 'RECONNECT' | 'IGNORE';
  elmForceInitialization: boolean;
  elmAdaptiveTiming: boolean;
  elmAdaptiveTimeoutMinMs: number;
  elmAdaptiveTimeoutMaxMs: number;
}

const DEFAULT_SETTINGS: AppSettings = {
  fuelType: 'FLEX',
  distanceUnit: 'KM',
  autoConnectObd: true,
  diagnosticAlerts: true,
  selectedAdapterAddress: null,
  elmIoTimeoutMs: 10_000,
  elmBluetoothTimeoutMs: 5_000,
  elmCommandDelayMs: 20,
  elmMaxConnectionAttempts: 0,
  elmNoDataReconnectThreshold: 40,
  elmPartialResponseAction: 'RECONNECT_AND_INITIALIZE',
  elmForceInitialization: true,
  elmAdaptiveTiming: true,
  elmAdaptiveTimeoutMinMs: 3000,
  elmAdaptiveTimeoutMaxMs: 15000,
};

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

async function settingsPath(basePath: string): Promise<string> {
  const dir = `${basePath}/CONFIG`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return `${dir}/app-settings.json`;
}

export async function readAppSettings(basePath: string): Promise<AppSettings> {
  const target = await settingsPath(basePath);
  const info = await FileSystem.getInfoAsync(target);
  if (!info.exists || info.isDirectory) {
    await writeAppSettings(basePath, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  try {
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(target)) as Partial<AppSettings>;
    const settings: AppSettings = {
      fuelType: parsed.fuelType === 'GASOLINA' ? 'GASOLINA' : parsed.fuelType === 'ETANOL' ? 'ETANOL' : 'FLEX',
      distanceUnit: parsed.distanceUnit === 'MI' ? 'MI' : 'KM',
      autoConnectObd: parsed.autoConnectObd !== false,
      diagnosticAlerts: parsed.diagnosticAlerts !== false,
      selectedAdapterAddress: typeof parsed.selectedAdapterAddress === 'string' && parsed.selectedAdapterAddress.trim()
        ? parsed.selectedAdapterAddress.trim().toUpperCase()
        : null,
      elmIoTimeoutMs: numberSetting(parsed.elmIoTimeoutMs, 10000, 1000, 30000),
      elmBluetoothTimeoutMs: numberSetting(parsed.elmBluetoothTimeoutMs, 5000, 1000, 30000),
      elmCommandDelayMs: numberSetting(parsed.elmCommandDelayMs, 20, 0, 1000),
      elmMaxConnectionAttempts: numberSetting(parsed.elmMaxConnectionAttempts, 0, 0, 100),
      elmNoDataReconnectThreshold: numberSetting(parsed.elmNoDataReconnectThreshold, 40, 1, 1000),
      elmPartialResponseAction: parsed.elmPartialResponseAction === 'RECONNECT' || parsed.elmPartialResponseAction === 'IGNORE'
        ? parsed.elmPartialResponseAction
        : 'RECONNECT_AND_INITIALIZE',
      elmForceInitialization: parsed.elmForceInitialization !== false,
      elmAdaptiveTiming: parsed.elmAdaptiveTiming !== false,
      elmAdaptiveTimeoutMinMs: numberSetting(parsed.elmAdaptiveTimeoutMinMs, 3000, 1000, 15000),
      elmAdaptiveTimeoutMaxMs: numberSetting(parsed.elmAdaptiveTimeoutMaxMs, 15000, 3000, 30000),
    };
    return settings;
  } catch {
    await writeAppSettings(basePath, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}

export async function writeAppSettings(basePath: string, settings: AppSettings): Promise<void> {
  const target = await settingsPath(basePath);
  await FileSystem.writeAsStringAsync(target, JSON.stringify(settings, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export { DEFAULT_SETTINGS };
