import * as FileSystem from 'expo-file-system';
import { appendCsvRow, flushCsvRows, CsvRow } from '../database/csvLogger';
import { DriveCycle, INITIAL_DRIVE_CYCLES, isCycleConsumptionValid } from '../data/driveCycles';

interface DriveCycleIndex {
  version: string;
  initializedAt?: string;
  cycles: DriveCycle[];
  totalCount: number;
  lastModified?: string;
}

const writeQueues = new Map<string, Promise<void>>();

function isDriveCycle(value: unknown): value is DriveCycle {
  if (typeof value !== 'object' || value === null) return false;
  const cycle = value as Partial<DriveCycle>;
  return (
    typeof cycle.id === 'string' &&
    typeof cycle.startedAt === 'string' &&
    typeof cycle.finishedAt === 'string' &&
    typeof cycle.distanceTotalKm === 'number' &&
    Number.isFinite(cycle.distanceTotalKm) &&
    typeof cycle.distanceIceKm === 'number' &&
    Number.isFinite(cycle.distanceIceKm) &&
    typeof cycle.fuelUsedL === 'number' &&
    Number.isFinite(cycle.fuelUsedL) &&
    typeof cycle.totalTimeHms === 'string' &&
    typeof cycle.drivingTimeHms === 'string' &&
    typeof cycle.standingTimeHms === 'string' &&
    typeof cycle.avgDrivingSpeedKmh === 'number' &&
    Number.isFinite(cycle.avgDrivingSpeedKmh) &&
    typeof cycle.avgFuelConsumptionKml === 'number' &&
    Number.isFinite(cycle.avgFuelConsumptionKml) &&
    (cycle.dataQuality == null || cycle.dataQuality === 'COMPLETE' || cycle.dataQuality === 'INCOMPLETE') &&
    (cycle.incompleteReason == null || typeof cycle.incompleteReason === 'string') &&
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    typeof cycle.importedAt === 'string'
  );
}

function parseIndex(content: string): DriveCycleIndex {
  const parsed = JSON.parse(content) as Partial<DriveCycleIndex>;
  if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.cycles)) {
    throw new Error('INDICE_VIAGENS_CORROMPIDO');
  }
  // Não filtrar silenciosamente ciclos inválidos: isso poderia apagar registros na próxima gravação.
  if (!parsed.cycles.every(isDriveCycle)) {
    throw new Error('INDICE_VIAGENS_CONTEM_CICLOS_INVALIDOS');
  }
  const cycles = parsed.cycles as DriveCycle[];
  return {
    version: typeof parsed.version === 'string' ? parsed.version : '1.0',
    initializedAt: typeof parsed.initializedAt === 'string' ? parsed.initializedAt : undefined,
    cycles,
    totalCount: cycles.length,
    lastModified: typeof parsed.lastModified === 'string' ? parsed.lastModified : undefined,
  };
}

function indexPath(basePath: string): string {
  return `${basePath}/VIAGENS/index.json`;
}
function previousIndexPath(basePath: string): string {
  return `${basePath}/VIAGENS/index.previous.json`;
}
function temporaryIndexPath(basePath: string): string {
  return `${basePath}/VIAGENS/index.json.tmp`;
}

async function serializeWrites<T>(basePath: string, operation: () => Promise<T>): Promise<T> {
  const previous = writeQueues.get(basePath) ?? Promise.resolve();
  let release!: () => void;
  const current = new Promise<void>((resolve) => { release = resolve; });
  writeQueues.set(basePath, previous.catch(() => undefined).then(() => current));
  await previous.catch(() => undefined);
  try {
    return await operation();
  } finally {
    release();
    if (writeQueues.get(basePath) === current) writeQueues.delete(basePath);
  }
}

async function readIndexPath(path: string): Promise<DriveCycleIndex | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  if (info.isDirectory) throw new Error('INDICE_VIAGENS_E_DIRETORIO');
  return parseIndex(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 }));
}

async function loadIndexWithRecovery(basePath: string): Promise<DriveCycleIndex | null> {
  const main = indexPath(basePath);
  const info = await FileSystem.getInfoAsync(main);
  if (!info.exists) return null;
  try {
    return await readIndexPath(main);
  } catch (mainError) {
    try {
      const previous = await readIndexPath(previousIndexPath(basePath));
      if (previous) {
        console.warn('[viagens] índice principal inválido; usando index.previous.json. O arquivo original será preservado.');
        return previous;
      }
    } catch {
      // O erro abaixo explicita que não foi possível recuperar o histórico com segurança.
    }
    throw new Error(`HISTORICO_VIAGENS_NAO_RECUPERADO: ${mainError instanceof Error ? mainError.message : 'erro de leitura'}`);
  }
}

async function writeIndexSafely(basePath: string, data: DriveCycleIndex): Promise<void> {
  const main = indexPath(basePath);
  const previous = previousIndexPath(basePath);
  const temporary = temporaryIndexPath(basePath);
  const content = JSON.stringify({ ...data, totalCount: data.cycles.length }, null, 2);

  await FileSystem.writeAsStringAsync(temporary, content, { encoding: FileSystem.EncodingType.UTF8 });
  const readBack = await FileSystem.readAsStringAsync(temporary, { encoding: FileSystem.EncodingType.UTF8 });
  const validated = parseIndex(readBack);
  if (validated.cycles.length !== data.cycles.length) throw new Error('INDICE_VIAGENS_VALIDACAO_FALHOU');

  const mainInfo = await FileSystem.getInfoAsync(main);
  if (mainInfo.exists && !mainInfo.isDirectory) {
    try {
      // Só promove para backup uma cópia válida. Um índice corrompido nunca substitui um backup bom.
      const existing = await readIndexPath(main);
      if (existing) await FileSystem.copyAsync({ from: main, to: previous });
    } catch {
      // Preserva o índice corrompido para análise, sem sobrescrever um backup anterior válido.
      const corruptPath = `${main}.corrupt-${Date.now()}.json`;
      await FileSystem.copyAsync({ from: main, to: corruptPath }).catch(() => undefined);
    }
  }

  await FileSystem.copyAsync({ from: temporary, to: main });
  const finalReadBack = await readIndexPath(main);
  if (!finalReadBack || finalReadBack.cycles.length !== data.cycles.length) {
    throw new Error('INDICE_VIAGENS_GRAVACAO_NAO_CONFIRMADA');
  }
  await FileSystem.deleteAsync(temporary, { idempotent: true }).catch(() => undefined);
}

async function writeCycleCsv(viagensDir: string, cycle: DriveCycle): Promise<void> {
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
    avgConsumption: isCycleConsumptionValid(cycle) ? cycle.avgFuelConsumptionKml : 'N/D',
    source: cycle.source,
  };
  await appendCsvRow(csvFile, row);
  try {
    await flushCsvRows(csvFile);
  } catch (cause) {
    // O índice JSON é a fonte de verdade; o logger conserva as linhas para retry.
    console.warn('[viagens] falha ao descarregar CSV; ciclo preservado no índice JSON:', cause instanceof Error ? cause.message : cause);
  }
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  return serializeWrites(basePath, async () => {
    const viagensDir = `${basePath}/VIAGENS`;
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const existingInfo = await FileSystem.getInfoAsync(indexPath(basePath));
    if (existingInfo.exists) {
      // Se o índice principal estiver corrompido, só prossegue se existir uma cópia recuperável.
      const recovered = await loadIndexWithRecovery(basePath);
      if (recovered) {
        const mainValid = await readIndexPath(indexPath(basePath)).catch(() => null);
        if (!mainValid) await writeIndexSafely(basePath, { ...recovered, lastModified: new Date().toISOString() });
      }
      return;
    }

    const seedData: DriveCycleIndex = {
      version: '1.0',
      initializedAt: new Date().toISOString(),
      cycles: INITIAL_DRIVE_CYCLES,
      totalCount: INITIAL_DRIVE_CYCLES.length,
    };
    await writeIndexSafely(basePath, seedData);
    for (const cycle of INITIAL_DRIVE_CYCLES) await writeCycleCsv(viagensDir, cycle);
  });
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  try {
    const index = await loadIndexWithRecovery(basePath);
    return index?.cycles ?? [];
  } catch (cause) {
    console.warn('[viagens] histórico indisponível; nenhum arquivo foi sobrescrito:', cause instanceof Error ? cause.message : cause);
    return [];
  }
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (!isDriveCycle(cycle)) throw new Error('CICLO_DE_VIAGEM_INVALIDO');
  return serializeWrites(basePath, async () => {
    const viagensDir = `${basePath}/VIAGENS`;
    await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });
    const index = await loadIndexWithRecovery(basePath);
    const cycles = index ? [...index.cycles] : [];
    // ID é idempotente: uma repetição de fechamento não cria uma viagem duplicada.
    const existingIndex = cycles.findIndex((entry) => entry.id === cycle.id);
    if (existingIndex >= 0) cycles[existingIndex] = cycle;
    else cycles.push(cycle);

    const next: DriveCycleIndex = {
      version: index?.version ?? '1.0',
      initializedAt: index?.initializedAt,
      cycles,
      totalCount: cycles.length,
      lastModified: new Date().toISOString(),
    };
    await writeIndexSafely(basePath, next);
    await writeCycleCsv(viagensDir, cycle);
  });
}
