import * as FileSystem from 'expo-file-system';
import { isExpiredCleanupFile } from './cleanupPolicy';

export interface CleanupResult {
  removed: number;
  failed: number;
}

async function cleanupDirectory(basePath: string, directory: 'LOGS' | 'LEITURAS'): Promise<CleanupResult> {
  const directoryPath = `${basePath}/${directory}`;
  const result: CleanupResult = { removed: 0, failed: 0 };
  let files: string[];
  try {
    const info = await FileSystem.getInfoAsync(directoryPath);
    if (!info.exists) return result;
    files = await FileSystem.readDirectoryAsync(directoryPath);
  } catch {
    result.failed += 1;
    return result;
  }

  const now = Date.now();
  for (const file of files) {
    const filePath = `${directoryPath}/${file}`;
    try {
      const fileInfo = await FileSystem.getInfoAsync(filePath);
      if (typeof fileInfo.modificationTime === 'number'
          && isExpiredCleanupFile(directory, fileInfo.modificationTime * 1000, now)) {
        await FileSystem.deleteAsync(filePath, { idempotent: true });
        result.removed += 1;
      }
    } catch {
      result.failed += 1;
    }
  }
  return result;
}

export function cleanupOldLogs(basePath: string): Promise<CleanupResult> {
  return cleanupDirectory(basePath, 'LOGS');
}

export function cleanupOldReadings(basePath: string): Promise<CleanupResult> {
  return cleanupDirectory(basePath, 'LEITURAS');
}
