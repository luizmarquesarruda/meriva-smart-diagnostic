import * as FileSystem from 'expo-file-system';
import { getAutoSaveState } from '../meriva/autosaveManager';
import { readDtcs } from '../database/dtcManager';
import { readDriveCycles } from './driveCycleStorage';
import type { DriveCycle } from '../data/driveCycles';

function fileStamp(date = new Date()): string {
  return date.toISOString().replace(/[:.]/g, '-');
}
function safeNumber(value: number | null | undefined, digits = 2): string {
  return typeof value === 'number' && Number.isFinite(value) ? value.toFixed(digits) : 'N/D';
}
function consumption(cycle: DriveCycle): string {
  if (cycle.fuelDataValid === false || !Number.isFinite(cycle.fuelUsedL) || cycle.fuelUsedL < 0.05 ||
      !Number.isFinite(cycle.avgFuelConsumptionKml) || cycle.avgFuelConsumptionKml <= 0) return 'N/D';
  return safeNumber(cycle.avgFuelConsumptionKml) + ' km/L';
}
async function ensureReportDir(basePath: string): Promise<string> {
  const dir = `${basePath}/RELATORIOS`;
  await FileSystem.makeDirectoryAsync(dir, { intermediates: true });
  return dir;
}

export async function exportDiagnosticsTxt(basePath: string): Promise<string> {
  const state = getAutoSaveState();
  const dtcs = await readDtcs(basePath).catch(() => state.dtcs);
  const trips = (await readDriveCycles(basePath)).filter((cycle) => cycle.source === 'REAL_OBD');
  const dir = await ensureReportDir(basePath);
  const now = new Date();
  const path = `${dir}/diagnostico_${fileStamp(now)}.txt`;
  const vehicle = state.vehicle;
  const connection = state.obd;
  const readings = state.lastReadings.filter((reading) => reading.source === 'REAL').slice(-30);
  const recentTrips = trips.slice().sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt)).slice(0, 10);
  const lines = [
    'MERIVA SMART DIAGNOSTIC — RELATÓRIO DE DIAGNÓSTICO',
    `Gerado em: ${now.toLocaleString('pt-BR')}`,
    'Formato: TXT UTF-8',
    '',
    '[VEÍCULO]',
    vehicle ? `Modelo: ${vehicle.make} ${vehicle.model} ${vehicle.year}` : 'Modelo: N/D',
    vehicle ? `Motor: ${vehicle.engine} | Combustível: ${vehicle.fuel}` : 'Motor/combustível: N/D',
    vehicle ? `Referência: ${vehicle.modelYearReference}` : 'Referência: N/D',
    '',
    '[CONEXÃO ECU]',
    `Adaptador: ${connection.adapterName ?? 'N/D'}`,
    `Estado registrado: ${connection.connected ? 'CONECTADO' : 'DESCONECTADO'}`,
    `Protocolo atual: ${connection.protocol ?? 'N/D'}`,
    `Último protocolo conhecido: ${connection.lastKnownProtocol ?? 'N/D'}`,
    `ECU validada em: ${connection.ecuValidatedAt ?? 'N/D'}`,
    `Última sessão: ${connection.lastConnectedAt ?? 'N/D'}`,
    '',
    '[ÚLTIMAS LEITURAS REAIS]',
  ];
  if (readings.length) {
    for (const reading of readings) {
      lines.push(`${reading.pid} — ${reading.name}: ${safeNumber(reading.value)} ${reading.unit} | ${reading.status} | ${reading.timestamp}`);
    }
  } else lines.push('Nenhuma leitura OBD real disponível no snapshot atual.');
  lines.push('', '[CÓDIGOS DE FALHA REGISTRADOS]');
  if (dtcs.length) {
    for (const dtc of dtcs) {
      lines.push(`${dtc.code} | ${dtc.status} | ${dtc.description ?? 'Sem descrição local'} | ocorrências=${dtc.occurrences} | última=${dtc.lastSeen} | fonte=${dtc.source}`);
    }
  } else lines.push('Nenhum código de falha registrado.');
  lines.push('', '[VIAGENS REAIS RECENTES]');
  if (recentTrips.length) {
    for (const trip of recentTrips) {
      lines.push(`${trip.startedAt} -> ${trip.finishedAt} | distância=${safeNumber(trip.distanceTotalKm)} km | consumo=${consumption(trip)} | velocidade média=${safeNumber(trip.avgDrivingSpeedKmh)} km/h | máxima=${safeNumber(trip.maxSpeedKmh)} km/h | origem=${trip.source}`);
    }
  } else lines.push('Nenhuma viagem real registrada.');
  lines.push('', '[LIMITAÇÕES]', 'Leitura recebida da ECU não garante a exatidão física do sensor.', 'Faixas heurísticas não equivalem automaticamente a especificações OEM.', 'Dados ausentes ou antigos são identificados como N/D; não devem ser tratados como valor zero.');
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}

export async function exportDriveCyclesTxt(basePath: string): Promise<string> {
  const cycles = (await readDriveCycles(basePath)).filter((cycle) => cycle.source === 'REAL_OBD')
    .sort((a, b) => Date.parse(b.startedAt) - Date.parse(a.startedAt));
  const dir = await ensureReportDir(basePath);
  const now = new Date();
  const path = `${dir}/viagens_${fileStamp(now)}.txt`;
  const lines = [
    'MERIVA SMART DIAGNOSTIC — RELATÓRIO DE VIAGENS',
    `Gerado em: ${now.toLocaleString('pt-BR')}`,
    'Formato: TXT UTF-8',
    `Total de viagens reais: ${cycles.length}`,
    'Viagens importadas de histórico externo não são incluídas.',
  ];
  if (!cycles.length) lines.push('', 'Nenhuma viagem real registrada.');
  for (const [index, cycle] of cycles.entries()) {
    lines.push(
      '', `VIAGEM ${index + 1}`,
      `Início: ${cycle.startedAt}`, `Fim: ${cycle.finishedAt}`,
      `Distância: ${safeNumber(cycle.distanceTotalKm)} km`,
      `Combustível utilizado: ${safeNumber(cycle.fuelUsedL, 3)} L`,
      `Consumo médio: ${consumption(cycle)}`,
      `Velocidade média: ${safeNumber(cycle.avgDrivingSpeedKmh)} km/h`,
      `Velocidade máxima: ${safeNumber(cycle.maxSpeedKmh)} km/h`,
      `Tempo total: ${cycle.totalTimeHms}`, `Tempo em movimento: ${cycle.drivingTimeHms}`,
      `Tempo parado: ${cycle.standingTimeHms}`,
      `Amostras de telemetria: ${cycle.telemetrySamples?.length ?? 0}`,
      `Fonte do consumo: ${cycle.fuelRateSource ?? 'N/D'}`, `Origem: ${cycle.source}`,
    );
  }
  lines.push('', 'Observação: consumo N/D significa que os dados disponíveis não sustentam uma estimativa confiável.');
  await FileSystem.writeAsStringAsync(path, lines.join('\n') + '\n', { encoding: FileSystem.EncodingType.UTF8 });
  return path;
}
