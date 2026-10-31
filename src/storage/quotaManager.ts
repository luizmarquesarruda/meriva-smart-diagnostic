import * as FileSystem from 'expo-file-system';
import { flushCsvLogs } from '../database/csvLogger';

export interface StorageQuotaConfig {
  limitMb: number;
  warningThreshold: number;
  cleanupTargetMb: number;
  autoCleanupEnabled: boolean;
}

const MB = 1024 * 1024;
const DEFAULT_LIMIT_MB = 2048;

async function getEntrySizeBytes(path: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(path, { size: true });
  if (!info.exists) return 0;
  if (!info.isDirectory) {
    if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
      throw new Error('TAMANHO_DE_ARQUIVO_INDISPONIVEL: ' + path);
    }
    return info.size;
  }
  const children = await FileSystem.readDirectoryAsync(path);
  let total = 0;
  for (const child of children) total += await getEntrySizeBytes(`${path}/${child}`);
  return total;
}

interface DeletableStorageFile { path: string; size: number; modifiedAt: number; }

async function collectDeletableFiles(path: string, output: DeletableStorageFile[]): Promise<void> {
  const info = await FileSystem.getInfoAsync(path, { size: true });
  if (!info.exists) return;
  if (!info.isDirectory) {
    if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
      throw new Error('TAMANHO_DE_ARQUIVO_INDISPONIVEL: ' + path);
    }
    output.push({
      path,
      size: info.size,
      modifiedAt: typeof info.modificationTime === 'number' && Number.isFinite(info.modificationTime)
        ? info.modificationTime
        : 0,
    });
    return;
  }
  const children = await FileSystem.readDirectoryAsync(path);
  for (const child of children) await collectDeletableFiles(`${path}/${child}`, output);
}

/**
 * Reclaims space only from LOGS and LEITURAS, oldest first. Configuration,
 * trips, learning data and backups are never automatic-cleanup targets.
 */
async function cleanupToTarget(basePath: string, targetBytes: number): Promise<{ removed: number; usedBytes: number }> {
  await flushCsvLogs();
  let usedBytes = await getEntrySizeBytes(basePath);
  if (usedBytes <= targetBytes) return { removed: 0, usedBytes };

  const candidates: DeletableStorageFile[] = [];
  for (const directory of ['LOGS', 'LEITURAS']) {
    await collectDeletableFiles(`${basePath}/${directory}`, candidates);
  }
  candidates.sort((a, b) => a.modifiedAt - b.modifiedAt);
  let removed = 0;
  for (const item of candidates) {
    if (usedBytes <= targetBytes) break;
    await FileSystem.deleteAsync(item.path, { idempotent: true });
    usedBytes = Math.max(0, usedBytes - item.size);
    removed += 1;
  }
  return { removed, usedBytes };
}

function toMb(bytes: number): number {
  return Math.round((bytes / MB) * 10) / 10;
}

export async function getStorageBreakdown(basePath: string): Promise<Record<string, number>> {
  const dirs = ['CONFIG', 'BANCO', 'LEITURAS', 'APRENDIZADO', 'DTC', 'LOGS', 'VIAGENS', 'MANUTENCAO', 'BACKUP'];
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
  const targetMb = Number.isFinite(config.cleanupTargetMb) && config.cleanupTargetMb > 0
    ? Math.min(config.cleanupTargetMb, limitMb)
    : null;
  let cleanupNote = '';

  if (percentUsed >= 1 && config.autoCleanupEnabled && targetMb != null && targetMb < limitMb) {
    try {
      const result = await cleanupToTarget(basePath, targetMb * MB);
      ({ usedMb, limitMb } = await getStorageUsage(basePath, config.limitMb));
      percentUsed = usedMb / limitMb;
      cleanupNote = result.removed > 0
        ? ` LIMPEZA: ${result.removed} arquivo(s) removido(s).`
        : ' LIMPEZA AUTOMÁTICA NÃO ENCONTROU ARQUIVOS DESCARTÁVEIS.';
      if (usedMb > targetMb) {
        cleanupNote += ` Meta de ${targetMb} MB não atingida sem remover dados não descartáveis.`;
      }
    } catch (cause) {
      cleanupNote = ' FALHA NA LIMPEZA/VERIFICAÇÃO: ' +
        (cause instanceof Error ? cause.message : String(cause));
    }
  }

  if (percentUsed >= 1) {
    return { warning: false, critical: true, message: `LIMITE ATINGIDO: ${usedMb}MB / ${limitMb}MB.${cleanupNote}` };
  }
  if (targetMb != null && usedMb > targetMb && cleanupNote) {
    return { warning: true, critical: false, message: `OCUPAÇÃO ACIMA DA META: ${usedMb}MB / meta ${targetMb}MB.${cleanupNote}` };
  }
  if (percentUsed >= config.warningThreshold) {
    return { warning: true, critical: false, message: `ATENÇÃO: ${(percentUsed * 100).toFixed(1)}% do limite atingido.${cleanupNote}` };
  }
  return { warning: false, critical: false, message: `ESPAÇO OK.${cleanupNote}` };
}
