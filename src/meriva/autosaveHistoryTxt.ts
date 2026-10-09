import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';

export const AUTOSAVE_HISTORY_FILE = 'meriva_smart_autosave_history.txt';
export const AUTOSAVE_HISTORY_LINES_PER_DAY = 50;
const MAX_DAILY_REPORT_LINES = AUTOSAVE_HISTORY_LINES_PER_DAY - 5;
const DAY_BEGIN = '========== DIA: ';
const DAY_END = '========== FIM DO DIA ==========';
const HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO TXT POR DIA',
  'Cada bloco de data equivale a uma página lógica de até 50 linhas.',
  'O relatório diário é atualizado durante o dia; o histórico não tem limite de dias.',
  'Os dados estruturados completos permanecem no armazenamento interno.',
  '',
].join('\n');

type DailyReports = Record<string, string>;

function historyPath(basePath: string): string {
  return `${basePath}/CONFIG/${AUTOSAVE_HISTORY_FILE}`;
}

function isDateKey(value: string): boolean {
  return /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function dateKey(iso: string): string {
  return iso.slice(0, 10);
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

  // Migração de históricos antigos: preserva o último relatório disponível no dia atual.
  if (!Object.keys(reports).length && content.trim()) {
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
  const snapshot = formatAutoSaveTxt(state, { appVersion, exportedAt });
  const compact = [
    `DATA: ${day}`,
    `ÚLTIMA ATUALIZAÇÃO: ${exportedAt}`,
    `MOTIVO: ${reason}`,
    `ECU: ${state.obd?.connected ? 'CONECTADA' : 'DESCONECTADA'}`,
    `PROTOCOLO: ${state.obd?.protocol ?? state.obd?.lastKnownProtocol ?? 'N/D'}`,
    `LEITURAS: ${state.lastReadings?.length ?? 0}`,
    `DTCs: ${state.dtcs?.length ?? 0}`,
    '',
    snapshot,
  ].join('\n');
  reports[day] = capDailyReport(compact);
  await FileSystem.writeAsStringAsync(path, renderDailyReports(reports), { encoding: FileSystem.EncodingType.UTF8 });
  return { count: Object.keys(reports).length };
}

export async function getAutoSaveHistoryCount(basePath: string): Promise<number> {
  return (await getAutoSaveHistoryDates(basePath)).length;
}
