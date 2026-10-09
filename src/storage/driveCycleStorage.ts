import * as FileSystem from 'expo-file-system';
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
    ['CARSCANNER_SEED', 'REAL_OBD', 'SIMULACAO'].includes(cycle.source as string) &&
    typeof cycle.importedAt === 'string'
  );
}

function realCyclesOnly(value: unknown): DriveCycle[] {
  if (!Array.isArray(value)) return [];
  return value.filter(isDriveCycle).filter((cycle) => cycle.source === 'REAL_OBD');
}

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  const info = await FileSystem.getInfoAsync(indexFile);
  if (info.exists && !info.isDirectory) {
    try {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as { cycles?: unknown; version?: string };
      const cycles = realCyclesOnly(parsed.cycles);
      await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
        version: typeof parsed.version === 'string' ? parsed.version : '1.0',
        initializedAt: new Date().toISOString(),
        cycles,
        totalCount: cycles.length,
      }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
    } catch {
      await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({ version: '1.0', cycles: [], totalCount: 0 }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
    }
    return;
  }

  await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
    version: '1.0',
    initializedAt: new Date().toISOString(),
    cycles: [],
    totalCount: 0,
  }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;
  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (!info.exists || info.isDirectory) return [];
    const content = await FileSystem.readAsStringAsync(indexFile);
    const data = JSON.parse(content) as { cycles?: unknown; version?: string };
    const cycles = realCyclesOnly(data.cycles);
    // Migração local: remove trajetos importados/simulados do índice persistido.
    if (Array.isArray(data.cycles) && cycles.length !== data.cycles.length) {
      await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
        version: typeof data.version === 'string' ? data.version : '1.0',
        initializedAt: new Date().toISOString(),
        cycles,
        totalCount: cycles.length,
      }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
    }
    return cycles;
  } catch {
    return [];
  }
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  if (cycle.source !== 'REAL_OBD') return;
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  let cycles: DriveCycle[] = [];
  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (info.exists && !info.isDirectory) {
      const parsed = JSON.parse(await FileSystem.readAsStringAsync(indexFile)) as { cycles?: unknown };
      cycles = realCyclesOnly(parsed.cycles);
    }
  } catch {
    // Índice ausente ou inválido: recria apenas com dados reais.
  }

  // O índice JSON permanece interno para leitura eficiente pelo app; CSV não é exportado
  // nem gerado automaticamente para evitar arquivos duplicados e difíceis de manter.
  cycles.push(cycle);
  await FileSystem.writeAsStringAsync(indexFile, JSON.stringify({
    version: '1.0',
    cycles,
    totalCount: cycles.length,
    lastModified: new Date().toISOString(),
  }, null, 2), { encoding: FileSystem.EncodingType.UTF8 });
}
