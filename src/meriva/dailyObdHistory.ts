import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';

/**
 * Histórico compacto de sessões ECU, separado do snapshot mutável do autosave.
 * Uma data corresponde a uma única página lógica; cada reconexão acrescenta
 * eventos de início/fim sem substituir os eventos anteriores daquele dia.
 */
export const DAILY_OBD_HISTORY_FILE = 'meriva_smart_daily_obd_history.txt';
const HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO TXT POR DIA — CADA DATA É UMA PÁGINA LÓGICA.',
  'REGRA: cada sessão ECU validada gera eventos de início e encerramento; sessão interrompida é marcada na próxima abertura.',
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

function renderEvent(state: MerivaPersistedState, event: 'SESSION_START' | 'SESSION_END' | 'SESSION_RECOVERED', timestamp: string): string {
  const lines = [
    `--- EVENTO: ${event} | ${timestamp} ---`,
    `ADAPTADOR: ${state.obd.adapterName ?? 'N/D'}`,
    `BLUETOOTH/OBD: ${state.obd.connected ? 'CONECTADO' : 'DESCONECTADO'} | ECU VALIDADA EM: ${state.obd.ecuValidatedAt ?? 'N/D'}`,
    `PROTOCOLO ATUAL: ${state.obd.protocol ?? 'N/D'} | ÚLTIMO CONHECIDO: ${state.obd.lastKnownProtocol ?? 'N/D'}`,
    '[PIDs REAIS MAIS RECENTES]',
  ];
  const eventTimestampMs = Date.parse(timestamp);
  const sessionStartedAtMs = Date.parse(state.obd.lastConnectedAt ?? '');
  const realReadings = state.lastReadings.filter((reading) => {
    if (reading.source !== 'REAL') return false;
    const readingTimestampMs = Date.parse(reading.timestamp);
    if (!Number.isFinite(readingTimestampMs) || readingTimestampMs > eventTimestampMs) return false;
    // Older snapshots may not have lastConnectedAt; preserve them rather than
    // guessing. When present, use it to exclude stale readings from prior sessions.
    return !Number.isFinite(sessionStartedAtMs) || readingTimestampMs >= sessionStartedAtMs;
  });
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
      lines.push(`${trip.startedAt} -> ${trip.finishedAt} | ${trip.distanceTotalKm} km | ${(trip.fuelDataValid === false || trip.fuelUsedL < 0.05 || trip.avgFuelConsumptionKml <= 0) ? 'N/D' : `${trip.avgFuelConsumptionKml} km/L`} | máxima=${trip.maxSpeedKmh ?? 'N/D'} km/h | amostras=${trip.telemetrySamples?.length ?? 0} | REAL_OBD`);
    }
  } else {
    lines.push('N/D');
  }
  lines.push('--- FIM DO EVENTO ---');
  return lines.join('\n');
}

/**
 * Refuse to rewrite an existing daily history when its structure is unreadable.
 * A malformed file is kept for recovery rather than silently replaced by the
 * subset of pages the parser happened to recognize.
 */
function validateExistingDailyHistory(content: string): void {
  if (!content.trim()) return;
  if (!content.startsWith('MERIVA SMART DIAGNOSTIC')) {
    throw new Error('DAILY_HISTORY_HEADER_INVALID');
  }

  const markers = Array.from(
    content.matchAll(/^========== DIA: (\d{4}-\d{2}-\d{2}) ==========\r?$/gm),
  );
  if (!markers.length) {
    if (content.trim() === HEADER.trim()) return;
    throw new Error('DAILY_HISTORY_PAGE_MARKERS_MISSING');
  }

  for (let index = 0; index < markers.length; index += 1) {
    const marker = markers[index];
    const bodyStart = (marker.index ?? 0) + marker[0].length;
    const bodyEnd = markers[index + 1]?.index ?? content.length;
    const pageBody = content.slice(bodyStart, bodyEnd);
    if (!/(?:^|\r?\n)========== FIM DO DIA ==========\s*$/.test(pageBody)) {
      throw new Error('DAILY_HISTORY_PAGE_INCOMPLETE:' + marker[1]);
    }
  }
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

async function writeDailyHistoryAtomically(path: string, content: string): Promise<void> {
  const tempPath = path + '.tmp';
  const previousPath = path + '.previous';
  await FileSystem.writeAsStringAsync(tempPath, content, { encoding: FileSystem.EncodingType.UTF8 });
  const readBack = await FileSystem.readAsStringAsync(tempPath, { encoding: FileSystem.EncodingType.UTF8 });
  if (readBack !== content) throw new Error('DAILY_HISTORY_READBACK_MISMATCH');

  const currentInfo = await FileSystem.getInfoAsync(path);
  const previousInfo = await FileSystem.getInfoAsync(previousPath);
  if (previousInfo.exists) await FileSystem.deleteAsync(previousPath, { idempotent: true });
  if (currentInfo.exists) await FileSystem.copyAsync({ from: path, to: previousPath });

  try {
    if (currentInfo.exists) await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: tempPath, to: path });
  } catch (error) {
    const targetInfo = await FileSystem.getInfoAsync(path);
    let targetIsComplete = false;
    if (targetInfo.exists && !targetInfo.isDirectory) {
      try {
        targetIsComplete = (await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 })) === content;
      } catch {
        targetIsComplete = false;
      }
    }
    if (targetInfo.exists && !targetIsComplete) {
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
    const backupInfo = await FileSystem.getInfoAsync(previousPath);
    const targetAfterCleanup = await FileSystem.getInfoAsync(path);
    if (!targetIsComplete && !targetAfterCleanup.exists && backupInfo.exists) {
      await FileSystem.copyAsync({ from: previousPath, to: path });
    }
    throw error;
  }
}

async function appendDailyObdSessionEventUnsafe(
  basePath: string,
  state: MerivaPersistedState,
  event: 'SESSION_START' | 'SESSION_END' | 'SESSION_RECOVERED',
  timestamp = new Date().toISOString(),
): Promise<{ date: string; eventCount: number }> {
  const path = historyPath(basePath);
  const date = localDayKey(new Date(timestamp));
  await FileSystem.makeDirectoryAsync(`${basePath}/VIAGENS`, { intermediates: true });
  let content = '';
  const info = await FileSystem.getInfoAsync(path);
  if (info.exists && info.isDirectory) {
    throw new Error('O caminho do histórico diário aponta para um diretório; arquivo existente preservado.');
  }
  if (info.exists) {
    // A failure to read an existing file is not equivalent to an empty history.
    // Abort the append instead of overwriting unreadable data with a new file.
    content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
  }

  validateExistingDailyHistory(content);
  const pages = splitPages(content);
  const previousEvents = pages.get(date) ?? '';
  const updatedEvents = [previousEvents, renderEvent(state, event, timestamp)].filter(Boolean).join('\n\n');
  pages.set(date, updatedEvents);
  const eventCount = (updatedEvents.match(/--- EVENTO: SESSION_(?:START|END|RECOVERED) \|/g) ?? []).length;

  // Preserve every logical date page. The explicit storage-cleanup workflow must not impose a silent one-year truncation.
  const sortedDates = Array.from(pages.keys()).sort();
  const output = [HEADER.trimEnd()];
  for (const day of sortedDates) {
    output.push('', `========== DIA: ${day} ==========`, pages.get(day) ?? '', `========== FIM DO DIA ==========`);
  }
  const serialized = `${output.join('\n')}\n`;
  await writeDailyHistoryAtomically(path, serialized);
  return { date, eventCount };
}


// Serialize read-modify-write operations per daily-history file. Without this
// queue, simultaneous start/end events can both read the same old content and
// the last write silently discards the other event.
const dailyHistoryQueues = new Map<string, Promise<unknown>>();

export function appendDailyObdSessionEvent(
  basePath: string,
  state: MerivaPersistedState,
  event: 'SESSION_START' | 'SESSION_END' | 'SESSION_RECOVERED',
  timestamp = new Date().toISOString(),
): Promise<{ date: string; eventCount: number }> {
  const path = historyPath(basePath);
  const previous = dailyHistoryQueues.get(path) ?? Promise.resolve();
  const current = previous
    .catch(() => undefined)
    .then(() => appendDailyObdSessionEventUnsafe(basePath, state, event, timestamp));

  dailyHistoryQueues.set(path, current);
  void current.finally(() => {
    if (dailyHistoryQueues.get(path) === current) dailyHistoryQueues.delete(path);
  }).catch(() => undefined);
  return current;
}
