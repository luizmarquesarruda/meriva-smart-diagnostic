import * as FileSystem from 'expo-file-system';
import { isExpiredCleanupFile } from './cleanupPolicy';

export async function cleanupOldLogs(basePath: string, retentionDays = 7): Promise<number> {
  const logsDir = `${basePath}/LOGS`;
  const info = await FileSystem.getInfoAsync(logsDir);
  if (!info.exists) return 0;

  const files = await FileSystem.readDirectoryAsync(logsDir);
  const now = Date.now();
  let removed = 0;

  for (const file of files) {
    const filePath = `${logsDir}/${file}`;
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if ('modificationTime' in fileInfo && fileInfo.modificationTime && isExpiredCleanupFile('LOGS', fileInfo.modificationTime * 1000, now)) {
      await FileSystem.deleteAsync(filePath);
      removed++;
    }
  }

  return removed;
}

export async function cleanupOldReadings(basePath: string, retentionDays = 30): Promise<number> {
  const readingsDir = `${basePath}/LEITURAS`;
  const info = await FileSystem.getInfoAsync(readingsDir);
  if (!info.exists) return 0;

  const files = await FileSystem.readDirectoryAsync(readingsDir);
  const now = Date.now();
  let removed = 0;

  for (const file of files) {
    const filePath = `${readingsDir}/${file}`;
    const fileInfo = await FileSystem.getInfoAsync(filePath);
    if ('modificationTime' in fileInfo && fileInfo.modificationTime && isExpiredCleanupFile('LEITURAS', fileInfo.modificationTime * 1000, now)) {
      await FileSystem.deleteAsync(filePath);
      removed++;
    }
  }

  return removed;
}
