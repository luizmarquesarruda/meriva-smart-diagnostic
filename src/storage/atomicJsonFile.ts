import * as FileSystem from 'expo-file-system';

export interface JsonRecoveryResult<T> {
  value: T | null;
  recoveredFromPrevious: boolean;
}

type Validator<T> = (value: unknown) => value is T;
type FutureVersionCheck = (value: unknown) => boolean;

const writeQueues = new Map<string, Promise<void>>();

function previousPath(path: string): string {
  return path.endsWith('.json') ? path.replace(/\.json$/, '.previous.json') : path + '.previous';
}
function temporaryPath(path: string): string { return path + '.tmp'; }
function previousTemporaryPath(path: string): string { return previousPath(path) + '.tmp'; }

interface Candidate<T> {
  kind: 'MISSING' | 'VALID' | 'INVALID' | 'FUTURE';
  value?: T;
  sourcePath?: string;
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

async function findPrevious<T>(
  path: string,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck,
): Promise<Candidate<T>> {
  let sawInvalid = false;
  for (const candidatePath of [previousPath(path), previousTemporaryPath(path)]) {
    const candidate = await readCandidate(candidatePath, validate, isFutureVersion);
    if (candidate.kind === 'FUTURE') return { ...candidate, sourcePath: candidatePath };
    if (candidate.kind === 'VALID') return { ...candidate, sourcePath: candidatePath };
    if (candidate.kind === 'INVALID') sawInvalid = true;
  }
  return { kind: sawInvalid ? 'INVALID' : 'MISSING' };
}

export async function readJsonWithRecovery<T>(
  path: string,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck = () => false,
): Promise<JsonRecoveryResult<T>> {
  await (writeQueues.get(path) ?? Promise.resolve()).catch(() => undefined);
  const info = await FileSystem.getInfoAsync(path);
  const main = info.exists
    ? await readCandidate(path, validate, isFutureVersion)
    : { kind: 'MISSING' as const };

  if (main.kind === 'FUTURE') throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
  if (main.kind === 'VALID') return { value: main.value as T, recoveredFromPrevious: false };

  const previous = await findPrevious(path, validate, isFutureVersion);
  if (previous.kind === 'FUTURE') throw new Error('JSON_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
  if (previous.kind === 'VALID') {
    return { value: previous.value as T, recoveredFromPrevious: true };
  }
  if (main.kind === 'MISSING' && previous.kind === 'MISSING') {
    return { value: null, recoveredFromPrevious: false };
  }
  if (main.kind === 'MISSING') throw new Error('JSON_PREVIOUS_COPY_INVALID: ' + path);
  throw new Error('JSON_CORRUPTED_WITHOUT_VALID_PREVIOUS_COPY: ' + path);
}

export async function writeJsonAtomically<T>(
  path: string,
  value: T,
  validate: Validator<T>,
  isFutureVersion: FutureVersionCheck = () => false,
): Promise<void> {
  const previous = writeQueues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(async () => {
    const content = JSON.stringify(value, null, 2);
    if (typeof content !== 'string') throw new Error('JSON_SERIALIZATION_FAILED: ' + path);
    const serialized: unknown = JSON.parse(content);
    if (isFutureVersion(serialized)) throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
    if (!validate(serialized)) throw new Error('JSON_PAYLOAD_VALIDATION_FAILED: ' + path);

    const temp = temporaryPath(path);
    const backup = previousPath(path);
    const backupTemp = previousTemporaryPath(path);
    await FileSystem.deleteAsync(temp, { idempotent: true });
    await FileSystem.writeAsStringAsync(temp, content, { encoding: FileSystem.EncodingType.UTF8 });

    const tempCandidate = await readCandidate(temp, validate, isFutureVersion);
    if (tempCandidate.kind !== 'VALID') {
      await FileSystem.deleteAsync(temp, { idempotent: true });
      throw new Error('JSON_TEMPORARY_READBACK_FAILED: ' + path);
    }

    try {
      const mainInfo = await FileSystem.getInfoAsync(path);
      if (mainInfo.exists) {
        const main = await readCandidate(path, validate, isFutureVersion);
        if (main.kind === 'FUTURE') throw new Error('JSON_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
        if (main.kind === 'VALID') {
          await FileSystem.deleteAsync(backupTemp, { idempotent: true });
          await FileSystem.copyAsync({ from: path, to: backupTemp });
          const verifiedBackup = await readCandidate(backupTemp, validate, isFutureVersion);
          if (verifiedBackup.kind !== 'VALID') throw new Error('JSON_PREVIOUS_COPY_VALIDATION_FAILED: ' + path);
          await FileSystem.deleteAsync(backup, { idempotent: true });
          await FileSystem.moveAsync({ from: backupTemp, to: backup });
        } else {
          const existingBackup = await findPrevious(path, validate, isFutureVersion);
          if (existingBackup.kind === 'FUTURE') {
            throw new Error('JSON_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
          }
          if (existingBackup.kind !== 'VALID') {
            throw new Error('JSON_CORRUPTED_WITHOUT_VALID_PREVIOUS_COPY: ' + path);
          }
          await FileSystem.copyAsync({ from: path, to: path + '.corrupt-' + Date.now() });
        }
        await FileSystem.deleteAsync(path, { idempotent: true });
      } else {
        const existingBackup = await findPrevious(path, validate, isFutureVersion);
        if (existingBackup.kind === 'FUTURE') {
          throw new Error('JSON_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP: ' + path);
        }
        if (existingBackup.kind === 'INVALID') {
          throw new Error('JSON_PREVIOUS_COPY_INVALID: ' + path);
        }
      }

      await FileSystem.moveAsync({ from: temp, to: path });
      const committed = await readCandidate(path, validate, isFutureVersion);
      if (committed.kind !== 'VALID') throw new Error('JSON_COMMITTED_READBACK_FAILED: ' + path);
    } catch (cause) {
      await FileSystem.deleteAsync(temp, { idempotent: true });
      const currentMain = await readCandidate(path, validate, isFutureVersion);
      // Never replace data authored by a newer app, even during error recovery.
      if (currentMain.kind === 'FUTURE') throw cause;
      const recovery = await findPrevious(path, validate, isFutureVersion);
      if (recovery.kind === 'VALID' && currentMain.kind !== 'VALID') {
        await FileSystem.deleteAsync(path, { idempotent: true });
        if (!recovery.sourcePath) throw new Error('JSON_PREVIOUS_SOURCE_PATH_MISSING: ' + path);
        await FileSystem.copyAsync({ from: recovery.sourcePath, to: path });
      }
      throw cause;
    }
  });

  writeQueues.set(path, current);
  try {
    await current;
  } finally {
    if (writeQueues.get(path) === current) writeQueues.delete(path);
  }
}
