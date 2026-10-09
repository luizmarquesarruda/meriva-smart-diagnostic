import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';

/**
 * Histórico compacto de sessões ECU, separado do snapshot mutável do autosave.
 * Uma data corresponde a uma única página lógica; cada reconexão acrescenta
 * eventos de início/fim sem substituir os eventos anteriores daquele dia.
 */
export const DAILY_OBD_HISTORY_FILE = 'meriva_smart_daily_obd_history.txt';
const MAX_DAYS = 365;
const HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO TXT POR DIA — CADA DATA É UMA PÁGINA LÓGICA.',
  'REGRA: cada sessão ECU validada gera eventos de início e encerramento.',
  'FONTE: estado local do aplicativo; valores mantêm fonte e horário quando disponíveis.',
  '',
].join('\n');

function localDayKey(date = new Date()): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function historyPath(basePath: string): string {
  return `${basePath}/VIAGENS/${DAILY_OBD_HISTORY_FILE}`;
}

function renderEvent(state: MerivaPersistedState, event: 'SESSION_START' | 'SESSION_END', timestamp: string): string {
  const lines = [
    `--- EVENTO: ${event} | ${timestamp} ---`,
    `ADAPTADOR: ${state.obd.adapterName ?? 'N/D'}`,
    `BLUETOOTH/OBD: ${state.obd.connected ? 'CONECTADO' : 'DESCONECTADO'} | ECU VALIDADA EM: ${state.obd.ecuValidatedAt ?? 'N/D'}`,
    `PROTOCOLO ATUAL: ${state.obd.protocol ?? 'N/D'} | ÚLTIMO CONHECIDO: ${state.obd.lastKnownProtocol ?? 'N/D'}`,
    '[PIDs REAIS MAIS RECENTES]',
  ];
  const realReadings = state.lastReadings.filter((reading) => reading.source === 'REAL');
  if (realReadings.length) {
    for (const reading of realReadings) {
      lines.push(`${reading.pid} ${reading.name}: ${reading.value ?? 'N/D'} ${reading.unit} | ${reading.status} | ${reading.timestamp}`);
    }
  } else {
    lines.push('N/D');
  }
  lines.push('', '[CÓDIGOS DE FALHA REGISTRADOS]');
  if (state.dtcs.length) {
    for (const dtc of state.dtcs) {
      lines.push(`${dtc.code} | status=${dtc.status} | ocorrências=${dtc.occurrences} | última=${dtc.lastSeen} | fonte=${dtc.source}`);
    }
  } else {
    lines.push('N/D');
  }
  lines.push('', '[VIAGENS REAIS RECENTES]');
  const realTrips = state.driveCycles.filter((cycle) => cycle.source === 'REAL_OBD').slice(-10);
  if (realTrips.length) {
    for (const trip of realTrips) {
      lines.push(`${trip.startedAt} -> ${trip.finishedAt} | ${trip.distanceTotalKm} km | ${trip.avgFuelConsumptionKml} km/L | REAL_OBD`);
    }
  } else {
    lines.push('N/D');
  }
  lines.push('--- FIM DO EVENTO ---');
  return lines.join('\n');
}

function splitPages(content: string): Map<string, string> {
  const pages = new Map<string, string>();
  // Capture apenas os marcadores de página. Não usar "$" como fim do conteúdo
  // em uma regex multiline: nesse modo, "$" também casa no fim de cada linha
  // e descartaria todos os eventos após a primeira linha de cada data.
  const markers = Array.from(
    content.matchAll(/^========== DIA: (\d{4}-\d{2}-\d{2}) ==========\r?$/gm),
  );

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const bodyStart = (marker.index ?? 0) + marker[0].length;
    const bodyEnd = markers[index + 1]?.index ?? content.length;
    const rawBody = content.slice(bodyStart, bodyEnd);
    const body = rawBody
      .replace(/^\r?\n/, '')
      .replace(/(?:\r?\n)?========== FIM DO DIA ==========\s*$/, '')
      .trim();
    const date = marker[1];

    // Se houver duplicatas antigas da mesma data, preservar ambos os blocos.
    const previous = pages.get(date);
    pages.set(date, [previous, body].filter(Boolean).join('\n\n'));
  }

  return pages;
}

export async function appendDailyObdSessionEvent(
  basePath: string,
  state: MerivaPersistedState,
  event: 'SESSION_START' | 'SESSION_END',
  timestamp = new Date().toISOString(),
): Promise<{ date: string; eventCount: number }> {
  const path = historyPath(basePath);
  const date = localDayKey(new Date(timestamp));
  let content = '';
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (info.exists && !info.isDirectory) {
      content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    }
  } catch {
    // Arquivo ausente/corrompido: começa um histórico novo, sem afetar o autosave JSON.
  }

  const pages = splitPages(content);
  const previousEvents = pages.get(date) ?? '';
  const updatedEvents = [previousEvents, renderEvent(state, event, timestamp)].filter(Boolean).join('\n\n');
  pages.set(date, updatedEvents);
  const eventCount = (updatedEvents.match(/--- EVENTO: SESSION_(?:START|END) \|/g) ?? []).length;

  const sortedDates = Array.from(pages.keys()).sort().slice(-MAX_DAYS);
  const output = [HEADER.trimEnd()];
  for (const day of sortedDates) {
    output.push('', `========== DIA: ${day} ==========`, pages.get(day) ?? '', `========== FIM DO DIA ==========`);
  }
  await FileSystem.writeAsStringAsync(path, `${output.join('\n')}\n`, { encoding: FileSystem.EncodingType.UTF8 });
  return { date, eventCount };
}
