import * as FileSystem from 'expo-file-system';
import { cleanupOldLogs, cleanupOldReadings } from './cleanup';

export interface StorageQuotaConfig {
  limitMb: number;
  warningThreshold: number;
  cleanupTargetMb: number;
  autoCleanupEnabled: boolean;
}

const MB = 1024 * 1024;
const DEFAULT_LIMIT_MB = 2048;

async function getEntrySizeBytes(path: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (!info.exists) return 0;
    if (!info.isDirectory) return info.size ?? 0;
    const children = await FileSystem.readDirectoryAsync(path);
    let total = 0;
    for (const child of children) total += await getEntrySizeBytes(`${path}/${child}`);
    return total;
  } catch {
    return 0;
  }
}

function toMb(bytes: number): number {
  return Math.round((bytes / MB) * 10) / 10;
}

export async function getStorageBreakdown(basePath: string): Promise<Record<string, number>> {
  const dirs = ['CONFIG', 'BANCO', 'LEITURAS', 'APRENDIZADO', 'DTC', 'LOGS', 'VIAGENS', 'BACKUP'];
  const breakdown: Record<string, number> = {};
  for (const dir of dirs) {
    breakdown[dir] = toMb(await getEntrySizeBytes(`${basePath}/${dir}`));
  }
  return breakdown;
}

export async function getStorageUsage(
  basePath: string,
  limitMb: number = DEFAULT_LIMIT_MB,
): Promise<{ usedMb: number; limitMb: number }> {
  const safeLimitMb = Number.isFinite(limitMb) && limitMb > 0 ? limitMb : DEFAULT_LIMIT_MB;
  const bytes = await getEntrySizeBytes(basePath);
  return { usedMb: toMb(bytes), limitMb: safeLimitMb };
}

export async function checkStorageQuota(
  basePath: string,
  config: StorageQuotaConfig,
): Promise<{ warning: boolean; critical: boolean; message: string }> {
  let { usedMb, limitMb } = await getStorageUsage(basePath, config.limitMb);
  let percentUsed = usedMb / limitMb;

  // autoCleanupEnabled era declarado pela configuração, mas não tinha efeito.
  // A limpeza automática usa somente LOGS/LEITURAS antigos, exatamente os dados
  // que a tela de armazenamento já considera descartáveis.
  if (percentUsed >= 1 && config.autoCleanupEnabled && config.cleanupTargetMb > 0 && config.cleanupTargetMb < limitMb) {
    try {
      await cleanupOldLogs(basePath);
      await cleanupOldReadings(basePath);
      ({ usedMb, limitMb } = await getStorageUsage(basePath, config.limitMb));
      percentUsed = usedMb / limitMb;
    } catch {
      // Falha de limpeza não pode esconder o estado crítico de armazenamento.
    }
  }

  if (percentUsed >= 1) {
    return { warning: false, critical: true, message: `LIMITE ATINGIDO: ${usedMb}MB / ${limitMb}MB` };
  }
  if (percentUsed >= config.warningThreshold) {
    return { warning: true, critical: false, message: `ATENÇÃO: ${(percentUsed * 100).toFixed(1)}% do limite atingido` };
  }
  return { warning: false, critical: false, message: 'ESPAÇO OK' };
}
