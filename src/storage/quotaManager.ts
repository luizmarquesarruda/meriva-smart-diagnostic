import * as FileSystem from 'expo-file-system';

export interface StorageQuotaConfig {
  limitMb: number;
  warningThreshold: number;
  cleanupTargetMb: number;
  autoCleanupEnabled: boolean;
}

export async function getStorageUsage(basePath: string): Promise<{ usedMb: number; limitMb: number }> {
  const info = await FileSystem.getInfoAsync(basePath);
  if (!info.exists) return { usedMb: 0, limitMb: 2048 };
  const stat = await FileSystem.readAsStringAsync(`${basePath}/../.size`, { encoding: 'utf8' }).catch(() => '0');
  return { usedMb: Number(stat) || 0, limitMb: 2048 };
}

export async function checkStorageQuota(basePath: string, config: StorageQuotaConfig): Promise<{ warning: boolean; critical: boolean; message: string }> {
  const { usedMb, limitMb } = await getStorageUsage(basePath);
  const percentUsed = usedMb / limitMb;

  if (percentUsed >= 1) {
    return { warning: false, critical: true, message: `LIMITE ATINGIDO: ${usedMb}MB / ${limitMb}MB` };
  }
  if (percentUsed >= config.warningThreshold) {
    return { warning: true, critical: false, message: `ATENÇÃO: ${(percentUsed * 100).toFixed(1)}% do limite atingido` };
  }
  return { warning: false, critical: false, message: 'ESPAÇO OK' };
}
