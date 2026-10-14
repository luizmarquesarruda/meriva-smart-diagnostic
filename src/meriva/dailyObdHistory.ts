import * as FileSystem from 'expo-file-system';
import type { MerivaPersistedState } from './autosaveState';
import { MAX_VALID_TRIP_CONSUMPTION_KML } from '../trip/tripRecorder';
import diagnosticPolicy from '../knowledge/diagnostic_policy.json';

const ACTIVE_DTC_STATUSES = new Set<string>(diagnosticPolicy.activeDtcStatuses);

/**
 * Histórico compacto de sessões ECU, separado do snapshot mutável do autosave.
 * Uma data corresponde a uma única página lógica; cada reconexão acrescenta
 * eventos de início/fim sem substituir os eventos anteriores daquele dia.
 */
export const DAILY_OBD_HISTORY_FILE = 'meriva_smart_daily_obd_history.txt';
function formatNumber(value: number, decimals = 2): string {
  if (!Number.isFinite(value)) return 'N/D';
  return Number(value.toFixed(decimals)).toString();
}
const HEADER = [
  'MERIVA SMART DIAGNOSTIC',
  'HISTÓRICO TXT POR DIA — CADA DATA É UMA PÁGINA LÓGICA.',
  'REGRA: cada sessão ECU validada gera eventos de início e encerramento; sessão interrompida é marcada na próxima abertura.',
  'FONTE: estado local do aplicativo; valores mantêm fonte e horário quando disponíveis.',
  '',
].join('\n');

function formatLocalTimestamp(timestamp: string): string {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime())) return 'N/D';
  const pad = (value: number) => String(value).padStart(2, '0');
  const offsetMinutes = -date.getTimezoneOffset();
  const sign = offsetMinutes >= 0 ? '+' : '-';
  const offset = `${sign}${pad(Math.floor(Math.abs(offsetMinutes) / 60))}:${pad(Math.abs(offsetMinutes) % 60)}`;
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())} ${offset}`;
}

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
    `--- EVENTO: ${event} | UTC=${timestamp} ---`,
    `HORA LOCAL: ${formatLocalTimestamp(timestamp)}`,
    `ADAPTADOR: ${state.obd.adapterName ?? 'N/D'}`,
    `BLUETOOTH/OBD: ${state.obd.connected ? 'CONECTADO' : 'DESCONECTADO'} | ECU VALIDADA EM: ${state.obd.ecuValidatedAt ?? 'N/D'}`,
    `PROTOCOLO ATUAL: ${state.obd.protocol ?? 'N/D'} | ÚLTIMO CONHECIDO: ${state.obd.lastKnownProtocol ?? 'N/D'}`,
    '[PIDs REAIS MAIS RECENTES]',
  ];
  const eventTimestampMs = Date.parse(timestamp);
  const sessionStartedAtMs = Date.parse(state.obd.lastConnectedAt ?? '');
  const latestReadingByPid = new Map<string, MerivaPersistedState['lastReadings'][number]>();
  for (const reading of state.lastReadings) {
    if (reading.source !== 'REAL') continue;
    const readingTimestampMs = Date.parse(reading.timestamp);
    if (!Number.isFinite(readingTimestampMs)) continue;
    if (readingTimestampMs > eventTimestampMs + diagnosticPolicy.freshness.maxFutureClockSkewMs) continue;
    if (eventTimestampMs - readingTimestampMs > diagnosticPolicy.freshness.dailyReadingWindowMs) continue;
    // When available, the session boundary also excludes readings from a prior ignition.
    if (Number.isFinite(sessionStartedAtMs) && readingTimestampMs < sessionStartedAtMs) continue;
    const pid = reading.pid.replace(/\s/g, '').toUpperCase();
    const previous = latestReadingByPid.get(pid);
    if (!previous || Date.parse(reading.timestamp) > Date.parse(previous.timestamp)) latestReadingByPid.set(pid, reading);
  }
  const realReadings = Array.from(latestReadingByPid.values())
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp));
  if (realReadings.length) {
    for (const reading of realReadings) {
      lines.push(`${reading.pid.replace(/\s/g, '').toUpperCase()} ${reading.name}: ${reading.value ?? 'N/D'} ${reading.unit} | ${reading.status} | ${reading.timestamp}`);
    }
  } else {
    lines.push(`N/D (nenhuma leitura REAL_OBD nos últimos ${Math.round(diagnosticPolicy.freshness.dailyReadingWindowMs / 1000)} s)`);
  }
  lines.push('', '[CÓDIGOS DE FALHA REGISTRADOS]');
  if (state.dtcs.length) {
    for (const dtc of state.dtcs) {
      const dtcLastSeenMs = Date.parse(dtc.lastSeen);
      const dtcSessionEvidence = !Number.isFinite(dtcLastSeenMs)
        ? 'HORÁRIO_NÃO_VALIDADO'
        : dtcLastSeenMs > eventTimestampMs
          ? 'HORÁRIO_POSTERIOR_AO_EVENTO_REVISAR'
          : Number.isFinite(sessionStartedAtMs) && dtcLastSeenMs < sessionStartedAtMs
            ? 'REGISTRO_ANTERIOR_À_SESSÃO'
            : Number.isFinite(sessionStartedAtMs)
              ? 'ATUALIZADO_NESTA_SESSÃO'
              : 'SESSÃO_NÃO_CORRELACIONADA';
      const dtcStatus = String(dtc.status ?? '').toUpperCase();
      const dtcIsFresh = dtc.source === 'REAL_OBD'
        && ACTIVE_DTC_STATUSES.has(dtcStatus)
        && Number.isFinite(dtcLastSeenMs)
        && dtcLastSeenMs <= eventTimestampMs + diagnosticPolicy.freshness.maxFutureClockSkewMs
        && eventTimestampMs - dtcLastSeenMs <= diagnosticPolicy.freshness.maxEvidenceAgeMs
        && (!Number.isFinite(sessionStartedAtMs) || dtcLastSeenMs >= sessionStartedAtMs);
      const displayedStatus = dtcIsFresh ? dtc.status : 'HISTÓRICO/SEM_REVALIDAÇÃO';
      lines.push(`${dtc.code} | status=${displayedStatus} | status original=${dtc.status} | evidência=${dtcSessionEvidence} | ocorrências=${dtc.occurrences} | última=${dtc.lastSeen} | fonte=${dtc.source}`);
    }
  } else {
    lines.push('N/D');
  }
  lines.push('', '[VIAGENS REAIS RECENTES]');
  const realTrips = state.driveCycles.filter((cycle) => {
    if (cycle.source !== 'REAL_OBD') return false;
    const tripStartMs = Date.parse(cycle.startedAt);
    const tripFinishMs = Date.parse(cycle.finishedAt);
    if (
      !Number.isFinite(tripStartMs)
      || !Number.isFinite(tripFinishMs)
      || tripStartMs > eventTimestampMs
      || tripFinishMs > eventTimestampMs
    ) return false;
    // Attach a trip only to the ECU session in which it started. This prevents
    // every future connection snapshot from repeating trips from prior ignitions.
    return !Number.isFinite(sessionStartedAtMs) || tripStartMs >= sessionStartedAtMs;
  }).slice(-10);
  if (realTrips.length) {
    for (const trip of realTrips) {
      lines.push(`${trip.startedAt} -> ${trip.finishedAt} | ${formatNumber(trip.distanceTotalKm, 3)} km | ${formatNumber(trip.fuelUsedL, 3)} L | ${(trip.fuelDataValid === false || trip.fuelUsedL < 0.05 || trip.avgFuelConsumptionKml <= 0 || trip.avgFuelConsumptionKml > MAX_VALID_TRIP_CONSUMPTION_KML) ? 'N/D' : `${formatNumber(trip.avgFuelConsumptionKml, 2)} km/L`} | máxima=${trip.maxSpeedKmh == null ? 'N/D' : formatNumber(trip.maxSpeedKmh, 1)} km/h | amostras=${trip.telemetrySamples?.length ?? 0} | REAL_OBD`);
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

function sanitizeLegacyTripConsumption(content: string): string {
  // Older daily logs may already contain implausible averages from tiny trips.
  // Keep the trip record but replace only the invalid consumption field.
  return content.split(/\r?\n/).map((line) => {
    const match = line.match(/(\|\s*)(\d+(?:\.\d+)?)\s*km\/L(\s*\|)/i);
    if (!match) return line;
    const consumption = Number(match[2]);
    if (!Number.isFinite(consumption) || consumption <= 0 || consumption > MAX_VALID_TRIP_CONSUMPTION_KML) {
      return line.replace(match[0], `${match[1]}N/D${match[3]}`);
    }
    return line;
  }).join('\n');
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

  content = sanitizeLegacyTripConsumption(content);
  const pages = splitPages(content);
  const previousEvents = pages.get(date) ?? '';
  const updatedEvents = [previousEvents, renderEvent(state, event, timestamp)].filter(Boolean).join('\n\n');
  pages.set(date, updatedEvents);
  const eventCount = (updatedEvents.match(/--- EVENTO: SESSION_(?:START|END|RECOVERED) \|/g) ?? []).length;

  // The daily journal is the durable summary; do not evict older dates when
  // the bounded autosave snapshot file rotates.
  const sortedDates = Array.from(pages.keys()).sort();
  const output = [HEADER.trimEnd()];
  for (const day of sortedDates) {
    output.push('', `========== DIA: ${day} ==========`, pages.get(day) ?? '', `========== FIM DO DIA ==========`);
  }
  await FileSystem.writeAsStringAsync(path, `${output.join('\n')}\n`, { encoding: FileSystem.EncodingType.UTF8 });
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
