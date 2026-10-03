import * as FileSystem from 'expo-file-system';

export interface BackupInfo {
  timestamp: string;
  sizeBytes: number;
  includes: string[];
}

async function getDirectorySize(path: string): Promise<number> {
  try {
    const info = await FileSystem.getInfoAsync(path, { size: true });
    if (!info.exists) return 0;
    if (!info.isDirectory) return info.size ?? 0;
    const children = await FileSystem.readDirectoryAsync(path);
    let total = 0;
    for (const child of children) total += await getDirectorySize(`${path}/${child}`);
    return total;
  } catch {
    return 0;
  }
}

export async function createBackup(basePath: string): Promise<BackupInfo> {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDir = `${basePath}/BACKUP/meriva_smart_${timestamp}`;
  await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });

  const dirs = ['BANCO', 'APRENDIZADO', 'DTC', 'CONFIG', 'LEITURAS', 'LOGS', 'VIAGENS'];
  const included: string[] = [];
  let totalSize = 0;

  for (const dir of dirs) {
    const source = `${basePath}/${dir}`;
    const dest = `${backupDir}/${dir}`;
    const info = await FileSystem.getInfoAsync(source);
    if (!info.exists || !info.isDirectory) continue;

    await FileSystem.copyAsync({ from: source, to: dest });
    totalSize += await getDirectorySize(source);
    included.push(dir);
  }

  return { timestamp, sizeBytes: totalSize, includes: included };
}
