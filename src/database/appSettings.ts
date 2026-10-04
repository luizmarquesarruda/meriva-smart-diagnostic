import * as FileSystem from 'expo-file-system';

export type FuelType = 'ETANOL' | 'GASOLINA';
export type DistanceUnit = 'KM' | 'MI';
export interface AppSettings {
  fuelType: FuelType;
  distanceUnit: DistanceUnit;
  autoConnectObd: boolean;
  autoStartGps: boolean;
  diagnosticAlerts: boolean;
  selectedAdapterAddress: string | null;
}

const DEFAULT_SETTINGS: AppSettings = {
  fuelType: 'ETANOL',
  distanceUnit: 'KM',
  autoConnectObd: true,
  autoStartGps: true,
  diagnosticAlerts: true,
  selectedAdapterAddress: null,
};

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
      fuelType: parsed.fuelType === 'GASOLINA' ? 'GASOLINA' : 'ETANOL',
      distanceUnit: parsed.distanceUnit === 'MI' ? 'MI' : 'KM',
      autoConnectObd: parsed.autoConnectObd !== false,
      autoStartGps: parsed.autoStartGps !== false,
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
