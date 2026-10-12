import * as FileSystem from 'expo-file-system';
import { appendCsvRow, type CsvRow } from '../database/csvLogger';
import type { DriveCycle } from '../data/driveCycles';

interface DriveCycleIndex {
  version: string;
  initializedAt?: string;
  lastModified?: string;
  totalCount: number;
  cycles: DriveCycle[];
  [key: string]: unknown;
}

const INDEX_FILE = 'index.json';
const BACKUP_FILE = 'index.previous.json';
const PENDING_CYCLES_DIRECTORY = 'PENDING_CYCLES';
const MAX_CORRUPT_ARCHIVES = 3;

function indexPath(basePath: string): string {
  return `${basePath}/VIAGENS/${INDEX_FILE}`;
}

function backupPath(basePath: string): string {
  return `${basePath}/VIAGENS/${BACKUP_FILE}`;
}

function pendingCyclesDirectory(basePath: string): string {
  return `${basePath}/VIAGENS/${PENDING_CYCLES_DIRECTORY}`;
}

function pendingCycleStem(id: string): string {
  // Stable compact key; the full ID is still verified in the saved JSON.
  let hash = 2166136261;
  for (let index = 0; index < id.length; index += 1) {
    hash ^= id.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  const slug = id.replace(/[^A-Za-z0-9_-]/g, '_').slice(0, 36) || 'trip';
  return `pending_${(hash >>> 0).toString(16).padStart(8, '0')}_${slug}`;
}

interface PendingCycleEntry {
  path: string;
  cycle: DriveCycle;
}

async function readPendingCycles(basePath: string): Promise<PendingCycleEntry[]> {
  const directory = pendingCyclesDirectory(basePath);
  try {
    const info = await FileSystem.getInfoAsync(directory);
    if (!info.exists || !info.isDirectory) return [];
    const names = await FileSystem.readDirectoryAsync(directory);
    const entries: PendingCycleEntry[] = [];
    for (const name of names.filter((item) => /^pending_.+\.json$/.test(item))) {
      const path = `${directory}/${name}`;
      try {
        const raw = JSON.parse(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 }));
        if (isDriveCycle(raw)) entries.push({ path, cycle: raw });
      } catch {
        // Keep a damaged sidecar for manual recovery; never delete it by guessing.
      }
    }
    return entries;
  } catch {
    return [];
  }
}

/**
 * Write-ahead copy for each finalized trip. A valid sidecar remains available
 * even when the main index and its backup cannot be safely rewritten.
 */
async function persistPendingCycle(basePath: string, cycle: DriveCycle): Promise<string> {
  const directory = pendingCyclesDirectory(basePath);
  await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  const stem = pendingCycleStem(cycle.id);

  for (let attempt = 0; attempt < 100; attempt += 1) {
    const suffix = attempt === 0 ? '' : `_${attempt}`;
    const target = `${directory}/${stem}${suffix}.json`;
    const info = await FileSystem.getInfoAsync(target);
    if (info.exists) {
      if (info.isDirectory) continue;
      try {
        const existing = JSON.parse(await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 }));
        if (isDriveCycle(existing) && existing.id === cycle.id) return target;
      } catch {
        // Don't overwrite an unreadable sidecar; try a collision suffix.
      }
      continue;
    }

    const temporary = `${target}.tmp`;
    const serialized = JSON.stringify(cycle, null, 2);
    await FileSystem.writeAsStringAsync(temporary, serialized, { encoding: FileSystem.EncodingType.UTF8 });
    const written = JSON.parse(await FileSystem.readAsStringAsync(temporary, { encoding: FileSystem.EncodingType.UTF8 }));
    if (!isDriveCycle(written) || written.id !== cycle.id) {
      throw new Error('VALIDAÇÃO DA CÓPIA DE RECUPERAÇÃO DA VIAGEM FALHOU.');
    }
    await FileSystem.copyAsync({ from: temporary, to: target });
    const committed = JSON.parse(await FileSystem.readAsStringAsync(target, { encoding: FileSystem.EncodingType.UTF8 }));
    if (!isDriveCycle(committed) || committed.id !== cycle.id) {
      throw new Error('CÓPIA DE RECUPERAÇÃO DA VIAGEM NÃO PASSOU NA VALIDAÇÃO.');
    }
    await FileSystem.deleteAsync(temporary, { idempotent: true });
    return target;
  }

  throw new Error('NÃO FOI POSSÍVEL RESERVAR UM ARQUIVO DE RECUPERAÇÃO PARA A VIAGEM.');
}

async function removePendingCycle(path: string): Promise<void> {
  await FileSystem.deleteAsync(path, { idempotent: true });
}

function isFiniteNonNegative(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0;
}

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Partial<DriveCycle>;
  return (
    typeof cycle.id === 'string' && cycle.id.trim().length > 0 &&
    typeof cycle.startedAt === 'string' && cycle.startedAt.length > 0 &&
    typeof cycle.finishedAt === 'string' && cycle.finishedAt.length > 0 &&
    isFiniteNonNegative(cycle.distanceTotalKm) &&
    isFiniteNonNegative(cycle.distanceIceKm) &&
    isFiniteNonNegative(cycle.fuelUsedL) &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    isFiniteNonNegative(cycle.avgDrivingSpeedKmh) &&
    isFiniteNonNegative(cycle.avgFuelConsumptionKml) &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || isFiniteNonNegative(cycle.maxSpeedKmh)) &&
    (cycle.fuelRateSource === undefined ||
      ['MEASURED_015E', 'ESTIMATED_MAF', 'ESTIMATED_MAP', 'MIXED'].includes(cycle.fuelRateSource)) &&
    (cycle.telemetrySamples === undefined || (
      Array.isArray(cycle.telemetrySamples) && cycle.telemetrySamples.every((sample) =>
        typeof sample === 'object' && sample !== null &&
        typeof sample.timestamp === 'string' &&
        (sample.speedKmh === null || isFiniteNonNegative(sample.speedKmh)) &&
        (sample.rpm === null || isFiniteNonNegative(sample.rpm)) &&
        (sample.coolantTempC === null || (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
      )
    )) &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    typeof cycle.importedAt === 'string'
  );
}

function parseIndex(value: unknown): DriveCycleIndex | null {
  if (typeof value !== 'object' || value === null) return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.cycles) || !record.cycles.every(isDriveCycle)) return null;
  if (record.version !== undefined && typeof record.version !== 'string') return null;
  return {
    ...record,
    version: typeof record.version === 'string' ? record.version : '1.0',
    cycles: record.cycles,
    totalCount: record.cycles.length,
  } as DriveCycleIndex;
}

function emptyIndex(): DriveCycleIndex {
  return {
    version: '1.0',
    initializedAt: new Date().toISOString(),
    cycles: [],
    totalCount: 0,
  };
}

async function readValidIndex(path: string): Promise<DriveCycleIndex | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return null;
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 }));
    return parseIndex(parsed);
  } catch {
    return null;
  }
}

function queueIndexMutation<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = indexQueues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  const tail = current.then(() => undefined, () => undefined);
  indexQueues.set(path, tail);
  void tail.finally(() => {
    if (indexQueues.get(path) === tail) indexQueues.delete(path);
  }).catch(() => undefined);
  return current;
}

const indexQueues = new Map<string, Promise<void>>();

async function archiveCorruptIndex(path: string): Promise<void> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists || info.isDirectory) return;
  const directory = path.substring(0, path.lastIndexOf('/'));
  const names = await FileSystem.readDirectoryAsync(directory);
  const archives = names
    .filter((name) => /^index\.json\.corrupt\.\d+\.json$/.test(name))
    .sort();
  while (archives.length >= MAX_CORRUPT_ARCHIVES) {
    const oldest = archives.shift();
    if (oldest) await FileSystem.deleteAsync(`${directory}/${oldest}`, { idempotent: true });
  }
  const archivedPath = `${path}.corrupt.${Date.now()}.json`;
  await FileSystem.copyAsync({ from: path, to: archivedPath });
}

async function writeIndexSafely(basePath: string, index: DriveCycleIndex): Promise<void> {
  const target = indexPath(basePath);
  const backup = backupPath(basePath);
  const temporary = `${target}.tmp`;
  const validIndex = parseIndex(index);
  if (!validIndex) throw new Error('ÍNDICE DE VIAGENS INVÁLIDO; GRAVAÇÃO CANCELADA.');

  await FileSystem.makeDirectoryAsync(`${basePath}/VIAGENS`, { intermediates: true });
  const serialized = JSON.stringify({
    ...validIndex,
    cycles: validIndex.cycles,
    totalCount: validIndex.cycles.length,
    lastModified: new Date().toISOString(),
  }, null, 2);
  await FileSystem.writeAsStringAsync(temporary, serialized, { encoding: FileSystem.EncodingType.UTF8 });

  const writtenTemp = await readValidIndex(temporary);
  if (!writtenTemp || writtenTemp.cycles.length !== validIndex.cycles.length) {
    throw new Error('VALIDAÇÃO DO ÍNDICE TEMPORÁRIO FALHOU; HISTÓRICO ORIGINAL PRESERVADO.');
  }

  const targetInfo = await FileSystem.getInfoAsync(target);
  if (targetInfo.exists && targetInfo.isDirectory) {
    throw new Error('O ÍNDICE DE VIAGENS É UM DIRETÓRIO; HISTÓRICO NÃO ALTERADO.');
  }
  const backupInfo = await FileSystem.getInfoAsync(backup);
  if (backupInfo.exists && backupInfo.isDirectory) {
    throw new Error('O BACKUP DO ÍNDICE DE VIAGENS É UM DIRETÓRIO; HISTÓRICO NÃO ALTERADO.');
  }
  if (targetInfo.exists) {
    const current = await readValidIndex(target);
    if (current) {
      // Keep the last valid snapshot before replacing the primary index.
      await FileSystem.copyAsync({ from: target, to: backup });
    }
  } else if (!backupInfo.exists) {
    await FileSystem.copyAsync({ from: temporary, to: backup });
  }

  await FileSystem.copyAsync({ from: temporary, to: target });
  const committed = await readValidIndex(target);
  const committedIds = committed?.cycles.map((cycle) => cycle.id) ?? [];
  const expectedIds = validIndex.cycles.map((cycle) => cycle.id);
  if (!committed || committedIds.length !== expectedIds.length ||
      committedIds.some((id, index) => id !== expectedIds[index])) {
    throw new Error('ÍNDICE FINAL NÃO PASSOU NA VALIDAÇÃO; CÓPIA DE SEGURANÇA PRESERVADA.');
  }
  await FileSystem.copyAsync({ from: target, to: backup });
  await FileSystem.deleteAsync(temporary, { idempotent: true });
}

async function loadIndexForMutation(basePath: string): Promise<DriveCycleIndex> {
  const target = indexPath(basePath);
  const backup = backupPath(basePath);
  const targetInfo = await FileSystem.getInfoAsync(target);

  if (targetInfo.exists && targetInfo.isDirectory) {
    throw new Error('O ÍNDICE DE VIAGENS É UM DIRETÓRIO; DADOS NÃO ALTERADOS.');
  }

  if (targetInfo.exists) {
    const current = await readValidIndex(target);
    if (current) return current;

    const previous = await readValidIndex(backup);
    if (!previous) {
      throw new Error('ÍNDICE DE VIAGENS CORROMPIDO E SEM BACKUP VÁLIDO. ARQUIVO ORIGINAL PRESERVADO; NOVA GRAVAÇÃO BLOQUEADA.');
    }
    await archiveCorruptIndex(target);
    return previous;
  }

  const previous = await readValidIndex(backup);
  return previous ?? emptyIndex();
}

async function initializeDriveCyclesUnsafe(basePath: string): Promise<void> {
  const target = indexPath(basePath);
  const info = await FileSystem.getInfoAsync(target);

  if (info.exists && info.isDirectory) {
    throw new Error('O ÍNDICE DE VIAGENS É UM DIRETÓRIO; HISTÓRICO PRESERVADO.');
  }

  let index: DriveCycleIndex;
  if (info.exists) {
    const current = await readValidIndex(target);
    if (current) {
      index = current;
    } else {
      const previous = await readValidIndex(backupPath(basePath));
      if (!previous) {
        // Fail closed: never replace an unreadable file with an empty index.
        throw new Error('ÍNDICE DE VIAGENS CORROMPIDO E SEM BACKUP VÁLIDO. HISTÓRICO PRESERVADO.');
      }
      await archiveCorruptIndex(target);
      index = previous;
    }
  } else {
    index = (await readValidIndex(backupPath(basePath))) ?? emptyIndex();
  }

  const pendingEntries = await readPendingCycles(basePath);
  const operationalCycles = index.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  const ids = new Set(operationalCycles.map((cycle) => cycle.id));
  for (const entry of pendingEntries) {
    if (entry.cycle.source !== 'CARSCANNER_SEED' && !ids.has(entry.cycle.id)) {
      operationalCycles.push(entry.cycle);
      ids.add(entry.cycle.id);
    }
  }
  const originalIds = index.cycles.map((cycle) => cycle.id);
  const nextIds = operationalCycles.map((cycle) => cycle.id);
  const changed = originalIds.length !== nextIds.length ||
    originalIds.some((id, indexValue) => id !== nextIds[indexValue]);
  if (changed || !info.exists || !(await readValidIndex(target))) {
    await writeIndexSafely(basePath, { ...index, cycles: operationalCycles, totalCount: operationalCycles.length });
  } else {
    // Repair a missing/stale backup without touching valid operational history.
    const backup = await readValidIndex(backupPath(basePath));
    const primaryIds = index.cycles.map((cycle) => cycle.id);
    const backupIds = backup?.cycles.map((cycle) => cycle.id) ?? [];
    const backupMatches = primaryIds.length === backupIds.length &&
      primaryIds.every((id, indexValue) => id === backupIds[indexValue]);
    if (!backupMatches) {
      const backupPathValue = backupPath(basePath);
      const backupInfo = await FileSystem.getInfoAsync(backupPathValue);
      if (backupInfo.exists && backupInfo.isDirectory) {
        throw new Error('O BACKUP DO ÍNDICE DE VIAGENS É UM DIRETÓRIO; HISTÓRICO PRESERVADO.');
      }
      await FileSystem.copyAsync({ from: target, to: backupPathValue });
    }
  }

  // Delete sidecars only after their IDs are durably present in the main index.
  const committed = await readValidIndex(target);
  if (committed) {
    const committedIds = new Set(committed.cycles.map((cycle) => cycle.id));
    for (const entry of pendingEntries) {
      if (committedIds.has(entry.cycle.id)) await removePendingCycle(entry.path);
    }
  }
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const target = indexPath(basePath);
  await FileSystem.makeDirectoryAsync(`${basePath}/VIAGENS`, { intermediates: true });
  await queueIndexMutation(target, () => initializeDriveCyclesUnsafe(basePath));
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const target = indexPath(basePath);
  await (indexQueues.get(target) ?? Promise.resolve()).catch(() => undefined);

  const primary = await readValidIndex(target);
  const backup = primary ? null : await readValidIndex(backupPath(basePath));
  const baseCycles = (primary ?? backup)?.cycles.filter((cycle) => cycle.source !== 'CARSCANNER_SEED') ?? [];
  const byId = new Map(baseCycles.map((cycle) => [cycle.id, cycle]));

  // Sidecar trips remain visible if the index is too damaged to rewrite safely.
  for (const entry of await readPendingCycles(basePath)) {
    if (entry.cycle.source !== 'CARSCANNER_SEED' && !byId.has(entry.cycle.id)) {
      byId.set(entry.cycle.id, entry.cycle);
    }
  }
  return Array.from(byId.values());
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (!isDriveCycle(cycle)) throw new Error('VIAGEM INVÁLIDA; NÃO FOI PERSISTIDA.');
  if (cycle.source === 'CARSCANNER_SEED') throw new Error('VIAGEM DE REFERÊNCIA NÃO PODE SER SALVA COMO TRAJETO OPERACIONAL.');

  const target = indexPath(basePath);
  await queueIndexMutation(target, async () => {
    await FileSystem.makeDirectoryAsync(`${basePath}/VIAGENS`, { intermediates: true });

    // Write-ahead sidecar before touching the main index. If the index and its
    // backup are both unreadable, the just-finished trip is still durable.
    const pendingPath = await persistPendingCycle(basePath, cycle);
    let data: DriveCycleIndex;
    try {
      data = await loadIndexForMutation(basePath);
    } catch (cause) {
      console.warn(
        '[trips] viagem preservada na fila de recuperação; índice principal não pôde ser atualizado:',
        cause instanceof Error ? cause.message : cause,
      );
      return;
    }

    const operationalCycles = data.cycles.filter((item) => item.source !== 'CARSCANNER_SEED');
    const duplicate = operationalCycles.some((item) => item.id === cycle.id);
    if (duplicate) {
      await removePendingCycle(pendingPath);
      return;
    }

    const nextCycles = [...operationalCycles, cycle];
    try {
      await writeIndexSafely(basePath, {
        ...data,
        cycles: nextCycles,
        totalCount: nextCycles.length,
        lastModified: new Date().toISOString(),
      });
    } catch (cause) {
      // The validated sidecar remains the durable source for readDriveCycles
      // and for later startup reconciliation.
      console.warn(
        '[trips] viagem preservada na fila de recuperação; índice não pôde ser confirmado:',
        cause instanceof Error ? cause.message : cause,
      );
      return;
    }

    await removePendingCycle(pendingPath);

    const today = new Date().toISOString().split('T')[0];
    const csvFile = `${basePath}/VIAGENS/viagens_${today}.csv`;
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

    // The validated JSON index is the source of truth. A CSV export failure
    // must not roll back or hide the already-persisted real trip.
    try {
      await appendCsvRow(csvFile, row);
    } catch (cause) {
      console.warn('[trips] viagem salva no índice; falha secundária na atualização CSV:', cause instanceof Error ? cause.message : cause);
    }
  });
}
