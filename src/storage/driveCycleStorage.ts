import * as FileSystem from 'expo-file-system';
import { appendCsvRow, CsvRow } from '../database/csvLogger';
import { DriveCycle, INITIAL_DRIVE_CYCLES } from '../data/driveCycles';

export async function initializeDriveCycles(basePath: string): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  // Verifica se já foi inicializado
  const indexInfo = await FileSystem.getInfoAsync(indexFile);
  if (indexInfo.exists) {
    return; // Já foi inicializado
  }

  // Cria diretório
  await FileSystem.makeDirectoryAsync(viagensDir, { intermediates: true });

  // Salva ciclos iniciais em JSON
  const seedData = {
    version: '1.0',
    initializedAt: new Date().toISOString(),
    cycles: INITIAL_DRIVE_CYCLES,
    totalCount: INITIAL_DRIVE_CYCLES.length,
  };

  await FileSystem.writeAsStringAsync(
    indexFile,
    JSON.stringify(seedData, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  // Também registra em CSV para compatibilidade com leitura e limpeza automática
  const today = new Date().toISOString().split('T')[0];
  const csvFile = `${viagensDir}/viagens_${today}.csv`;

  for (const cycle of INITIAL_DRIVE_CYCLES) {
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
      avgConsumption: cycle.avgFuelConsumptionKml,
      source: cycle.source,
    };

    await appendCsvRow(csvFile, row);
  }
}

export async function readDriveCycles(basePath: string): Promise<DriveCycle[]> {
  const indexFile = `${basePath}/VIAGENS/index.json`;

  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (!info.exists) return [];

    const content = await FileSystem.readAsStringAsync(indexFile);
    const data = JSON.parse(content);
    return data.cycles || [];
  } catch {
    return [];
  }
}

export async function addDriveCycle(basePath: string, cycle: DriveCycle): Promise<void> {
  const viagensDir = `${basePath}/VIAGENS`;
  const indexFile = `${viagensDir}/index.json`;

  // Lê ciclos existentes
  let data: any = { version: '1.0', cycles: [], totalCount: 0 };
  try {
    const info = await FileSystem.getInfoAsync(indexFile);
    if (info.exists) {
      const content = await FileSystem.readAsStringAsync(indexFile);
      data = JSON.parse(content);
    }
  } catch {
    // Se não existir, começa do zero
  }

  // Adiciona novo ciclo
  data.cycles.push(cycle);
  data.totalCount = data.cycles.length;
  data.lastModified = new Date().toISOString();

  // Salva atualizado
  await FileSystem.writeAsStringAsync(
    indexFile,
    JSON.stringify(data, null, 2),
    { encoding: FileSystem.EncodingType.UTF8 }
  );

  // Registra em CSV também
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
    avgConsumption: cycle.avgFuelConsumptionKml,
    source: cycle.source,
  };

  await appendCsvRow(csvFile, row);
}
