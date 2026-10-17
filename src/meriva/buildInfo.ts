import Constants from 'expo-constants';
import { Platform } from 'react-native';

export interface AppBuildInfo {
  gitSha: string;
  branch: string;
  versionCode: number | null;
  buildDate: string;
  appVersion: string;
  deviceModel: string;
  androidVersion: string;
}

export function getAppBuildInfo(): AppBuildInfo {
  const config = Constants.expoConfig as unknown as {
    version?: string;
    android?: { versionCode?: number };
    extra?: { buildInfo?: Partial<AppBuildInfo> };
  } | null;
  const embedded = config?.extra?.buildInfo ?? {};
  const platformConstants = (Platform as unknown as { constants?: Record<string, unknown> }).constants;
  const versionCode = embedded.versionCode ?? config?.android?.versionCode ?? null;
  return {
    gitSha: embedded.gitSha || 'UNKNOWN',
    branch: embedded.branch || 'UNKNOWN',
    versionCode: typeof versionCode === 'number' && Number.isFinite(versionCode) ? versionCode : null,
    buildDate: embedded.buildDate || 'UNKNOWN',
    appVersion: config?.version || Constants.nativeAppVersion || 'UNKNOWN',
    deviceModel: String(platformConstants?.Model ?? Constants.deviceName ?? 'UNKNOWN'),
    androidVersion: Platform.OS === 'android' ? String(Platform.Version) : 'N/A',
  };
}
