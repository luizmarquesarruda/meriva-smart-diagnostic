import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle } from '../data/driveCycles';

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Partial<DriveCycle>;
  return (
    typeof cycle.id === 'string' &&
    typeof cycle.startedAt === 'string' &&
    typeof cycle.finishedAt === 'string' &&
    typeof cycle.distanceTotalKm === 'number' &&
    typeof cycle.distanceIceKm === 'number' &&
    typeof cycle.fuelUsedL === 'number' &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    typeof cycle.avgDrivingSpeedKmh === 'number' &&
    typeof cycle.avgFuelConsumptionKml === 'number' &&
    (cycle.fuelDataValid === undefined || typeof cycle.fuelDataValid === 'boolean') &&
    (cycle.maxSpeedKmh === undefined || (typeof cycle.maxSpeedKmh === 'number' && Number.isFinite(cycle.maxSpeedKmh) && cycle.maxSpeedKmh >= 0)) &&
    (cycle.telemetrySamples === undefined || (Array.isArray(cycle.telemetrySamples) && cycle.telemetrySamples.every((sample) =>
      typeof sample === 'object' && sample !== null &&
      typeof sample.timestamp === 'string' &&
      (sample.speedKmh === null || (typeof sample.speedKmh === 'number' && Number.isFinite(sample.speedKmh))) &&
      (sample.rpm === null || (typeof sample.rpm === 'number' && Number.isFinite(sample.rpm))) &&
      (sample.coolantTempC === null || (typeof sample.coolantTempC === 'number' && Number.isFinite(sample.coolantTempC)))
    ))) &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    typeof cycle.importedAt === 'string'
  );
}

function cyclesFromUnknown(value: unknown): DriveCycle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDriveCycle);
}

async function readLegacyCycles(indexFile: string): Promise<DriveCycle[]> {
  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (!info.exists || info.isDirectory) return [];
    const data = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as { cycles?: unknown };
    return cyclesFromUnknown(data.cycles).filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  } catch {
    return [];
  }
}

async function writeLegacyCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  const info = await FileSystem.getInfoAsync(indexFile);
  let existing: DriveCycle[] = [];
  if (info.exists) {
    if (info.isDirectory) throw new Error('O índice legado de viagens é um diretório; arquivo preservado.');
    try {
      const data = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as { cycles?: unknown };
      existing = cyclesFromUnknown(data.cycles).filter((item) => item.source !== 'CARSCANNER_SEED');
    } catch {
      throw new Error('Índice legado de viagens ilegível; arquivo preservado para recuperação.');
    }
  }
  existing.push(cycle);
  await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
    version: '1.0',
    cycles: existing,
    totalCount: existing.length,
    lastModified: new Date().toISOString(),
  }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

/** Importa o índice JSON antigo uma vez; a migração SQL é idempotente. */
async function migrateLegacyCycles(indexFile: string): Promise<void> {
  const localDb = await import('./localDatabase');
  if (await localDb.getLocalMetadata('migration.drive_cycles.v1') === 'complete') return;
  const cycles = await readLegacyCycles(indexFile);
  await localDb.importLegacyDriveCycles(cycles);
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
  const indexInfo = await FileSystem.getInfoAsync(indexFile);

  if (!indexInfo.exists) {
    await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
      version: '1.0',
      initializedAt: new Date().toISOString(),
      cycles: [],
      totalCount: 0,
    }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
  } else if (!indexInfo.isDirectory) {
    // Dados importados do CarScanner continuam excluídos do histórico de viagens.
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as {
        cycles?: unknown; [key: string]: unknown;
      };
      const rawCycles = Array.isArray(parsed.cycles) ? parsed.cycles : [];
      if (rawCycles.some((item) => typeof item === 'object' && item !== null &&
          (item as { source?: unknown }).source === 'CARSCANNER_SEED')) {
        const cycles = cyclesFromUnknown(rawCycles).filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
        await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
          ...parsed, cycles, totalCount: cycles.length, lastModified: new Date().toISOString(),
        }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
      }
    } catch {
      // Não sobrescrever índice legado que não possa ser lido com segurança.
    }
  }

  try {
    await migrateLegacyCycles(indexFile);
  } catch (error) {
    console.warn('[sqlite] migração de viagens pendente; JSON legado preservado:', error instanceof Error ? error.message : error);
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  try {
    await migrateLegacyCycles(indexFile);
    const localDb = await import('./localDatabase');
    return (await localDb.readDriveCyclesFromDatabase()).filter((cycle) => cycle.source !== 'CARSCANNER_SEED');
  } catch {
    // Compatibilidade: se SQLite estiver indisponível, ler o índice JSON legado.
    return readLegacyCycles(indexFile);
  }
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  let storedInSqlite = false;
  if (cycle.source !== 'CARSCANNER_SEED') {
    try {
      await migrateLegacyCycles(indexFile);
      const localDb = await import('./localDatabase');
      await localDb.upsertDriveCycle(cycle);
      storedInSqlite = true;
    } catch (error) {
      console.warn('[sqlite] ciclo não gravado no banco; usando compatibilidade JSON:', error instanceof Error ? error.message : error);
    }
  }

  if (!storedInSqlite && cycle.source !== 'CARSCANNER_SEED') {
    await writeLegacyCycle(basePath, cycle);
    // Quando SQLite voltar a funcionar, a próxima tentativa reimporta também este ciclo de fallback.
    try {
      const localDb = await import('./localDatabase');
      await localDb.setLocalMetadata('migration.drive_cycles.v1', 'pending');
    } catch {
      // SQLite está indisponível; o JSON legado contém a nova viagem e permanece preservado.
    }
  }

  // CSV é mantido como log interno legado; relatórios exportados ao motorista são TXT.
  const today = new Date().toISOString().split('T')[0];
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
}
