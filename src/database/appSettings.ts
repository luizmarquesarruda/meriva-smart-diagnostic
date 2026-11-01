import * as FileSystem from 'expo-file-system';
import { readJsonWithRecovery, writeJsonAtomically } from '../storage/atomicJsonFile';

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

const SETTINGS_SCHEMA_VERSION = 1;
const settingsListeners = new Set<(settings: AppSettings) => void>();
let latestSettings: AppSettings | null = null;
let settingsStorageWarning: string | null = null;

export function getAppSettingsStorageWarning(): string | null { return settingsStorageWarning; }

function publishSettings(settings: AppSettings): void {
  latestSettings = { ...settings };
  for (const listener of settingsListeners) {
    try { listener({ ...settings }); } catch { /* settings observers must not block persistence */ }
  }
}

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

function numberSetting(value: unknown, fallback: number, min: number, max: number): number {
  const numeric = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(numeric)) return fallback;
  return Math.min(max, Math.max(min, Math.round(numeric)));
}

function isSettingsDocument(value: unknown): value is Partial<AppSettings> & { schemaVersion?: number } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const raw = value as Record<string, unknown>;
  if (raw.schemaVersion !== undefined && raw.schemaVersion !== SETTINGS_SCHEMA_VERSION) return false;
  if (!Object.keys(DEFAULT_SETTINGS).some((key) => key in raw)) return false;

  const booleanKeys: Array<keyof AppSettings> = [
    'autoConnectObd', 'gpsTrackingEnabled', 'backgroundGpsEnabled',
    'diagnosticAlerts', 'elmForceInitialization', 'elmAdaptiveTiming',
  ];
  for (const key of booleanKeys) {
    if (key in raw && typeof raw[key] !== 'boolean') return false;
  }
  if ('fuelType' in raw && !['FLEX', 'ETANOL', 'GASOLINA'].includes(String(raw.fuelType))) return false;
  if ('distanceUnit' in raw && !['KM', 'MI'].includes(String(raw.distanceUnit))) return false;
  if ('selectedAdapterAddress' in raw && raw.selectedAdapterAddress !== null &&
      typeof raw.selectedAdapterAddress !== 'string') return false;
  if ('elmPartialResponseAction' in raw &&
      !['RECONNECT_AND_INITIALIZE', 'RECONNECT', 'IGNORE'].includes(String(raw.elmPartialResponseAction))) return false;

  const numericKeys: Array<keyof AppSettings> = [
    'elmIoTimeoutMs', 'elmBluetoothTimeoutMs', 'elmCommandDelayMs',
    'elmMaxConnectionAttempts', 'elmNoDataReconnectThreshold',
    'elmAdaptiveTimeoutMinMs', 'elmAdaptiveTimeoutMaxMs',
  ];
  for (const key of numericKeys) {
    if (!(key in raw)) continue;
    const numeric = typeof raw[key] === 'number' ? raw[key] : Number(raw[key]);
    if (!Number.isFinite(numeric)) return false;
  }
  return true;
}

function isFutureSettingsDocument(value: unknown): boolean {
  if (!value || typeof value !== 'object') return false;
  const version = (value as { schemaVersion?: unknown }).schemaVersion;
  return typeof version === 'number' && Number.isInteger(version) && version > SETTINGS_SCHEMA_VERSION;
}

function normalizeSettings(parsed: Partial<AppSettings>): AppSettings {
  return {
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
}

async function settingsPath(basePath: string): Promise<string> {
  const dir = `${basePath}/CONFIG`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return `${dir}/app-settings.json`;
}

export async function readAppSettings(basePath: string): Promise<AppSettings> {
  const target = await settingsPath(basePath);
  try {
    const result = await readJsonWithRecovery(target, isSettingsDocument, isFutureSettingsDocument);
    if (!result.value) {
      await writeAppSettings(basePath, DEFAULT_SETTINGS);
      settingsStorageWarning = null;
      return DEFAULT_SETTINGS;
    }
    const normalized = normalizeSettings(result.value);
    settingsStorageWarning = result.recoveredFromPrevious
      ? 'CONFIGURAÇÕES RECUPERADAS DA CÓPIA ANTERIOR; O ARQUIVO PRINCIPAL FOI PRESERVADO.' : null;
    publishSettings(normalized);
    return normalized;
  } catch (cause) {
    settingsStorageWarning = cause instanceof Error
      ? 'CONFIGURAÇÕES NÃO GRAVÁVEIS: ' + cause.message + '. PADRÕES USADOS SOMENTE EM MEMÓRIA; ARQUIVO ORIGINAL PRESERVADO.'
      : 'CONFIGURAÇÕES NÃO GRAVÁVEIS; PADRÕES USADOS SOMENTE EM MEMÓRIA; ARQUIVO ORIGINAL PRESERVADO.';
    console.warn('[settings] ', settingsStorageWarning);
    publishSettings(DEFAULT_SETTINGS);
    return DEFAULT_SETTINGS;
  }
}

export async function writeAppSettings(basePath: string, settings: AppSettings): Promise<void> {
  const target = await settingsPath(basePath);
  const next = { ...settings, schemaVersion: SETTINGS_SCHEMA_VERSION };
  await writeJsonAtomically(target, next, isSettingsDocument, isFutureSettingsDocument);
  settingsStorageWarning = null;
  publishSettings(settings);
}

export { DEFAULT_SETTINGS };
