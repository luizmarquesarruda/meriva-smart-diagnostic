import * as FileSystem from 'expo-file-system';

export interface JsonRecoveryResult<T> {
  value: T | null;
  recoveredFromPrevious: boolean;
}

type Validator<T> = (value: unknown) => value is T;
type FutureVersionCheck = (value: unknown) => boolean;

type Candidate<T> =
  | { kind: 'MISSING' }
  | { kind: 'INVALID' }
  | { kind: 'FUTURE' }
  | { kind: 'VALID'; value: T };

function previousPath(path: string): string {
  return path.endsWith('.json') ? path.replace(/\.json$/, '.previous.json') : path + '.previous';
}

function uniqueTemporaryPath(path: string, purpose: string): string {
  return path + '.' + purpose + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.tmp';
}

async function readCandidate<T>(
  path: string,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck,
): Promise<Candidate<T>> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return { kind: 'MISSING' };
  if (info.isDirectory) return { kind: 'INVALID' };

  try {
    const parsed: unknown = JSON.parse(await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    }));
    if (isFutureVersion(parsed)) return { kind: 'FUTURE' };
    return validate(parsed) ? { kind: 'VALID', value: parsed } : { kind: 'INVALID' };
  } catch {
    return { kind: 'INVALID' };
  }
}

/**
 * Lê o arquivo principal ou, somente para leitura, usa uma cópia anterior
 * integralmente validada. Nunca repara nem substitui o arquivo durante a leitura.
 */
export async function readJsonWithRecovery<T>(
  path: string,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck = () => false,
): Promise<JsonRecoveryResult<T>> {
  const main = await readCandidate(path, validate, isFutureVersion);
  if (main.kind === 'FUTURE') throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
  if (main.kind === 'VALID') return { value: main.value, recoveredFromPrevious: false };

  const previous = await readCandidate(previousPath(path), validate, isFutureVersion);
  if (previous.kind === 'FUTURE') throw new Error('JSON_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
  if (previous.kind === 'VALID') return { value: previous.value, recoveredFromPrevious: true };
  if (main.kind === 'MISSING' && previous.kind === 'MISSING') {
    return { value: null, recoveredFromPrevious: false };
  }
  if (main.kind === 'MISSING') {
    throw new Error('JSON_PREVIOUS_COPY_INVALID; ARQUIVOS PRESERVADOS: ' + path);
  }
  throw new Error('JSON_CORRUPTED_WITHOUT_VALID_PREVIOUS_COPY; ARQUIVOS PRESERVADOS: ' + path);
}

/**
 * Substituição validada e atômica. Se o principal ou a cópia anterior existentes
 * estiverem corrompidos ou em schema futuro, a gravação é bloqueada sem alterá-los.
 */
export async function writeJsonAtomically<T>(
  path: string,
  value: T,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck = () => false,
): Promise<void> {
  const content = JSON.stringify(value, null, 2);
  if (typeof content !== 'string') throw new Error('JSON_SERIALIZATION_FAILED: ' + path);
  const serialized: unknown = JSON.parse(content);
  if (isFutureVersion(serialized)) throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
  if (!validate(serialized)) throw new Error('JSON_PAYLOAD_VALIDATION_FAILED: ' + path);

  const backup = previousPath(path);
  const mainBefore = await readCandidate(path, validate, isFutureVersion);
  const backupBefore = await readCandidate(backup, validate, isFutureVersion);

  if (mainBefore.kind === 'FUTURE') throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP; ARQUIVO PRESERVADO: ' + path);
  if (mainBefore.kind === 'INVALID') throw new Error('JSON_CORRUPTED; ARQUIVO ORIGINAL PRESERVADO; GRAVACAO BLOQUEADA: ' + path);
  if (backupBefore.kind === 'FUTURE') throw new Error('JSON_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA PRESERVADA: ' + path);
  if (backupBefore.kind === 'INVALID') throw new Error('JSON_PREVIOUS_COPY_INVALID; CÓPIA PRESERVADA; GRAVACAO BLOQUEADA: ' + path);

  const temp = uniqueTemporaryPath(path, 'snapshot');
  const backupTemp = uniqueTemporaryPath(backup, 'snapshot');
  try {
    await FileSystem.writeAsStringAsync(temp, content, { encoding: FileSystem.EncodingType.UTF8 });
    const staged = await readCandidate(temp, validate, isFutureVersion);
    if (staged.kind !== 'VALID') throw new Error('JSON_TEMPORARY_READBACK_FAILED: ' + path);

    if (mainBefore.kind === 'VALID') {
      await FileSystem.copyAsync({ from: path, to: backupTemp });
      const verifiedBackup = await readCandidate(backupTemp, validate, isFutureVersion);
      if (verifiedBackup.kind !== 'VALID') throw new Error('JSON_PREVIOUS_COPY_VALIDATION_FAILED: ' + path);

      if (backupBefore.kind === 'VALID') await FileSystem.deleteAsync(backup, { idempotent: true });
      await FileSystem.moveAsync({ from: backupTemp, to: backup });
      const committedBackup = await readCandidate(backup, validate, isFutureVersion);
      if (committedBackup.kind !== 'VALID') throw new Error('JSON_PREVIOUS_COPY_COMMIT_FAILED: ' + path);
    }

    if (mainBefore.kind === 'VALID') await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: temp, to: path });
    const committed = await readCandidate(path, validate, isFutureVersion);
    if (committed.kind !== 'VALID') throw new Error('JSON_COMMITTED_READBACK_FAILED: ' + path);
  } catch (cause) {
    const currentMain = await readCandidate(path, validate, isFutureVersion);
    if (currentMain.kind === 'MISSING') {
      const recovery = await readCandidate(backup, validate, isFutureVersion);
      if (recovery.kind === 'VALID') {
        await FileSystem.copyAsync({ from: backup, to: path });
        const restored = await readCandidate(path, validate, isFutureVersion);
        if (restored.kind !== 'VALID') {
          throw new Error('JSON_RECOVERY_COPY_FAILED: ' + path + '; original=' +
            (cause instanceof Error ? cause.message : String(cause)));
        }
      }
    }
    throw cause;
  } finally {
    await FileSystem.deleteAsync(temp, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(backupTemp, { idempotent: true }).catch(() => undefined);
  }
}
