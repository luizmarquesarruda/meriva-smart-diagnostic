// MERIVA SMART DIAGNOSTIC — Quota de armazenamento
// ARQUIVO DE SUBSTITUIÇÃO para: <repo>/src/storage/quotaManager.ts
//
// Correção da auditoria: o cálculo anterior lia "${basePath}/../.size",
// um arquivo que nunca é criado — o resultado era sempre 0 MB.
// Agora o tamanho é calculado recursivamente pelos arquivos reais.
// A interface pública (getStorageUsage / checkStorageQuota) é preservada;
// getStorageBreakdown é adicional, para a tela de armazenamento.

import * as FileSystem from 'expo-file-system';

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
    for (const child of children) {
      total += await getEntrySizeBytes(`${path}/${child}`);
    }
    return total;
  } catch {
    return 0; // item ilegível não deve derrubar a medição
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

export async function getStorageUsage(basePath: string): Promise<{ usedMb: number; limitMb: number }> {
  const bytes = await getEntrySizeBytes(basePath);
  return { usedMb: toMb(bytes), limitMb: DEFAULT_LIMIT_MB };
}

export async function checkStorageQuota(
  basePath: string,
  config: StorageQuotaConfig,
): Promise<{ warning: boolean; critical: boolean; message: string }> {
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