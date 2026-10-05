import * as FileSystem from 'expo-file-system';

export type FuelType = 'FLEX' | 'ETANOL' | 'GASOLINA';
export type DistanceUnit = 'KM' | 'MI';
export interface AppSettings {
  fuelType: FuelType;
  distanceUnit: DistanceUnit;
  autoConnectObd: boolean;
  diagnosticAlerts: boolean;
  selectedAdapterAddress: string | null;\n  elmIoTimeoutMs: number;\n  elmBluetoothTimeoutMs: number;\n  elmCommandDelayMs: number;\n  elmMaxConnectionAttempts: number;\n  elmNoDataReconnectThreshold: number;\n  elmPartialResponseAction: 'RECONNECT_AND_INITIALIZE' | 'RECONNECT' | 'IGNORE';\n  elmForceInitialization: boolean;
}

const DEFAULT_SETTINGS: AppSettings = {
  fuelType: 'FLEX',
  distanceUnit: 'KM',
  autoConnectObd: true,
  diagnosticAlerts: true,
  selectedAdapterAddress: null,\n  elmIoTimeoutMs: 10_000,\n  elmBluetoothTimeoutMs: 5_000,\n  elmCommandDelayMs: 20,\n  elmMaxConnectionAttempts: 0,\n  elmNoDataReconnectThreshold: 40,\n  elmPartialResponseAction: 'RECONNECT_AND_INITIALIZE',\n  elmForceInitialization: true,
};

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {\n  const numeric = typeof value === 'number' ? value : Number(value);\n  if (!Number.isFinite(numeric)) return fallback;\n  return Math.min(max, Math.max(min, Math.round(numeric)));\n}\n\nasync function settingsPath(basePath: string): Promise<string> {
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
