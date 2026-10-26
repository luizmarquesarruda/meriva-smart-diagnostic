import * as FileSystem from 'expo-file-system';
import { flushCsvLogs } from '../database/csvLogger';
import { withDriveCycleStorageExclusive } from './driveCycleStorage';

export interface BackupInfo {
  timestamp: string;
  sizeBytes: number;
  includes: string[];
}

async function getDirectorySize(path: string): Promise<number> {
  const info = await FileSystem.getInfoAsync(path, { size: true });
  if (!info.exists) return 0;
  if (!info.isDirectory) {
    if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
      throw new Error('BACKUP_SIZE_UNAVAILABLE: ' + path);
    }
    return info.size;
  }
  const children = await FileSystem.readDirectoryAsync(path);
  let total = 0;
  for (const child of children) total += await getDirectorySize(`${path}/${child}`);
  return total;
}

const MAX_BACKUPS_TO_KEEP = 5;

async function pruneOldBackups(basePath: string): Promise<void> {
  const root = `${basePath}/BACKUP`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists || !info.isDirectory) return;
  const names = (await FileSystem.readDirectoryAsync(root))
    .filter((name) => name.startsWith('meriva_smart_'))
    .sort((a, b) => b.localeCompare(a));
  for (const name of names.slice(MAX_BACKUPS_TO_KEEP)) {
    await FileSystem.deleteAsync(`${root}/${name}`, { idempotent: true });
  }
}

export async function createBackup(basePath: string): Promise<BackupInfo> {
  await flushCsvLogs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = `${basePath}/BACKUP`;
  const backupDir = `${backupRoot}/meriva_smart_${timestamp}`;
  await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });

  const dirs = ['BANCO', 'APRENDIZADO', 'DTC', 'CONFIG', 'LEITURAS', 'LOGS', 'VIAGENS'];
  const included: string[] = [];
  const files: Array<{ directory: string; sizeBytes: number }> = [];
  let totalSize = 0;

  try {
    await withDriveCycleStorageExclusive(basePath, async () => {
      for (const dir of dirs) {
        const source = `${basePath}/${dir}`;
        const dest = `${backupDir}/${dir}`;
        const info = await FileSystem.getInfoAsync(source);
        if (!info.exists) continue;
        if (!info.isDirectory) throw new Error('BACKUP_SOURCE_NOT_DIRECTORY: ' + source);

        const sourceSize = await getDirectorySize(source);
        await FileSystem.copyAsync({ from: source, to: dest });
        const copiedSize = await getDirectorySize(dest);
        if (copiedSize !== sourceSize) {
          throw new Error(`BACKUP_VERIFICATION_FAILED: ${dir} source=${sourceSize} copied=${copiedSize}`);
        }
        totalSize += copiedSize;
        included.push(dir);
        files.push({ directory: dir, sizeBytes: copiedSize });
      }
    });

    const manifest = {
      schemaVersion: 1,
      createdAt: new Date().toISOString(),
      payloadSizeBytes: totalSize,
      directories: files,
    };
    await FileSystem.writeAsStringAsync(
      `${backupDir}/manifest.json`,
      JSON.stringify(manifest, null, 2),
      { encoding: FileSystem.EncodingType.UTF8 },
    );
    const verifiedManifest = JSON.parse(
      await FileSystem.readAsStringAsync(`${backupDir}/manifest.json`),
    ) as typeof manifest;
    if (verifiedManifest.schemaVersion !== 1 ||
        verifiedManifest.payloadSizeBytes !== totalSize ||
        !Array.isArray(verifiedManifest.directories) ||
        verifiedManifest.directories.length !== included.length) {
      throw new Error('BACKUP_MANIFEST_VERIFICATION_FAILED');
    }

    try {
      await pruneOldBackups(basePath);
    } catch (cause) {
      // A verified backup remains successful even if pruning old copies fails.
      console.warn('[backup] backup criado, mas não foi possível aplicar retenção:', cause instanceof Error ? cause.message : cause);
    }
    return { timestamp, sizeBytes: totalSize, includes: included };
  } catch (cause) {
    try { await FileSystem.deleteAsync(backupDir, { idempotent: true }); } catch { /* preserve original error */ }
    throw cause;
  }
}
