import * as FileSystem from 'expo-file-system';
import { flushCsvLogs } from '../database/csvLogger';

export interface BackupInfo {
  timestamp: string;
  sizeBytes: number;
  includes: string[];
}

export interface StoredBackupInfo extends BackupInfo {
  name: string;
  createdAt: string;
}

export interface RestoreBackupResult extends BackupInfo {
  backupName: string;
  safetyBackupName: string;
  preservedDirectories: string[];
}

interface BackupManifest {
  schemaVersion: 1;
  createdAt: string;
  payloadSizeBytes: number;
  directories: Array<{ directory: string; sizeBytes: number }>;
}

const BACKUP_DATA_DIRS = [
  'BANCO', 'APRENDIZADO', 'DTC', 'CONFIG', 'LEITURAS', 'LOGS', 'VIAGENS', 'MANUTENCAO',
] as const;
const MAX_BACKUPS_TO_KEEP = 5;

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

function isSafeBackupName(name: string): boolean {
  return typeof name === 'string' &&
    name.startsWith('meriva_smart_') &&
    !name.includes('/') &&
    !name.includes('\\') &&
    name !== 'meriva_smart_';
}

async function readVerifiedManifest(backupDir: string): Promise<BackupManifest> {
  const manifestPath = `${backupDir}/manifest.json`;
  const parsed = JSON.parse(await FileSystem.readAsStringAsync(manifestPath)) as Partial<BackupManifest>;
  if (
    parsed.schemaVersion !== 1 ||
    typeof parsed.createdAt !== 'string' ||
    !Number.isFinite(Date.parse(parsed.createdAt)) ||
    typeof parsed.payloadSizeBytes !== 'number' ||
    !Number.isFinite(parsed.payloadSizeBytes) ||
    parsed.payloadSizeBytes < 0 ||
    !Array.isArray(parsed.directories)
  ) {
    throw new Error('BACKUP_MANIFEST_INVALID');
  }

  const seen = new Set<string>();
  let total = 0;
  for (const entry of parsed.directories) {
    if (
      !entry ||
      typeof entry.directory !== 'string' ||
      !(BACKUP_DATA_DIRS as readonly string[]).includes(entry.directory) ||
      seen.has(entry.directory) ||
      typeof entry.sizeBytes !== 'number' ||
      !Number.isFinite(entry.sizeBytes) ||
      entry.sizeBytes < 0
    ) {
      throw new Error('BACKUP_MANIFEST_DIRECTORY_INVALID');
    }
    seen.add(entry.directory);
    const source = `${backupDir}/${entry.directory}`;
    const info = await FileSystem.getInfoAsync(source);
    if (!info.exists || !info.isDirectory) throw new Error('BACKUP_DIRECTORY_MISSING: ' + entry.directory);
    const actualSize = await getDirectorySize(source);
    if (actualSize !== entry.sizeBytes) {
      throw new Error(`BACKUP_DIRECTORY_SIZE_MISMATCH: ${entry.directory} expected=${entry.sizeBytes} actual=${actualSize}`);
    }
    total += actualSize;
  }

  if (total !== parsed.payloadSizeBytes) throw new Error('BACKUP_TOTAL_SIZE_MISMATCH');
  return parsed as BackupManifest;
}

async function pruneOldBackups(basePath: string): Promise<void> {
  const root = `${basePath}/BACKUP`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists || !info.isDirectory) return;
  const names = (await FileSystem.readDirectoryAsync(root))
    .filter((name) => isSafeBackupName(name))
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

  const included: string[] = [];
  const files: Array<{ directory: string; sizeBytes: number }> = [];
  let totalSize = 0;

  try {
    for (const dir of BACKUP_DATA_DIRS) {
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

    const manifest: BackupManifest = {
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
    await readVerifiedManifest(backupDir);

    try {
      await pruneOldBackups(basePath);
    } catch (cause) {
      console.warn('[backup] backup criado, mas não foi possível aplicar retenção:', cause instanceof Error ? cause.message : cause);
    }
    return { timestamp, sizeBytes: totalSize, includes: included };
  } catch (cause) {
    try { await FileSystem.deleteAsync(backupDir, { idempotent: true }); } catch { /* preserve original error */ }
    throw cause;
  }
}

/** Returns only backups whose manifest and every copied directory still verify. */
export async function listVerifiedBackups(basePath: string): Promise<StoredBackupInfo[]> {
  const root = `${basePath}/BACKUP`;
  const info = await FileSystem.getInfoAsync(root);
  if (!info.exists || !info.isDirectory) return [];

  const names = (await FileSystem.readDirectoryAsync(root))
    .filter((name) => isSafeBackupName(name))
    .sort((a, b) => b.localeCompare(a));
  const backups: StoredBackupInfo[] = [];
  for (const name of names) {
    try {
      const backupDir = `${root}/${name}`;
      const manifest = await readVerifiedManifest(backupDir);
      backups.push({
        name,
        timestamp: name.slice('meriva_smart_'.length),
        createdAt: manifest.createdAt,
        sizeBytes: manifest.payloadSizeBytes,
        includes: manifest.directories.map((entry) => entry.directory),
      });
    } catch {
      // Invalid/incomplete backups are not offered as restorable options.
    }
  }
  return backups;
}

/**
 * Restores only directories present in the selected, fully verified snapshot.
 * A fresh safety backup is created first. On a copy failure, all affected
 * directories are rolled back from that safety snapshot before the error is returned.
 */
export async function restoreBackup(basePath: string, backupName: string): Promise<RestoreBackupResult> {
  if (!isSafeBackupName(backupName)) throw new Error('BACKUP_NAME_INVALID');
  await flushCsvLogs();

  const backupRoot = `${basePath}/BACKUP`;
  const sourceDir = `${backupRoot}/${backupName}`;
  const manifest = await readVerifiedManifest(sourceDir);
  const stagingDir = `${backupRoot}/restore-staging-${Date.now()}`;
  await FileSystem.makeDirectoryAsync(stagingDir, { intermediates: true });

  try {
    // Stage the selected backup before creating the safety snapshot; retention
    // may prune an old selected backup, but it cannot remove this staging copy.
    for (const entry of manifest.directories) {
      await FileSystem.copyAsync({
        from: `${sourceDir}/${entry.directory}`,
        to: `${stagingDir}/${entry.directory}`,
      });
      const stagedSize = await getDirectorySize(`${stagingDir}/${entry.directory}`);
      if (stagedSize !== entry.sizeBytes) throw new Error('RESTORE_STAGING_VERIFY_FAILED: ' + entry.directory);
    }

    const safety = await createBackup(basePath);
    const safetyBackupName = `meriva_smart_${safety.timestamp}`;
    const safetyDir = `${backupRoot}/${safetyBackupName}`;
    const restored: string[] = [];

    try {
      for (const entry of manifest.directories) {
        const target = `${basePath}/${entry.directory}`;
        await FileSystem.deleteAsync(target, { idempotent: true });
        await FileSystem.copyAsync({
          from: `${stagingDir}/${entry.directory}`,
          to: target,
        });
        const restoredSize = await getDirectorySize(target);
        if (restoredSize !== entry.sizeBytes) {
          throw new Error(`RESTORE_TARGET_VERIFY_FAILED: ${entry.directory} expected=${entry.sizeBytes} actual=${restoredSize}`);
        }
        restored.push(entry.directory);
      }
      await flushCsvLogs();
    } catch (restoreCause) {
      try {
        const safetyManifest = await readVerifiedManifest(safetyDir);
        const safetyEntries = new Map(safetyManifest.directories.map((entry) => [entry.directory, entry]));
        for (const entry of manifest.directories) {
          const target = `${basePath}/${entry.directory}`;
          const safetyEntry = safetyEntries.get(entry.directory);
          await FileSystem.deleteAsync(target, { idempotent: true });
          if (safetyEntry) {
            await FileSystem.copyAsync({
              from: `${safetyDir}/${entry.directory}`,
              to: target,
            });
            const rollbackSize = await getDirectorySize(target);
            if (rollbackSize !== safetyEntry.sizeBytes) {
              throw new Error('RESTORE_ROLLBACK_VERIFY_FAILED: ' + entry.directory);
            }
          }
        }
      } catch (rollbackCause) {
        throw new Error(
          'RESTORE_FAILED_AND_ROLLBACK_FAILED: ' +
          (rollbackCause instanceof Error ? rollbackCause.message : String(rollbackCause)) +
          '; original=' + (restoreCause instanceof Error ? restoreCause.message : String(restoreCause)) +
          '; safetyBackup=' + safetyBackupName,
        );
      }
      throw new Error(
        'RESTORE_FAILED_ROLLED_BACK: ' +
        (restoreCause instanceof Error ? restoreCause.message : String(restoreCause)) +
        '; safetyBackup=' + safetyBackupName,
      );
    }

    return {
      backupName,
      safetyBackupName,
      timestamp: manifest.createdAt,
      sizeBytes: manifest.payloadSizeBytes,
      includes: restored,
      preservedDirectories: BACKUP_DATA_DIRS.filter((dir) =>
        !manifest.directories.some((entry) => entry.directory === dir),
      ),
    };
  } finally {
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => undefined);
  }
}
