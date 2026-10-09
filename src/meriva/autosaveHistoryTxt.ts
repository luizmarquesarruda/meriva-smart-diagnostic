import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';

export const AUTOSAVE_HISTORY_FILE = 'meriva_smart_autosave_history.txt';
export const AUTOSAVE_HISTORY_LINES_PER_DAY = 50;
const MAX_DAILY_REPORT_LINES = AUTOSAVE_HISTORY_LINES_PER_DAY - 5;
const DAY_BEGIN = '========== DIA: ';
const DAY_END = '========== FIM DO DIA ==========';
const HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO TXT DIÁRIO — CADA BLOCO DE DATA É UMA PÁGINA LÓGICA.',
].join('\n');

type DailyReports = Record<string, string>;

function historyPath(basePath: string): string {
  return `${basePath}/CONFIG/${AUTOSAVE_HISTORY_FILE}`;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKey(iso: string): string {
  const date = new Date(iso);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function capDailyReport(report: string): string {
  const lines = report.trim().split(/\r?\n/);
  if (lines[0]?.trim().toUpperCase() === 'MERIVA SMART DIAGNOSTIC') lines.shift();
  if (lines.length <= MAX_DAILY_REPORT_LINES) return lines.join('\n');
  return [
    ...lines.slice(0, MAX_DAILY_REPORT_LINES - 1),
    '[RESUMO COMPACTADO: limite diário atingido; estado completo preservado internamente.]',
  ].join('\n');
}

function parseDailyReports(content: string): DailyReports {
  const reports: DailyReports = {};
  const marker = /========== DIA: (\d{4}-\d{2}-\d{2}) ==========\n([\s\S]*?)\n========== FIM DO DIA ==========/g;
  let match: RegExpExecArray | null;
  while ((match = marker.exec(content)) !== null) reports[match[1]] = match[2].trim();

  // Migra snapshots do formato anterior preservando o dia do campo Exported At.
  // Quando há vários snapshots no mesmo dia, o último substitui os anteriores.
  if (!Object.keys(reports).length && content.trim()) {
    const legacyEntry = /=== SALVAMENTO_BEGIN ===([\s\S]*?)=== SALVAMENTO_END ===/g;
    let entryMatch: RegExpExecArray | null;
    while ((entryMatch = legacyEntry.exec(content)) !== null) {
      const entry = entryMatch[1].trim();
      const timestamp = entry.match(/^Exported At:\s*(.+)$/im)?.[1]
        ?? entry.match(/^Saved At:\s*(.+)$/im)?.[1];
      if (!timestamp) continue;
      const parsedTimestamp = Date.parse(timestamp.trim());
      if (!Number.isFinite(parsedTimestamp)) continue;
      const day = dateKey(new Date(parsedTimestamp).toISOString());
      if (entry) reports[day] = capDailyReport(entry);
    }

    // Para variantes antigas sem marcadores de snapshot, mantém uma cópia
    // compacta em data inferida do conteúdo, sem descartar o texto legado.
    if (!Object.keys(reports).length) {
      const legacy = content
        .replace(/^MERIVA SMART DIAGNOSTIC\s*/i, '')
        .replace(/^RELATÓRIO TXT COMPACTO\s*/im, '')
        .replace(/^LIMITE:.*\n/im, '')
        .replace(/^O relatório atual.*\n/im, '')
        .replace(/^O estado completo.*\n/im, '')
        .replace(/=== RELATORIO_ATUAL_BEGIN ===/g, '')
        .replace(/=== RELATORIO_ATUAL_END ===/g, '')
        .replace(/=== EVENTOS_RECENTES_BEGIN ===[\s\S]*$/g, '')
        .trim();
      if (legacy) reports[dateKey(new Date().toISOString())] = capDailyReport(legacy);
    }
  }
  return reports;
}

function renderDailyReports(reports: DailyReports): string {
  const days = Object.keys(reports).filter(isDateKey).sort();
  return [
    HEADER.trimEnd(),
    ...days.flatMap((day) => [
      '',
      `${DAY_BEGIN}${day} ==========`,
      capDailyReport(reports[day]),
      DAY_END,
    ]),
    '',
  ].join('\n');
}

export async function readAutoSaveHistory(basePath: string, selectedDate?: string): Promise<string> {
  try {
    const path = historyPath(basePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return renderDailyReports({});
    const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    const reports = parseDailyReports(content);
    return selectedDate ? renderDailyReports(reports[selectedDate] ? { [selectedDate]: reports[selectedDate] } : {}) : renderDailyReports(reports);
  } catch {
    return renderDailyReports({});
  }
}

export async function getAutoSaveHistoryDates(basePath: string): Promise<string[]> {
  try {
    const path = historyPath(basePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return [];
    return Object.keys(parseDailyReports(await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 }))).sort().reverse();
  } catch {
    return [];
  }
}

export async function appendAutoSaveHistory(
  basePath: string,
  state: MerivaPersistedState,
  appVersion: string,
  reason: string,
): Promise<{ count: number }> {
  const path = historyPath(basePath);
  let current = '';
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && !info.isDirectory) current = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
  } catch {
    // Cria o primeiro relatório se ainda não houver histórico.
  }
  const reports = parseDailyReports(current);
  const exportedAt = new Date().toISOString();
  const day = dateKey(exportedAt);
  const readings = state.lastReadings
    .filter((reading) => reading.source === 'REAL' && reading.value != null)
    .slice(0, 12);
  const realTrips = state.driveCycles.filter((cycle) => cycle.source === 'REAL_OBD').slice(-3);
  const compact = [
    `MERIVA SMART DIAGNOSTIC | VERSÃO: ${appVersion}`,
    `DATA: ${day} | ATUALIZADO: ${exportedAt}`,
    `MOTIVO: ${reason}`,
    `VEÍCULO: ${state.vehicle?.make ?? 'N/D'} ${state.vehicle?.model ?? ''} | MOTOR: ${state.vehicle?.engine ?? 'N/D'}`,
    `ADAPTADOR: ${state.obd?.adapterName ?? 'N/D'}`,
    `BLUETOOTH/OBD: ${state.obd?.connected ? 'CONECTADO' : 'DESCONECTADO'} | ECU: ${state.obd?.ecuAddress ?? 'N/D'}`,
    `PROTOCOLO: ${state.obd?.protocol ?? state.obd?.lastKnownProtocol ?? 'N/D'} | VALIDADA EM: ${state.obd?.ecuValidatedAt ?? 'N/D'}`,
    '',
    '[PIDs REAIS MAIS RECENTES]',
    ...(readings.length ? readings.map((reading) => `${reading.pid} ${reading.name}: ${reading.value} ${reading.unit} | ${reading.status} | ${reading.timestamp}`) : ['N/D - sem leituras reais registradas']),
    '',
    '[CÓDIGOS DE FALHA]',
    ...(state.dtcs.length ? state.dtcs.slice(0, 8).map((dtc) => `${dtc.code} | ${dtc.status} | ocorrências=${dtc.occurrences} | última=${dtc.lastSeen}`) : ['Nenhum DTC registrado nesta captura']),
    ...(state.dtcs.length > 8 ? [`Mais ${state.dtcs.length - 8} DTCs no armazenamento interno.`] : []),
    '',
    '[VIAGENS REAIS RECENTES]',
    ...(realTrips.length ? realTrips.map((cycle) => `${cycle.startedAt} -> ${cycle.finishedAt} | ${cycle.distanceTotalKm} km | ${cycle.avgFuelConsumptionKml > 0 ? cycle.avgFuelConsumptionKml + ' km/L' : 'consumo N/D'} | REAL_OBD`) : ['Nenhuma viagem real salva']),
    '',
    '[APRENDIZADO]',
    `Estado: ${state.learning?.learningStatus ?? 'N/D'} | amostras reais: ${state.learning?.globalSampleCounts?.realSamples ?? 0}`,
    '[NOTA] O relatório é um resumo diário; dados detalhados continuam no armazenamento interno.',
  ].join('\n');
  reports[day] = capDailyReport(compact);
  await FileSystem.writeAsStringAsync(path, renderDailyReports(reports), { encoding: FileSystem.EncodingType.UTF8 });
  return { count: Object.keys(reports).length };
}

export async function getAutoSaveHistoryCount(basePath: string): Promise<number> {
  return (await getAutoSaveHistoryDates(basePath)).length;
}
