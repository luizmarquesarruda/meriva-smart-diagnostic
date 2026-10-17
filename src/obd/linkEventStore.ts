import * as FileSystem from 'expo-file-system';

export type LinkState =
  | 'BLUETOOTH_OFF'
  | 'ADAPTER_CONNECTED'
  | 'ECU_RESPONDING'
  | 'ADAPTER_NO_ECU_RESPONSE';
export type LinkCause =
  | 'SOCKET'
  | 'TIMEOUT'
  | 'NO_DATA'
  | 'BUS_INIT_ERROR'
  | 'UNABLE_TO_CONNECT'
  | 'STOPPED'
  | 'STATE_CHANGE'
  | 'PID_RESPONSE'
  | 'ATRV';

export interface LinkEvent {
  timestamp: string;
  sessionId?: string;
  state: LinkState;
  cause: LinkCause;
  consecutiveFailures: number;
  latencyMs?: number;
  pid?: string;
  adapterVoltageV?: number;
}

export interface AppEvent {
  timestamp: string;
  sessionId?: string;
  eventType: string;
  detail?: Record<string, string | number | boolean | null>;
}

const MAX_EVENTS = 2000;
const queues = new Map<string, Promise<unknown>>();

function filePath(basePath: string, name: 'link_events.json' | 'app_events.json'): string {
  return basePath + '/LOGS/' + name;
}

async function readEvents<T>(path: string): Promise<T[]> {
  try {
    const raw = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed?.events) ? parsed.events as T[] : [];
  } catch {
    return [];
  }
}

async function writeJsonWithBackup(path: string, payload: { schemaVersion: number; events: unknown[] }): Promise<void> {
  const tmp = path + '.tmp';
  const backup = path + '.previous';
  const content = JSON.stringify(payload);
  await FileSystem.writeAsStringAsync(tmp, content, { encoding: FileSystem.EncodingType.UTF8 });
  const check = await FileSystem.readAsStringAsync(tmp, { encoding: FileSystem.EncodingType.UTF8 });
  const parsed = JSON.parse(check);
  if (!Array.isArray(parsed.events) || parsed.schemaVersion !== payload.schemaVersion) {
    throw new Error('EVENT_LOG_VALIDATION_FAILED');
  }
  const currentInfo = await FileSystem.getInfoAsync(path);
  const backupInfo = await FileSystem.getInfoAsync(backup);
  if (backupInfo.exists) await FileSystem.deleteAsync(backup, { idempotent: true });
  if (currentInfo.exists) await FileSystem.copyAsync({ from: path, to: backup });
  try {
    if (currentInfo.exists) await FileSystem.deleteAsync(path, { idempotent: true });
    await FileSystem.moveAsync({ from: tmp, to: path });
  } catch (error) {
    const targetInfo = await FileSystem.getInfoAsync(path);
    const oldInfo = await FileSystem.getInfoAsync(backup);
    if (!targetInfo.exists && oldInfo.exists) await FileSystem.copyAsync({ from: backup, to: path });
    throw error;
  }
}

function enqueue<T>(path: string, operation: () => Promise<T>): Promise<T> {
  const previous = queues.get(path) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  queues.set(path, current);
  void current.finally(() => {
    if (queues.get(path) === current) queues.delete(path);
  }).catch(() => undefined);
  return current;
}

async function append<T>(basePath: string, name: 'link_events.json' | 'app_events.json', event: T): Promise<void> {
  const path = filePath(basePath, name);
  return enqueue(path, async () => {
    await FileSystem.makeDirectoryAsync(basePath + '/LOGS', { intermediates: true }).catch(() => undefined);
    const events = await readEvents<T>(path);
    events.push(event);
    await writeJsonWithBackup(path, { schemaVersion: 1, events: events.slice(-MAX_EVENTS) });
  });
}

export function appendLinkEvent(basePath: string, event: LinkEvent): Promise<void> {
  return append(basePath, 'link_events.json', event);
}

export function appendAppEvent(basePath: string, event: AppEvent): Promise<void> {
  return append(basePath, 'app_events.json', event);
}
