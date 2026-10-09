import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { formatAutoSaveTxt } from './autosaveTxtFormatter';

export const AUTOSAVE_HISTORY_MAX_ENTRIES = 200;
export const AUTOSAVE_HISTORY_FILE = 'meriva_smart_autosave_history.txt';
export const AUTOSAVE_HISTORY_MAX_PAGES = 10;
export const AUTOSAVE_HISTORY_LINES_PER_PAGE = 50;
const MAX_HISTORY_LINES = AUTOSAVE_HISTORY_MAX_PAGES * AUTOSAVE_HISTORY_LINES_PER_PAGE;
const MAX_REPORT_LINES = 280;
const ENTRY_BEGIN = '=== SALVAMENTO_BEGIN ===';
const ENTRY_END = '=== SALVAMENTO_END ===';
const REPORT_BEGIN = '=== RELATORIO_ATUAL_BEGIN ===';
const REPORT_END = '=== RELATORIO_ATUAL_END ===';
const EVENTS_BEGIN = '=== EVENTOS_RECENTES_BEGIN ===';
const HISTORY_HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'RELATÓRIO TXT COMPACTO',
  'LIMITE: 10 páginas lógicas de 50 linhas (500 linhas no total).',
  'O relatório atual é substituído; os eventos recentes são resumidos em uma linha.',
  'O estado completo continua no armazenamento interno do aplicativo.',
  '',
].join('\n');

interface ParsedHistory {
  report: string;
  events: string[];
}

function historyPath(basePath: string): string {
  return `${basePath}/CONFIG/${AUTOSAVE_HISTORY_FILE}`;
}

function splitEntries(content: string): string[] {
  return content
    .split(ENTRY_BEGIN)
    .slice(1)
    .map((part) => `${ENTRY_BEGIN}${part}`.trim())
    .filter((entry) => entry.includes(ENTRY_END));
}

function capReport(report: string): string {
  const lines = report.trim().split(/\r?\n/);
  // O cabeçalho principal já identifica o relatório; evita repeti-lo a cada snapshot.
  if (lines[0]?.trim().toUpperCase() === 'MERIVA SMART DIAGNOSTIC') lines.shift();
  if (lines.length <= MAX_REPORT_LINES) return lines.join('\n');
  return [
    ...lines.slice(0, MAX_REPORT_LINES - 1),
    '[RELATÓRIO RESUMIDO: limite de linhas atingido; estado completo preservado internamente.]',
  ].join('\n');
}

function parseHistory(content: string): ParsedHistory {
  if (content.includes(REPORT_BEGIN) && content.includes(EVENTS_BEGIN)) {
    const reportStart = content.indexOf(REPORT_BEGIN) + REPORT_BEGIN.length;
    const reportEnd = content.indexOf(REPORT_END, reportStart);
    const eventsStart = content.indexOf(EVENTS_BEGIN) + EVENTS_BEGIN.length;
    const report = reportEnd >= reportStart ? content.slice(reportStart, reportEnd).trim() : '';
    const events = content
      .slice(eventsStart)
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line.startsWith(ENTRY_BEGIN) && line.includes(ENTRY_END));
    return { report, events: events.slice(-AUTOSAVE_HISTORY_MAX_ENTRIES) };
  }

  // Migração do formato antigo, que repetia um relatório inteiro por salvamento.
  const legacyEntries = splitEntries(content);
  const lastEntry = legacyEntries[legacyEntries.length - 1];
  let report = '';
  if (lastEntry) {
    report = lastEntry
      .replace(/^=== SALVAMENTO_BEGIN ===\s*\n?/, '')
      .replace(/^NÚMERO:\s*\d+\s*\n?/m, '')
      .replace(/^MOTIVO:\s*[^\n]*\n?/m, '')
      .replace(/\n?=== SALVAMENTO_END ===\s*$/, '')
      .trim();
  }
  const events = legacyEntries.map((entry) => {
    const number = entry.match(/NÚMERO:\s*(\d+)/)?.[1] ?? '0';
    const reason = entry.match(/MOTIVO:\s*([^\n]+)/)?.[1] ?? 'legacy';
    const timestamp = entry.match(/Exported At:\s*([^\n]+)/)?.[1] ?? 'data anterior';
    return `${ENTRY_BEGIN} MERIVA SMART DIAGNOSTIC | NÚMERO: ${number} | DATA: ${timestamp} | MOTIVO: ${reason} | MIGRADO: resumo histórico antigo ${ENTRY_END}`;
  });
  return { report, events: events.slice(-AUTOSAVE_HISTORY_MAX_ENTRIES) };
}

function renderHistory(report: string, events: string[]): string {
  const cappedReport = capReport(report);
  const fixedLines = HISTORY_HEADER.split('\n').length + 4;
  const reportLines = cappedReport ? cappedReport.split('\n') : [];
  const allowedReportLines = Math.max(0, MAX_HISTORY_LINES - fixedLines - events.length);
  const safeReport = reportLines.length > allowedReportLines
    ? [
        ...reportLines.slice(0, Math.max(0, allowedReportLines - 1)),
        '[RELATÓRIO RESUMIDO PARA RESPEITAR O LIMITE DE 10 PÁGINAS.]',
      ].join('\n')
    : reportLines.join('\n');

  return [
    HISTORY_HEADER.trimEnd(),
    REPORT_BEGIN,
    safeReport,
    REPORT_END,
    EVENTS_BEGIN,
    ...events.slice(-AUTOSAVE_HISTORY_MAX_ENTRIES),
    '',
  ].join('\n');
}

export async function readAutoSaveHistory(basePath: string): Promise<string> {
  try {
    const path = historyPath(basePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return renderHistory('', []);
    const content = await FileSystem.readAsStringAsync(path, {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const parsed = parseHistory(content);
    return renderHistory(parsed.report, parsed.events);
  } catch {
    return renderHistory('', []);
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
    if (info.exists && !info.isDirectory) {
      current = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    }
  } catch {
    // Histórico ausente ou ilegível: inicia um relatório compacto novo.
  }
  const parsed = parseHistory(current);
  const lastNumber = parsed.events.reduce((max, entry) => {
    const match = entry.match(/NÚMERO:\s*(\d+)/);
    return match ? Math.max(max, Number(match[1])) : max;
  }, 0);
  const nextNumber = lastNumber + 1;
  const exportedAt = new Date().toISOString();
  const snapshot = formatAutoSaveTxt(state, { appVersion, exportedAt });
  const event = [
    ENTRY_BEGIN,
    'MERIVA SMART DIAGNOSTIC',
    `NÚMERO: ${nextNumber}`,
    `DATA: ${exportedAt}`,
    `MOTIVO: ${reason}`,
    `ECU: ${state.obd?.connected ? 'CONECTADA' : 'DESCONECTADA'}`,
    `PROTOCOLO: ${state.obd?.protocol ?? state.obd?.lastKnownProtocol ?? 'N/D'}`,
    `LEITURAS: ${state.lastReadings?.length ?? 0}`,
    `DTCs: ${state.dtcs?.length ?? 0}`,
    `VIAGENS_REAIS: ${state.driveCycles?.filter((cycle) => cycle.source === 'REAL_OBD').length ?? 0}`,
    ENTRY_END,
  ].join(' | ');
  const kept = [...parsed.events, event].slice(-AUTOSAVE_HISTORY_MAX_ENTRIES);
  await FileSystem.writeAsStringAsync(path, renderHistory(snapshot, kept), {
    encoding: FileSystem.EncodingType.UTF8,
  });
  return { count: kept.length };
}

export async function getAutoSaveHistoryCount(basePath: string): Promise<number> {
  const content = await readAutoSaveHistory(basePath);
  return splitEntries(content).length;
}
