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

function previousHistoryPath(path: string): string {
  return `${path}.previous`;
}

function temporaryHistoryPath(path: string): string {
  return `${path}.tmp`;
}

function temporaryPreviousHistoryPath(path: string): string {
  return `${path}.previous.tmp`;
}

async function readHistorySnapshot(path: string): Promise<string | null> {
  const info = await FileSystem.getInfoAsync(path);
  if (!info.exists) return null;
  if (info.isDirectory) throw new Error('SNAPSHOT_DO_HISTORICO_APONTA_PARA_DIRETORIO');
  return FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
}

async function readPreviousHistorySnapshot(path: string): Promise<string | null> {
  const previousPath = previousHistoryPath(path);
  const previous = await readHistorySnapshot(previousPath);
  if (previous != null) return previous;
  return readHistorySnapshot(previousPath + '.fallback');
}

async function writePreviousHistorySnapshot(path: string, content: string): Promise<void> {
  const previousPath = previousHistoryPath(path);
  const temporaryPath = temporaryPreviousHistoryPath(path);
  const fallbackPath = previousPath + '.fallback';
  let fallbackReady = false;

  try {
    await writeAndVerifyHistoryFile(temporaryPath, content);
    const previousInfo = await FileSystem.getInfoAsync(previousPath);
    if (previousInfo.exists && previousInfo.isDirectory) {
      throw new Error('BACKUP_DO_HISTORICO_APONTA_PARA_DIRETORIO');
    }
    const fallbackInfo = await FileSystem.getInfoAsync(fallbackPath);
    if (fallbackInfo.exists && fallbackInfo.isDirectory) {
      throw new Error('FALLBACK_DO_HISTORICO_APONTA_PARA_DIRETORIO');
    }
    if (fallbackInfo.exists) await FileSystem.deleteAsync(fallbackPath, { idempotent: true });
    if (previousInfo.exists) {
      await FileSystem.moveAsync({ from: previousPath, to: fallbackPath });
      fallbackReady = true;
    }

    try {
      await FileSystem.moveAsync({ from: temporaryPath, to: previousPath });
      const verified = await readHistorySnapshot(previousPath);
      if (verified !== content) throw new Error('NOVO_BACKUP_DO_HISTORICO_NAO_VALIDADO');
      if (fallbackReady) {
        await FileSystem.deleteAsync(fallbackPath, { idempotent: true });
        fallbackReady = false;
      }
    } catch (cause) {
      if (fallbackReady) {
        const partialPrevious = await FileSystem.getInfoAsync(previousPath);
        if (partialPrevious.exists) await FileSystem.deleteAsync(previousPath, { idempotent: true });
        await FileSystem.moveAsync({ from: fallbackPath, to: previousPath });
        const restored = await readHistorySnapshot(previousPath);
        if (restored == null) throw new Error('FALLBACK_DO_HISTORICO_NAO_RESTAURADO');
        fallbackReady = false;
      }
      throw cause;
    }
  } finally {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true }).catch(() => undefined);
  }
}

async function writeAndVerifyHistoryFile(path: string, content: string): Promise<void> {
  await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
  const verified = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
  if (verified !== content) throw new Error('VALIDACAO_DO_SNAPSHOT_TXT_FALHOU');
}

async function restorePreviousHistory(path: string, previousPath: string): Promise<void> {
  const previous = await readHistorySnapshot(previousPath);
  if (previous == null) throw new Error('SNAPSHOT_ANTERIOR_INDISPONIVEL_PARA_RECUPERACAO');
  const currentInfo = await FileSystem.getInfoAsync(path);
  if (currentInfo.exists) {
    if (currentInfo.isDirectory) throw new Error('CAMINHO_PRINCIPAL_DO_HISTORICO_VIROU_DIRETORIO');
    await FileSystem.deleteAsync(path, { idempotent: true });
  }
  await FileSystem.copyAsync({ from: previousPath, to: path });
  const restored = await readHistorySnapshot(path);
  if (restored !== previous) throw new Error('RESTAURACAO_DO_HISTORICO_NAO_VALIDADA');
}

/**
 * Replace the daily history only after its new contents and previous snapshot
 * have both been written and read back successfully. A failed main-file move
 * restores the last verified snapshot instead of leaving a missing/partial file.
 */
async function persistHistorySnapshot(path: string, content: string, previousContent: string | null): Promise<void> {
  const temporaryPath = temporaryHistoryPath(path);
  const previousPath = previousHistoryPath(path);
  const previousTemporaryPath = temporaryPreviousHistoryPath(path);
  let previousReady = false;
  let mainReplacementStarted = false;

  try {
    await writeAndVerifyHistoryFile(temporaryPath, content);

    if (previousContent != null) {
      await writeAndVerifyHistoryFile(previousTemporaryPath, previousContent);
      const existingPrevious = await FileSystem.getInfoAsync(previousPath);
      if (existingPrevious.exists && existingPrevious.isDirectory) {
        throw new Error('BACKUP_DO_HISTORICO_APONTA_PARA_DIRETORIO');
      }
      if (existingPrevious.exists) await FileSystem.deleteAsync(previousPath, { idempotent: true });
      await FileSystem.moveAsync({ from: previousTemporaryPath, to: previousPath });
      const verifiedPrevious = await readHistorySnapshot(previousPath);
      if (verifiedPrevious !== previousContent) {
        throw new Error('BACKUP_ANTERIOR_DO_HISTORICO_NAO_VALIDADO');
      }
      previousReady = true;
    }

    const currentMain = await FileSystem.getInfoAsync(path);
    if (currentMain.exists && currentMain.isDirectory) {
      throw new Error('CAMINHO_PRINCIPAL_DO_HISTORICO_VIROU_DIRETORIO');
    }
    if (currentMain.exists) {
      mainReplacementStarted = true;
      await FileSystem.deleteAsync(path, { idempotent: true });
    }
    mainReplacementStarted = true;
    await FileSystem.moveAsync({ from: temporaryPath, to: path });

    const verifiedMain = await readHistorySnapshot(path);
    if (verifiedMain !== content) throw new Error('NOVO_HISTORICO_NAO_PASSOU_NA_VALIDACAO');

    // Keep the recovery snapshot aligned with the newly committed main file.
    // Failure to refresh this secondary copy must not report the already-saved
    // event as failed, which could cause duplicate retries by the caller.
    try {
      await writePreviousHistorySnapshot(path, content);
    } catch {
      // The verified main history remains authoritative.
    }
  } catch (cause) {
    let recoveryDetail = '';
    if (mainReplacementStarted && previousReady) {
      try {
        await restorePreviousHistory(path, previousPath);
      } catch (recoveryCause) {
        recoveryDetail = '; FALHA_DE_RESTAURACAO: ' +
          (recoveryCause instanceof Error ? recoveryCause.message : String(recoveryCause));
      }
    }
    const message = cause instanceof Error ? cause.message : String(cause);
    throw new Error('FALHA_AO_GRAVAR_HISTORICO_DIARIO: ' + message + recoveryDetail);
  } finally {
    await FileSystem.deleteAsync(temporaryPath, { idempotent: true }).catch(() => undefined);
    await FileSystem.deleteAsync(previousTemporaryPath, { idempotent: true }).catch(() => undefined);
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
  const mainSnapshot = await readHistorySnapshot(path);
  let content = mainSnapshot ?? '';
  let previousContent: string | null = mainSnapshot;
  if (mainSnapshot == null) {
    // A missing main file may be the result of an interrupted replacement.
    // Recover the previous verified snapshot instead of starting an empty log.
    const recovered = await readPreviousHistorySnapshot(path);
    if (recovered != null) {
      content = recovered;
      previousContent = recovered;
    }
  }

  const pages = splitPages(content);
  const previousEvents = pages.get(date) ?? '';
  const updatedEvents = [previousEvents, renderEvent(state, event, timestamp)].filter(Boolean).join('\n\n');
  pages.set(date, updatedEvents);
  const eventCount = (updatedEvents.match(/--- EVENTO: SESSION_(?:START|END|RECOVERED) \|/g) ?? []).length;

  const sortedDates = Array.from(pages.keys()).sort();
  const output = [HEADER.trimEnd()];
  for (const day of sortedDates) {
    output.push('', `========== DIA: ${day} ==========`, pages.get(day) ?? '', `========== FIM DO DIA ==========`);
  }
  await persistHistorySnapshot(path, `${output.join('\n')}\n`, previousContent);
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
