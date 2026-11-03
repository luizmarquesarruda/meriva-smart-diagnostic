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

interface BackupFileManifest {
  path: string;
  sizeBytes: number;
  sha256: string;
}

interface BackupDirectoryManifest {
  directory: string;
  sizeBytes: number;
  /** Absent only in legacy schemaVersion 1 manifests. */
  files?: BackupFileManifest[];
}

interface BackupManifest {
  schemaVersion: 1 | 2;
  createdAt: string;
  payloadSizeBytes: number;
  directories: BackupDirectoryManifest[];
}

const BACKUP_DATA_DIRS = [
  'BANCO', 'APRENDIZADO', 'DTC', 'CONFIG', 'LEITURAS', 'LOGS', 'VIAGENS', 'MANUTENCAO',
] as const;
const RESTORABLE_BACKUP_DATA_DIRS = BACKUP_DATA_DIRS;
const MAX_BACKUPS_TO_KEEP = 5;

const SHA256_K = [
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
];

function rotateRight(value: number, amount: number): number {
  return (value >>> amount) | (value << (32 - amount));
}

/** Small dependency-free SHA-256 implementation for UTF-8 backup payload files. */
function sha256Utf8(value: string): string {
  const bytes: number[] = [];
  for (let index = 0; index < value.length; index += 1) {
    let code = value.charCodeAt(index);
    if (code >= 0xd800 && code <= 0xdbff && index + 1 < value.length) {
      const low = value.charCodeAt(index + 1);
      if (low >= 0xdc00 && low <= 0xdfff) {
        code = 0x10000 + ((code - 0xd800) << 10) + (low - 0xdc00);
        index += 1;
      }
    }
    if (code <= 0x7f) bytes.push(code);
    else if (code <= 0x7ff) bytes.push(0xc0 | (code >>> 6), 0x80 | (code & 0x3f));
    else if (code <= 0xffff) bytes.push(0xe0 | (code >>> 12), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
    else bytes.push(0xf0 | (code >>> 18), 0x80 | ((code >>> 12) & 0x3f), 0x80 | ((code >>> 6) & 0x3f), 0x80 | (code & 0x3f));
  }

  const bitLength = bytes.length * 8;
  bytes.push(0x80);
  while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 0x100000000);
  const low = bitLength >>> 0;
  bytes.push((high >>> 24) & 0xff, (high >>> 16) & 0xff, (high >>> 8) & 0xff, high & 0xff);
  bytes.push((low >>> 24) & 0xff, (low >>> 16) & 0xff, (low >>> 8) & 0xff, low & 0xff);

  const hash = [
    0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a,
    0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
  ];
  const words = new Array<number>(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      const start = offset + index * 4;
      words[index] = ((bytes[start] << 24) | (bytes[start + 1] << 16) | (bytes[start + 2] << 8) | bytes[start + 3]) >>> 0;
    }
    for (let index = 16; index < 64; index += 1) {
      const x = words[index - 15];
      const y = words[index - 2];
      const s0 = rotateRight(x, 7) ^ rotateRight(x, 18) ^ (x >>> 3);
      const s1 = rotateRight(y, 17) ^ rotateRight(y, 19) ^ (y >>> 10);
      words[index] = (words[index - 16] + s0 + words[index - 7] + s1) >>> 0;
    }

    let a = hash[0], b = hash[1], c = hash[2], d = hash[3];
    let e = hash[4], f = hash[5], g = hash[6], h = hash[7];
    for (let index = 0; index < 64; index += 1) {
      const sum1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const temp1 = (h + sum1 + choose + SHA256_K[index] + words[index]) >>> 0;
      const sum0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (sum0 + majority) >>> 0;
      h = g; g = f; f = e; e = (d + temp1) >>> 0;
      d = c; c = b; b = a; a = (temp1 + temp2) >>> 0;
    }
    hash[0] = (hash[0] + a) >>> 0;
    hash[1] = (hash[1] + b) >>> 0;
    hash[2] = (hash[2] + c) >>> 0;
    hash[3] = (hash[3] + d) >>> 0;
    hash[4] = (hash[4] + e) >>> 0;
    hash[5] = (hash[5] + f) >>> 0;
    hash[6] = (hash[6] + g) >>> 0;
    hash[7] = (hash[7] + h) >>> 0;
  }
  return hash.map((part) => part.toString(16).padStart(8, '0')).join('');
}

async function listDirectoryFiles(directoryPath: string, prefix = ''): Promise<BackupFileManifest[]> {
  const output: BackupFileManifest[] = [];
  const children = await FileSystem.readDirectoryAsync(directoryPath);
  for (const child of children) {
    const fullPath = directoryPath + '/' + child;
    const relativePath = prefix ? prefix + '/' + child : child;
    const info = await FileSystem.getInfoAsync(fullPath, { size: true });
    if (!info.exists) throw new Error('BACKUP_FILE_DISAPPEARED: ' + relativePath);
    if (info.isDirectory) {
      output.push(...await listDirectoryFiles(fullPath, relativePath));
      continue;
    }
    if (typeof info.size !== 'number' || !Number.isFinite(info.size) || info.size < 0) {
      throw new Error('BACKUP_FILE_SIZE_UNAVAILABLE: ' + relativePath);
    }
    const content = await FileSystem.readAsStringAsync(fullPath, { encoding: FileSystem.EncodingType.UTF8 });
    output.push({ path: relativePath, sizeBytes: info.size, sha256: sha256Utf8(content) });
  }
  return output.sort((left, right) => left.path.localeCompare(right.path));
}

function isSafeRelativeFilePath(path: string): boolean {
  return typeof path === 'string' && path.length > 0 && !path.startsWith('/')
    && !path.includes('\\') && path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

async function verifyDirectoryFiles(directoryPath: string, expectedFiles: BackupFileManifest[]): Promise<void> {
  const actualFiles = await listDirectoryFiles(directoryPath);
  if (actualFiles.length !== expectedFiles.length) {
    throw new Error('BACKUP_FILE_COUNT_MISMATCH: ' + directoryPath);
  }
  const expected = new Map(expectedFiles.map((entry) => [entry.path, entry]));
  for (const actual of actualFiles) {
    const wanted = expected.get(actual.path);
    if (!wanted || wanted.sizeBytes !== actual.sizeBytes) {
      throw new Error('BACKUP_FILE_SIZE_OR_PATH_MISMATCH: ' + actual.path);
    }
    if (wanted.sha256 !== actual.sha256) {
      throw new Error('BACKUP_FILE_HASH_MISMATCH: ' + actual.path);
    }
  }
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
    (parsed.schemaVersion !== 1 && parsed.schemaVersion !== 2) ||
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
      !(RESTORABLE_BACKUP_DATA_DIRS as readonly string[]).includes(entry.directory) ||
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
    if (parsed.schemaVersion === 2) {
      if (!Array.isArray(entry.files)) throw new Error('BACKUP_FILE_MANIFEST_MISSING: ' + entry.directory);
      const filePaths = new Set<string>();
      for (const file of entry.files) {
        if (
          !file ||
          !isSafeRelativeFilePath(file.path) ||
          filePaths.has(file.path) ||
          typeof file.sizeBytes !== 'number' ||
          !Number.isFinite(file.sizeBytes) ||
          file.sizeBytes < 0 ||
          typeof file.sha256 !== 'string' ||
          !/^[a-f0-9]{64}$/i.test(file.sha256)
        ) {
          throw new Error('BACKUP_FILE_MANIFEST_INVALID: ' + entry.directory);
        }
        filePaths.add(file.path);
      }
      await verifyDirectoryFiles(source, entry.files);
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

async function createBackupSnapshot(
  basePath: string,
  dataDirectories: readonly string[] = BACKUP_DATA_DIRS,
): Promise<BackupInfo> {
  await flushCsvLogs();
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupRoot = `${basePath}/BACKUP`;
  const backupDir = `${backupRoot}/meriva_smart_${timestamp}`;
  await FileSystem.makeDirectoryAsync(backupDir, { intermediates: true });

  const included: string[] = [];
  const files: BackupDirectoryManifest[] = [];
  let totalSize = 0;

  try {
    for (const dir of dataDirectories) {
      if (!(RESTORABLE_BACKUP_DATA_DIRS as readonly string[]).includes(dir)) {
        throw new Error('BACKUP_DIRECTORY_NOT_ALLOWED: ' + dir);
      }
      const source = `${basePath}/${dir}`;
      const dest = `${backupDir}/${dir}`;
      const info = await FileSystem.getInfoAsync(source);
      if (!info.exists) continue;
      if (!info.isDirectory) throw new Error('BACKUP_SOURCE_NOT_DIRECTORY: ' + source);

      const sourceSize = await getDirectorySize(source);
      const sourceFiles = await listDirectoryFiles(source);
      await FileSystem.copyAsync({ from: source, to: dest });
      const copiedSize = await getDirectorySize(dest);
      if (copiedSize !== sourceSize) {
        throw new Error(`BACKUP_VERIFICATION_FAILED: ${dir} source=${sourceSize} copied=${copiedSize}`);
      }
      await verifyDirectoryFiles(dest, sourceFiles);
      totalSize += copiedSize;
      included.push(dir);
      files.push({ directory: dir, sizeBytes: copiedSize, files: sourceFiles });
    }

    const manifest: BackupManifest = {
      schemaVersion: 2,
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

/** Backups rotineiros preservam todos os oito diretórios, inclusive LEITURAS e LOGS. */
export async function createBackup(basePath: string): Promise<BackupInfo> {
  return createBackupSnapshot(basePath, BACKUP_DATA_DIRS);
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
      const stagedPath = `${stagingDir}/${entry.directory}`;
      const stagedSize = await getDirectorySize(stagedPath);
      if (stagedSize !== entry.sizeBytes) throw new Error('RESTORE_STAGING_VERIFY_FAILED: ' + entry.directory);
      if (entry.files) await verifyDirectoryFiles(stagedPath, entry.files);
    }

    // O snapshot de rollback deve incluir exatamente as pastas que a
    // restauração selecionada substituirá, inclusive CSVs de backups antigos.
    const safety = await createBackupSnapshot(
      basePath,
      manifest.directories.map((entry) => entry.directory),
    );
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
        if (entry.files) await verifyDirectoryFiles(target, entry.files);
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
            if (safetyEntry.files) await verifyDirectoryFiles(target, safetyEntry.files);
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
      preservedDirectories: RESTORABLE_BACKUP_DATA_DIRS.filter((dir) =>
        !manifest.directories.some((entry) => entry.directory === dir),
      ),
    };
  } finally {
    await FileSystem.deleteAsync(stagingDir, { idempotent: true }).catch(() => undefined);
  }
}
