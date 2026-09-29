import * as FileSystem from 'expo-file-system';
import { cleanupOldLogs, cleanupOldReadings } from './cleanup';

export interface BackupInfo {
  timestamp: string;
  sizeBytes: number;
  includes: string[];
}

export async function createBackup(basePath: string): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `${basePath}/BACKUP/meriva_smart_${timestamp}`;

  await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });

  const dirs = ['BANCO', 'APRENDIZADO', 'DTC', 'CONFIG'];
  let totalSize = 0;

  for (const dir of dirs) {
    const source = `${basePath}/${dir}`;
    const dest = `${backupDir}/${dir}`;
    const info = await FileSystem.getInfoAsync(source);
    if (info.exists) {
      await FileSystem.copyAsync({ from: source, to: dest });
      totalSize += info.size || 0;
    }
  }

  return { timestamp, sizeBytes: totalSize, includes: dirs };
}
