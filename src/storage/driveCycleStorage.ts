import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';
import { CURRENT_HISTORY_SCHEMA_VERSION, migrateHistoryIndexDocument } from './historyIndexMigrations';
import { recordStorageHealthIssue, clearStorageHealthIssue } from './storageHealth';

const indexWriteQueues = new Map<string, Promise<unknown>>();

async function serializeIndexWrite<T>(indexFile: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexWriteQueues.get(indexFile) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  indexWriteQueues.set(indexFile, current);
  try {
    return await current;
  } finally {
    if (indexWriteQueues.get(indexFile) === current) indexWriteQueues.delete(indexFile);
  }
}

function localDateKey(date: Date): string {
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

function indexBackupPath(indexFile: string): string { return indexFile.replace(/\.json$/, '.previous.json'); }
function uniqueTemporaryPath(indexFile: string, suffix: string): string {
  return indexFile + '.' + suffix + '-' + Date.now() + '-' + Math.random().toString(16).slice(2) + '.tmp';
}

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const cycle = value as Partial<DriveCycle>;
  const finiteNonNegative = (item: unknown): item is number =>
    typeof item === 'number' && Number.isFinite(item) && item >= 0;
  const validDate = (item: unknown): item is string =>
    typeof item === 'string' && item.trim().length > 0 && Number.isFinite(Date.parse(item));
  const rawCycles = cycle.telemetrySamples;
  return (
    typeof cycle.id === 'string' && cycle.id.trim().length > 0 &&
    validDate(cycle.startedAt) && validDate(cycle.finishedAt) &&
    finiteNonNegative(cycle.distanceTotalKm) &&
    finiteNonNegative(cycle.distanceIceKm) &&
    finiteNonNegative(cycle.fuelUsedL) &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    finiteNonNegative(cycle.avgDrivingSpeedKmh) &&
    finiteNonNegative(cycle.avgFuelConsumptionKml) &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || finiteNonNegative(cycle.maxSpeedKmh)) &&
    (rawCycles === undefined || (Array.isArray(rawCycles) && rawCycles.every((sample) =>
      typeof sample === 'object' && sample !== null && !Array.isArray(sample) &&
      validDate(sample.timestamp) &&
      (sample.speedKmh === null || finiteNonNegative(sample.speedKmh)) &&
      (sample.rpm === null || finiteNonNegative(sample.rpm)) &&
      (sample.coolantTempC === null || (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
    ))) &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    validDate(cycle.importedAt)
  );
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

type DriveCycleIndex = {
  version: string;
  schemaVersion: number;
  cycles: DriveCycle[];
  totalCount: number;
  initializedAt?: string;
  lastModified?: string;
  [key: string]: unknown;
};

type IndexInspection =
  | { kind: 'MISSING' }
  | { kind: 'CORRUPT'; reason: string }
  | { kind: 'FUTURE'; version: number }
  | { kind: 'VALID'; document: DriveCycleIndex; migrated: boolean };

function validateIndexCycles(value: unknown): DriveCycle[] | null {
  if (!Array.isArray(value)) return null;
  const onlySeeds = value.every((item) =>
    isRecord(item) && item.source === 'CARSCANNER_SEED',
  );
  const invalidNonSeeds = value.some((item) =>
    !(isRecord(item) && item.source === 'CARSCANNER_SEED') && !isDriveCycle(item),
  );
  const valid = value.filter(isDriveCycle);
  if (invalidNonSeeds || (value.length > 0 && valid.length === 0 && !onlySeeds)) return null;
  return valid;
}

async function inspectIndexFile(filePath: string): Promise<IndexInspection> {
  const info = await FileSystem.getInfoAsync(filePath);
  if (!info.exists) return { kind: 'MISSING' };
  if (info.isDirectory) return { kind: 'CORRUPT', reason: 'O caminho do índice aponta para um diretório.' };

  let parsed: unknown;
  try {
    parsed = JSON.parse(await FileSystem.readAsStringAsync(filePath, {
      encoding: FileSystem.EncodingType.UTF8,
    }));
  } catch {
    return { kind: 'CORRUPT', reason: 'O JSON do índice não pôde ser interpretado.' };
  }
  if (!isRecord(parsed)) return { kind: 'CORRUPT', reason: 'O documento JSON do índice não é um objeto.' };

  if (typeof parsed.schemaVersion === 'number' &&
      Number.isInteger(parsed.schemaVersion) &&
      parsed.schemaVersion > CURRENT_HISTORY_SCHEMA_VERSION) {
    return { kind: 'FUTURE', version: parsed.schemaVersion };
  }

  try {
    const migration = migrateHistoryIndexDocument(parsed);
    const cycles = validateIndexCycles(migration.document.cycles);
    if (!cycles) return { kind: 'CORRUPT', reason: 'A lista de viagens contém registros inválidos.' };

    const document: DriveCycleIndex = {
      ...migration.document,
      version: typeof migration.document.version === 'string' ? migration.document.version : '1.0',
      schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION,
      cycles,
      totalCount: cycles.length,
    };
    return { kind: 'VALID', document, migrated: migration.migrated };
  } catch (cause) {
    return {
      kind: 'CORRUPT',
      reason: cause instanceof Error ? cause.message : 'Falha ao validar o índice.',
    };
  }
}

async function readCyclesFromFile(filePath: string): Promise<DriveCycle[] | null> {
  const inspected = await inspectIndexFile(filePath);
  if (inspected.kind !== 'VALID') return null;
  return inspected.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
}

async function preserveVerifiedMainAsPrevious(
  indexFile: string,
  main: IndexInspection,
  previous: IndexInspection,
): Promise<void> {
  if (main.kind !== 'VALID') return;
  if (previous.kind === 'FUTURE') {
    throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA ANTERIOR PRESERVADA.');
  }
  if (previous.kind === 'CORRUPT') {
    throw new Error('HISTORY_PREVIOUS_JSON_CORRUPTED; CÓPIA ANTERIOR PRESERVADA.');
  }

  const backup = indexBackupPath(indexFile);
  const backupTemp = uniqueTemporaryPath(backup, 'backup-copy');
  try {
    await FileSystem.copyAsync({ from: indexFile, to: backupTemp });
    const copied = await inspectIndexFile(backupTemp);
    if (copied.kind !== 'VALID' ||
        copied.document.cycles.length !== main.document.cycles.length) {
      throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_VALIDADO; HISTORICO_NAO_SUBSTITUIDO.');
    }
    if (previous.kind === 'VALID' || previous.kind === 'MISSING') {
      if (previous.kind === 'VALID') await FileSystem.deleteAsync(backup, { idempotent: true });
      await FileSystem.moveAsync({ from: backupTemp, to: backup });
    }
    const committedBackup = await inspectIndexFile(backup);
    if (committedBackup.kind !== 'VALID' ||
        committedBackup.document.cycles.length !== main.document.cycles.length) {
      throw new Error('BACKUP_PREVIO_DO_INDICE_NAO_CONFIRMADO; HISTORICO_NAO_SUBSTITUIDO.');
    }
  } finally {
    await FileSystem.deleteAsync(backupTemp, { idempotent: true }).catch(() => undefined);
  }
}

async function persistIndexSnapshot(indexFile: string, data: Omit<DriveCycleIndex, 'schemaVersion'> & { schemaVersion?: number }): Promise<void> {
  const main = await inspectIndexFile(indexFile);
  const previous = await inspectIndexFile(indexBackupPath(indexFile));

  // Nunca substituir um JSON principal corrompido ou criado por versão futura.
  if (main.kind === 'FUTURE') {
    recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro do histórico', 'O índice de viagens pertence a uma versão mais nova. Nenhuma gravação foi executada.', 'critical');
    throw new Error('HISTORY_SCHEMA_VERSION_NEWER_THAN_APP; HISTÓRICO PRESERVADO SEM DOWNGRADE.');
  }
  if (main.kind === 'CORRUPT') {
    recordStorageHealthIssue('HISTORY_CORRUPTED', 'Histórico JSON corrompido', main.reason + ' O arquivo original foi preservado e a gravação foi bloqueada.', 'critical');
    throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO; ARQUIVO ORIGINAL PRESERVADO; GRAVACAO BLOQUEADA.');
  }
  if (previous.kind === 'FUTURE') {
    recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro na cópia anterior', 'A cópia anterior do índice pertence a uma versão mais nova. Nenhuma gravação foi executada.', 'critical');
    throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA PRESERVADA.');
  }
  if (previous.kind === 'CORRUPT') {
    recordStorageHealthIssue('HISTORY_CORRUPTED', 'Cópia anterior do histórico inválida', previous.reason + ' A cópia foi preservada e a gravação foi bloqueada.', 'critical');
    throw new Error('HISTORY_PREVIOUS_JSON_CORRUPTED; CÓPIA PRESERVADA; GRAVACAO BLOQUEADA.');
  }

  const snapshot: DriveCycleIndex = {
    ...data,
    schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION,
    totalCount: data.cycles.length,
  };
  const tempFile = uniqueTemporaryPath(indexFile, 'snapshot');
  try {
    const serialized = JSON.stringify(snapshot, null, 2);
    await FileSystem.writeAsStringAsync(tempFile, serialized, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const temp = await inspectIndexFile(tempFile);
    if (temp.kind !== 'VALID' ||
        temp.document.schemaVersion !== CURRENT_HISTORY_SCHEMA_VERSION ||
        temp.document.cycles.length !== snapshot.cycles.length ||
        temp.document.totalCount !== snapshot.cycles.length) {
      throw new Error('VALIDACAO_DO_INDICE_TEMPORARIO_FALHOU; ÍNDICE PRINCIPAL PRESERVADO.');
    }

    await preserveVerifiedMainAsPrevious(indexFile, main, previous);

    const currentMain = await FileSystem.getInfoAsync(indexFile);
    if (currentMain.exists) await FileSystem.deleteAsync(indexFile, { idempotent: true });
    await FileSystem.moveAsync({ from: tempFile, to: indexFile });

    const committed = await inspectIndexFile(indexFile);
    if (committed.kind !== 'VALID' ||
        committed.document.schemaVersion !== CURRENT_HISTORY_SCHEMA_VERSION ||
        committed.document.cycles.length !== snapshot.cycles.length ||
        committed.document.totalCount !== snapshot.cycles.length) {
      throw new Error('VALIDACAO_DO_INDICE_COMMITADO_FALHOU.');
    }
    clearStorageHealthIssue('HISTORY_CORRUPTED');
    clearStorageHealthIssue('FUTURE_SCHEMA');
  } catch (cause) {
    await FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => undefined);
    const now = await FileSystem.getInfoAsync(indexFile);
    if (!now.exists && main.kind === 'VALID') {
      const backup = await inspectIndexFile(indexBackupPath(indexFile));
      if (backup.kind === 'VALID') {
        await FileSystem.copyAsync({ from: indexBackupPath(indexFile), to: indexFile });
      }
    }
    throw cause;
  } finally {
    await FileSystem.deleteAsync(tempFile, { idempotent: true }).catch(() => undefined);
  }
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  return serializeIndexWrite(indexFile, async () => {
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const main = await inspectIndexFile(indexFile);

    if (main.kind === 'FUTURE') {
      recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro do histórico', 'Índice de viagens na versão ' + main.version + '; versão atual do aplicativo: ' + CURRENT_HISTORY_SCHEMA_VERSION + '. O arquivo foi preservado.', 'critical');
      throw new Error('HISTORY_SCHEMA_VERSION_NEWER_THAN_APP; HISTÓRICO PRESERVADO.');
    }
    if (main.kind === 'CORRUPT') {
      recordStorageHealthIssue('HISTORY_CORRUPTED', 'Histórico JSON corrompido', main.reason + ' O índice original foi preservado; a leitura usará somente uma cópia anterior validada, se existir.', 'critical');
      const recovery = await inspectIndexFile(indexBackupPath(indexFile));
      if (recovery.kind === 'VALID') return; // leitura poderá usar a cópia, mas toda gravação permanece bloqueada.
      if (recovery.kind === 'FUTURE') {
        recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro na cópia anterior', 'A recuperação foi bloqueada para não ocultar dados de uma versão mais nova.', 'critical');
        throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA PRESERVADA.');
      }
      throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO_SEM_COPIA_VALIDADA; ARQUIVO PRESERVADO.');
    }

    if (main.kind === 'VALID') {
      const cycles = main.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
      const hasSeed = cycles.length !== main.document.cycles.length;
      if (main.migrated || hasSeed || main.document.totalCount !== cycles.length) {
        await persistIndexSnapshot(indexFile, {
          ...main.document,
          cycles,
          totalCount: cycles.length,
          lastModified: new Date().toISOString(),
        });
      }
      return;
    }

    const previous = await inspectIndexFile(indexBackupPath(indexFile));
    if (previous.kind === 'FUTURE') {
      recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro na cópia anterior', 'A recuperação foi bloqueada para não substituir dados de uma versão mais nova.', 'critical');
      throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA PRESERVADA.');
    }
    if (previous.kind === 'CORRUPT') {
      recordStorageHealthIssue('HISTORY_CORRUPTED', 'Cópia anterior do histórico inválida', previous.reason + ' Nenhum índice vazio foi criado.', 'critical');
      throw new Error('BACKUP_DO_HISTORICO_CORROMPIDO; HISTORICO_NAO_SUBSTITUIDO.');
    }
    if (previous.kind === 'VALID') {
      await persistIndexSnapshot(indexFile, {
        ...previous.document,
        cycles: previous.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED'),
        totalCount: previous.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED').length,
      });
      return;
    }

    await persistIndexSnapshot(indexFile, {
      version: '1.0',
      cycles: [],
      totalCount: 0,
      initializedAt: new Date().toISOString(),
    });
  });
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  const main = await inspectIndexFile(indexFile);
  if (main.kind === 'VALID') return main.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');

  if (main.kind === 'FUTURE') {
    recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro do histórico', 'O índice de viagens pertence a uma versão mais nova. O conteúdo não foi alterado.', 'critical');
    throw new Error('HISTORY_SCHEMA_VERSION_NEWER_THAN_APP; HISTÓRICO PRESERVADO.');
  }

  if (main.kind === 'CORRUPT') {
    recordStorageHealthIssue('HISTORY_CORRUPTED', 'Histórico JSON corrompido', main.reason + ' A leitura tentará apenas a cópia anterior validada; nenhuma gravação será feita.', 'critical');
    const previous = await readCyclesFromFile(indexBackupPath(indexFile));
    if (previous !== null) return previous;
    throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO_SEM_COPIA_VALIDADA; ARQUIVO PRESERVADO.');
  }

  const previous = await inspectIndexFile(indexBackupPath(indexFile));
  if (previous.kind === 'VALID') return previous.document.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  if (previous.kind === 'FUTURE') {
    recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro na cópia anterior', 'A cópia anterior pertence a uma versão mais nova; não foi alterada.', 'critical');
    throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; CÓPIA PRESERVADA.');
  }
  if (previous.kind === 'CORRUPT') {
    recordStorageHealthIssue('HISTORY_CORRUPTED', 'Cópia anterior do histórico inválida', previous.reason + ' Nenhum histórico vazio foi presumido.', 'critical');
    throw new Error('BACKUP_DO_HISTORICO_CORROMPIDO; HISTORICO_NAO_SUBSTITUIDO.');
  }
  return [];
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (!isDriveCycle(cycle) || cycle.source === 'CARSCANNER_SEED') {
    throw new Error('VIAGEM_INVALIDA_OU_SEED_NAO_PODE_SER_PERSISTIDO_NO_HISTORICO_REAL.');
  }

  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  return serializeIndexWrite(indexFile, async () => {
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const main = await inspectIndexFile(indexFile);
    let data: DriveCycleIndex;

    if (main.kind === 'FUTURE') {
      recordStorageHealthIssue('FUTURE_SCHEMA', 'Schema futuro do histórico', 'Gravação de viagem bloqueada; o índice pertence a uma versão mais nova.', 'critical');
      throw new Error('HISTORY_SCHEMA_VERSION_NEWER_THAN_APP; GRAVACAO_DE_VIAGEM_BLOQUEADA.');
    }
    if (main.kind === 'CORRUPT') {
      recordStorageHealthIssue('HISTORY_CORRUPTED', 'Histórico JSON corrompido', main.reason + ' A gravação foi bloqueada e o arquivo original foi preservado.', 'critical');
      throw new Error('HISTORICO_DE_VIAGENS_CORROMPIDO; GRAVACAO_BLOQUEADA; ARQUIVO PRESERVADO.');
    }

    if (main.kind === 'VALID') {
      data = {
        ...main.document,
        cycles: main.document.cycles.filter((item) => item.source !== 'CARSCANNER_SEED'),
      };
    } else {
      const previous = await inspectIndexFile(indexBackupPath(indexFile));
      if (previous.kind === 'FUTURE') throw new Error('HISTORY_PREVIOUS_SCHEMA_VERSION_NEWER_THAN_APP; GRAVACAO BLOQUEADA.');
      if (previous.kind === 'CORRUPT') throw new Error('BACKUP_DO_HISTORICO_CORROMPIDO; GRAVACAO BLOQUEADA.');
      data = previous.kind === 'VALID'
        ? { ...previous.document, cycles: previous.document.cycles.filter((item) => item.source !== 'CARSCANNER_SEED') }
        : { version: '1.0', schemaVersion: CURRENT_HISTORY_SCHEMA_VERSION, cycles: [], totalCount: 0 };
    }

    const existingIndex = data.cycles.findIndex((item) => item.id === cycle.id);
    if (existingIndex >= 0) data.cycles[existingIndex] = cycle;
    else data.cycles.push(cycle);
    data.totalCount = data.cycles.length;
    data.lastModified = new Date().toISOString();
    await persistIndexSnapshot(indexFile, data);

    const parsedStart = Date.parse(cycle.startedAt);
    const csvDate = new Date(Number.isFinite(parsedStart) ? parsedStart : Date.now());
    const today = localDateKey(csvDate);
    const csvFile = `${viagensDir}/viagens_${today}.csv`;
    const row: CsvRow = {
      id: cycle.id,
      timestamp: cycle.startedAt,
      distanceTotalKm: cycle.distanceTotalKm,
      distanceIceKm: cycle.distanceIceKm,
      fuelUsedL: cycle.fuelUsedL,
      totalTime: cycle.totalTimeHms,
      drivingTime: cycle.drivingTimeHms,
      standingTime: cycle.standingTimeHms,
      avgSpeed: cycle.avgDrivingSpeedKmh,
      maxSpeed: cycle.maxSpeedKmh ?? '',
      avgConsumption: cycle.fuelDataValid === false ? '' : cycle.avgFuelConsumptionKml,
      telemetrySamples: cycle.telemetrySamples?.length ?? 0,
      source: cycle.source,
    };
    await appendCsvRow(csvFile, row);
  });
}
