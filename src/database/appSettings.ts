import * as FileSystem from 'expo-file-system';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';
import { recordStorageHealthIssue } from '../storage/storageHealth';

export type FuelType = 'FLEX' | 'ETANOL' | 'GASOLINA';
export type DistanceUnit = 'KM' | 'MI';
export interface AppSettings {
  fuelType: FuelType;
  distanceUnit: DistanceUnit;
  autoConnectObd: boolean;
  gpsTrackingEnabled: boolean;
  backgroundGpsEnabled: boolean;
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

const settingsListeners = new Set<(settings: AppSettings) => void>();
let latestSettings: AppSettings | null = null;

function publishSettings(settings: AppSettings): void {
  latestSettings = { ...settings };
  for (const listener of settingsListeners) {
    try { listener({ ...settings }); } catch { /* settings observers must not block persistence */ }
  }
}

/** Observe settings changed by the Settings UI without polling the file system. */
export function subscribeAppSettings(listener: (settings: AppSettings) => void): () => void {
  settingsListeners.add(listener);
  if (latestSettings) listener({ ...latestSettings });
  return () => settingsListeners.delete(listener);
}

const DEFAULT_SETTINGS: AppSettings = {
  fuelType: 'FLEX',
  distanceUnit: 'KM',
  autoConnectObd: true,
  gpsTrackingEnabled: false,
  backgroundGpsEnabled: false,
  diagnosticAlerts: true,
  selectedAdapterAddress: null,
  elmIoTimeoutMs: 10_000,
  elmBluetoothTimeoutMs: 5_000,
  elmCommandDelayMs: 20,
  elmMaxConnectionAttempts: 3,
  elmNoDataReconnectThreshold: 4,
  elmPartialResponseAction: 'RECONNECT_AND_INITIALIZE',
  elmForceInitialization: true,
  elmAdaptiveTiming: true,
  elmAdaptiveTimeoutMinMs: 3000,
  elmAdaptiveTimeoutMaxMs: 15000,
};
const APP_SETTINGS_SCHEMA_VERSION = 1;
type StoredAppSettings = Partial<AppSettings> & { schemaVersion?: number };

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isStoredAppSettings(value: unknown): value is StoredAppSettings {
  if (!isRecord(value)) return false;
  if (value.schemaVersion !== undefined &&
      (!Number.isInteger(value.schemaVersion) || (value.schemaVersion as number) < 0)) return false;
  const knownFields = Object.keys(DEFAULT_SETTINGS);
  if (!knownFields.some((key) => Object.prototype.hasOwnProperty.call(value, key))) return false;
  if (value.fuelType !== undefined && !['FLEX', 'ETANOL', 'GASOLINA'].includes(String(value.fuelType))) return false;
  if (value.distanceUnit !== undefined && value.distanceUnit !== 'KM' && value.distanceUnit !== 'MI') return false;
  for (const key of ['autoConnectObd', 'gpsTrackingEnabled', 'backgroundGpsEnabled', 'diagnosticAlerts',
    'elmForceInitialization', 'elmAdaptiveTiming']) {
    if (value[key] !== undefined && typeof value[key] !== 'boolean') return false;
  }
  for (const key of ['elmIoTimeoutMs', 'elmBluetoothTimeoutMs', 'elmCommandDelayMs',
    'elmMaxConnectionAttempts', 'elmNoDataReconnectThreshold', 'elmAdaptiveTimeoutMinMs',
    'elmAdaptiveTimeoutMaxMs']) {
    if (value[key] !== undefined && (typeof value[key] !== 'number' || !Number.isFinite(value[key]))) return false;
  }
  if (value.selectedAdapterAddress !== undefined &&
      value.selectedAdapterAddress !== null && typeof value.selectedAdapterAddress !== 'string') return false;
  return true;
}

function hasFutureAppSettingsSchema(value: unknown): boolean {
  return isRecord(value) && typeof value.schemaVersion === 'number'
    && value.schemaVersion > APP_SETTINGS_SCHEMA_VERSION;
}


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
  let parsed: StoredAppSettings | null = null;
  try {
    const result = await readJsonWithRecovery(target, isStoredAppSettings, hasFutureAppSettingsSchema);
    parsed = result.value;
    if (result.recoveredFromPrevious) {
      recordStorageHealthIssue(
        'JSON_RECOVERED',
        'Configurações recuperadas da cópia anterior',
        'O arquivo principal de configurações está inválido. A cópia anterior validada foi usada somente para leitura; gravações permanecem bloqueadas até a origem ser reparada.',
        'critical',
        'CONFIG/app-settings.json',
      );
    }
  } catch (cause) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    const future = detail.includes('SCHEMA_VERSION_NEWER_THAN_APP');
    recordStorageHealthIssue(
      future ? 'FUTURE_SCHEMA' : 'JSON_CORRUPTED',
      future ? 'Schema futuro das configurações' : 'JSON de configurações corrompido',
      detail + ' O arquivo original foi preservado; valores padrão não serão gravados sobre ele.',
      'critical',
      'CONFIG/app-settings.json',
    );
    return DEFAULT_SETTINGS;
  }

  if (!parsed) {
    await writeAppSettings(basePath, DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }

  const settings: AppSettings = {
    fuelType: parsed.fuelType === 'GASOLINA' ? 'GASOLINA' : parsed.fuelType === 'ETANOL' ? 'ETANOL' : 'FLEX',
    distanceUnit: parsed.distanceUnit === 'MI' ? 'MI' : 'KM',
    autoConnectObd: parsed.autoConnectObd !== false,
    gpsTrackingEnabled: parsed.gpsTrackingEnabled === true,
    backgroundGpsEnabled: parsed.backgroundGpsEnabled === true && parsed.gpsTrackingEnabled === true,
    diagnosticAlerts: parsed.diagnosticAlerts !== false,
    selectedAdapterAddress: typeof parsed.selectedAdapterAddress === 'string' && parsed.selectedAdapterAddress.trim()
      ? parsed.selectedAdapterAddress.trim().toUpperCase()
      : null,
    elmIoTimeoutMs: numberSetting(parsed.elmIoTimeoutMs, 10000, 1000, 30000),
    elmBluetoothTimeoutMs: numberSetting(parsed.elmBluetoothTimeoutMs, 5000, 1000, 30000),
    elmCommandDelayMs: numberSetting(parsed.elmCommandDelayMs, 20, 0, 1000),
    elmMaxConnectionAttempts: numberSetting(parsed.elmMaxConnectionAttempts, 3, 1, 10) || 3,
    elmNoDataReconnectThreshold: numberSetting(parsed.elmNoDataReconnectThreshold, 4, 1, 20),
    elmPartialResponseAction: parsed.elmPartialResponseAction === 'RECONNECT' || parsed.elmPartialResponseAction === 'IGNORE'
      ? parsed.elmPartialResponseAction
      : 'RECONNECT_AND_INITIALIZE',
    elmForceInitialization: parsed.elmForceInitialization !== false,
    elmAdaptiveTiming: parsed.elmAdaptiveTiming !== false,
    elmAdaptiveTimeoutMinMs: numberSetting(parsed.elmAdaptiveTimeoutMinMs, 3000, 1000, 15000),
    elmAdaptiveTimeoutMaxMs: numberSetting(parsed.elmAdaptiveTimeoutMaxMs, 15000, 3000, 30000),
  };
  publishSettings(settings);
  return settings;
}
export async function writeAppSettings(basePath: string, settings: AppSettings): Promise<void> {
  const target = await settingsPath(basePath);
  const document: StoredAppSettings = { ...settings, schemaVersion: APP_SETTINGS_SCHEMA_VERSION };
  await writeJsonAtomically(target, document, isStoredAppSettings, hasFutureAppSettingsSchema);
  publishSettings(settings);
}

export { DEFAULT_SETTINGS };
