import * as FileSystem from 'expo-file-system';
import { AppState } from 'react-native';
import type { AppStateStatus } from 'react-native';
import {
  AutoSaveEnvelope,
  AUTOSAVE_DATA_TYPE,
  AUTOSAVE_SCHEMA_VERSION,
  AUTOSAVE_SOURCE,
  SaveReason,
  AutoSaveStatus,
} from './autosaveTypes';
export type { AutoSaveStatus } from './autosaveTypes';
import { MerivaPersistedState, createEmptyMerivaState } from './autosaveState';
import { hydrateState, isValidEnvelope, validatePayload } from './autosaveValidation';
import { migrateEnvelope } from './autosaveMigrations';
import { appendAutoSaveHistory } from './autosaveHistoryTxt';
import { appendDailyObdSessionEvent } from './dailyObdHistory';

const DEBOUNCE_MS = 1500;
const CHECKPOINT_MS = 45000;
const MAX_LAST_READINGS = 50;
const MIN_READING_SAVE_INTERVAL_MS = 10_000;

interface AutosaveRuntime {
  basePath: string;
  state: MerivaPersistedState;
  dirty: boolean;
  saving: boolean;
  mutationVersion: number;
  lastSavedAt: string | null;
  lastSaveReason: SaveReason | null;
  lastError: string | null;
  lastSavedFingerprint: string | null;
  debounceTimer: ReturnType<typeof setTimeout> | null;
  criticalTimer: ReturnType<typeof setTimeout> | null;
  criticalWaiters: Array<(saved: boolean) => void>;
  checkpointTimer: ReturnType<typeof setInterval> | null;
  obdSessionActive: boolean;
  appStateSubscription: { remove: () => void } | null;
  lastReadingMutationAt: Map<string, number>;
}

const runtime: AutosaveRuntime = {
  basePath: '',
  state: createEmptyMerivaState(),
  dirty: false,
  saving: false,
  mutationVersion: 0,
  lastSavedAt: null,
  lastSaveReason: null,
  lastError: null,
  lastSavedFingerprint: null,
  debounceTimer: null,
  criticalTimer: null,
  criticalWaiters: [],
  checkpointTimer: null,
  obdSessionActive: false,
  appStateSubscription: null,
  lastReadingMutationAt: new Map(),
};

function mainPath(basePath: string): string {
  return `${basePath}/CONFIG/autosave.json`;
}
function tmpPath(basePath: string): string {
  return `${basePath}/CONFIG/autosave.json.tmp`;
}
function previousPath(basePath: string): string {
  return `${basePath}/CONFIG/autosave.previous.json`;
}

function snapshotFingerprint(state: MerivaPersistedState): string {
  // savedAt is metadata of the persistence operation, not application state.
  const payload = {
    ...state,
    metadata: { ...state.metadata, savedAt: '' },
  };
  return JSON.stringify(payload);
}

async function ensureDir(path: string): Promise<void> {
  try {
    await FileSystem.makeDirectoryAsync(path, { intermediates: true });
  } catch {
    // diretório já existe
  }
}

export async function ensureStorageDirs(basePath: string): Promise<void> {
  const dirs = ['CONFIG', 'BANCO', 'LEITURAS', 'APRENDIZADO', 'DTC', 'LOGS', 'VIAGENS', 'BACKUP'];
  for (const dir of dirs) await ensureDir(`${basePath}/${dir}`);
}

async function readEnvelope(path: string): Promise<AutoSaveEnvelope<MerivaPersistedState> | null> {
  try {
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists) return null;
    const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(content);
    if (!isValidEnvelope(parsed)) return null;
    const migrated = migrateEnvelope<MerivaPersistedState>(parsed);
    if (!migrated || !validatePayload(migrated.payload)) return null;
    return migrated;
  } catch {
    return null;
  }
}

async function loadLastValidEnvelope(
  basePath: string,
): Promise<AutoSaveEnvelope<MerivaPersistedState> | null> {
  const main = await readEnvelope(mainPath(basePath));
  if (main) return main;
  return readEnvelope(previousPath(basePath));
}

async function persistNow(reason: SaveReason): Promise<boolean> {
  if (runtime.saving) {
    runtime.dirty = true;
    await new Promise<void>((resolve) => setTimeout(resolve, 25));
    return persistNow(reason);
  }

  const fingerprintBeforeSave = snapshotFingerprint(runtime.state);
  if (runtime.lastSavedFingerprint === fingerprintBeforeSave) {
    runtime.dirty = false;
    runtime.lastError = null;
    return true;
  }

  runtime.saving = true;
  const mutationVersionAtStart = runtime.mutationVersion;
  let saved = false;

  try {
    const savedAt = new Date().toISOString();
    runtime.state.metadata = { ...runtime.state.metadata, savedAt };
    const envelope: AutoSaveEnvelope<MerivaPersistedState> = {
      schemaVersion: AUTOSAVE_SCHEMA_VERSION,
      savedAt,
      dataType: AUTOSAVE_DATA_TYPE,
      source: AUTOSAVE_SOURCE,
      payload: runtime.state,
    };
    const content = JSON.stringify(envelope, null, 2);
    const base = runtime.basePath;

    await FileSystem.writeAsStringAsync(tmpPath(base), content, {
      encoding: FileSystem.EncodingType.UTF8,
    });

    const readBack = await FileSystem.readAsStringAsync(tmpPath(base), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    const validated = JSON.parse(readBack);
    if (!isValidEnvelope(validated) || !validatePayload(validated.payload)) {
      throw new Error('AUTOSAVE_VALIDACAO_FALHOU');
    }

    const mainInfo = await FileSystem.getInfoAsync(mainPath(base));
    if (mainInfo.exists) {
      await FileSystem.copyAsync({ from: mainPath(base), to: previousPath(base) });
    }

    await FileSystem.copyAsync({ from: tmpPath(base), to: mainPath(base) });
    await FileSystem.deleteAsync(tmpPath(base), { idempotent: true });

    runtime.lastSavedAt = savedAt;
    runtime.lastSaveReason = reason;
    runtime.lastError = null;
    runtime.lastSavedFingerprint = fingerprintBeforeSave;

    try {
      await appendAutoSaveHistory(
        base,
        runtime.state,
        runtime.state.metadata?.appVersion ?? 'N/D',
        reason,
      );
    } catch (historyCause) {
      console.warn('[autosave] falha ao atualizar histórico TXT:', historyCause instanceof Error ? historyCause.message : historyCause);
    }
    if (reason === 'session_start' || reason === 'session_end') {
      try {
        await appendDailyObdSessionEvent(
          base,
          runtime.state,
          reason === 'session_start' ? 'SESSION_START' : 'SESSION_END',
          savedAt,
        );
      } catch (dailyHistoryCause) {
        console.warn('[autosave] falha ao atualizar histórico diário ECU:', dailyHistoryCause instanceof Error ? dailyHistoryCause.message : dailyHistoryCause);
      }
    }
    runtime.dirty = runtime.mutationVersion !== mutationVersionAtStart;
    saved = true;
    return true;
  } catch (cause) {
    runtime.dirty = true;
    runtime.lastError = cause instanceof Error ? cause.message : 'ERRO DESCONHECIDO NO AUTOSAVE';
    console.warn('[autosave] falha ao salvar:', runtime.lastError);
    return false;
  } finally {
    runtime.saving = false;
    if (saved && runtime.dirty) {
      scheduleDebouncedSave();
    }
  }
}

export async function initAutoSave(basePath: string): Promise<MerivaPersistedState> {
  if (runtime.basePath === basePath) return runtime.state;

  if (runtime.basePath && runtime.basePath !== basePath) {
    disposeAutoSave();
  }

  await ensureStorageDirs(basePath);
  runtime.basePath = basePath;

  const envelope = await loadLastValidEnvelope(basePath);
  runtime.state = envelope ? hydrateState(envelope.payload) : createEmptyMerivaState();
  runtime.lastSavedAt = envelope?.savedAt ?? null;
  runtime.lastSaveReason = null;
  runtime.lastError = null;
  runtime.lastSavedFingerprint = envelope ? snapshotFingerprint(runtime.state) : null;
  runtime.dirty = false;
  runtime.mutationVersion = 0;

  if (!runtime.appStateSubscription) {
    runtime.appStateSubscription = AppState.addEventListener(
      'change',
      (status: AppStateStatus) => {
        if (status !== 'active' && runtime.dirty) void saveNow('background');
      },
    );
  }

  return runtime.state;
}

export function getAutoSaveState(): MerivaPersistedState {
  return runtime.state;
}

export function getAutoSaveStatus(): AutoSaveStatus {
  return {
    lastSavedAt: runtime.lastSavedAt,
    lastSaveReason: runtime.lastSaveReason,
    lastError: runtime.lastError,
    obdSessionActive: runtime.obdSessionActive,
  };
}

export function updateAutoSaveState(mutate: (state: MerivaPersistedState) => void): void {
  mutate(runtime.state);
  runtime.dirty = true;
  runtime.mutationVersion += 1;
  scheduleDebouncedSave();
}

export function pushLastReading(reading: MerivaPersistedState['lastReadings'][number]): void {
  const previous = runtime.state.lastReadings.find((item) => item.pid === reading.pid);
  const now = Date.now();
  const lastMutation = runtime.lastReadingMutationAt.get(reading.pid) ?? 0;
  const materiallyChanged = !previous
    || previous.value !== reading.value
    || previous.status !== reading.status
    || previous.unit !== reading.unit
    || previous.source !== reading.source;

  const next = [
    reading,
    ...runtime.state.lastReadings.filter((item) => item.pid !== reading.pid),
  ].slice(0, MAX_LAST_READINGS);

  // A telemetria continua atualizando em memória, mas leituras idênticas não
  // geram um autosave por consulta. Uma janela de 10 s limita a persistência
  // de amostras estáveis sem perder uma mudança real de valor/estado.
  if (!materiallyChanged && now - lastMutation < MIN_READING_SAVE_INTERVAL_MS) {
    runtime.state.lastReadings = next;
    return;
  }

  runtime.lastReadingMutationAt.set(reading.pid, now);
  updateAutoSaveState((state) => {
    state.lastReadings = next;
  });
}

function resolveCriticalWaiters(saved: boolean): void {
  const waiters = runtime.criticalWaiters.splice(0);
  for (const resolve of waiters) resolve(saved);
}

export function scheduleCriticalSave(delayMs = 500): Promise<boolean> {
  const completion = new Promise<boolean>((resolve) => {
    runtime.criticalWaiters.push(resolve);
  });

  if (runtime.criticalTimer) clearTimeout(runtime.criticalTimer);
  runtime.criticalTimer = setTimeout(() => {
    runtime.criticalTimer = null;
    void saveNow('critical');
  }, delayMs);

  return completion;
}

function scheduleDebouncedSave(): void {
  if (runtime.saving) return;
  if (runtime.debounceTimer) clearTimeout(runtime.debounceTimer);
  runtime.debounceTimer = setTimeout(() => {
    runtime.debounceTimer = null;
    void saveNow('debounce');
  }, DEBOUNCE_MS);
}

export async function saveNow(reason: SaveReason = 'critical'): Promise<boolean> {
  if (runtime.criticalTimer) {
    clearTimeout(runtime.criticalTimer);
    runtime.criticalTimer = null;
  }
  if (runtime.debounceTimer) {
    clearTimeout(runtime.debounceTimer);
    runtime.debounceTimer = null;
  }
  return persistNow(reason).then((saved) => {
    resolveCriticalWaiters(saved);
    return saved;
  });
}

export function startObdSessionCheckpoint(): void {
  if (runtime.checkpointTimer || !runtime.basePath) return;
  runtime.checkpointTimer = setInterval(() => {
    if (runtime.obdSessionActive && runtime.dirty) void saveNow('checkpoint');
  }, CHECKPOINT_MS);
}

export async function startObdAutosaveSession(): Promise<boolean> {
  if (runtime.obdSessionActive) return true;
  if (!runtime.basePath || !runtime.state.obd.connected) return false;

  runtime.obdSessionActive = true;
  startObdSessionCheckpoint();

  // A abertura da sessão é um marco persistente. Mesmo que o estado lógico
  // já coincida com o último snapshot, queremos uma entrada explícita no TXT.
  runtime.lastSavedFingerprint = null;
  const saved = await saveNow('session_start');
  if (!saved) {
    runtime.obdSessionActive = false;
    stopObdSessionCheckpoint();
  }
  return saved;
}

export async function closeObdAutosaveSession(): Promise<boolean> {
  const wasActive = runtime.obdSessionActive;
  runtime.obdSessionActive = false;
  stopObdSessionCheckpoint();

  if (!runtime.basePath) return false;

  if (wasActive || runtime.state.obd.connected) {
    runtime.state.obd = {
      ...runtime.state.obd,
      connected: false,
      protocol: undefined,
      lastKnownProtocol: runtime.state.obd.protocol ?? runtime.state.obd.lastKnownProtocol,
    };
    runtime.dirty = true;
    runtime.mutationVersion += 1;
  }

  if (!wasActive && !runtime.dirty) return true;

  // Abertura/fechamento são fronteiras de sessão; não devem ser coalescidas
  // com o snapshot anterior.
  if (wasActive) runtime.lastSavedFingerprint = null;
  return saveNow('session_end');
}

export function stopObdSessionCheckpoint(): void {
  if (runtime.checkpointTimer) {
    clearInterval(runtime.checkpointTimer);
    runtime.checkpointTimer = null;
  }
}

export function disposeAutoSave(): void {
  if (runtime.debounceTimer) clearTimeout(runtime.debounceTimer);
  if (runtime.criticalTimer) clearTimeout(runtime.criticalTimer);
  if (runtime.checkpointTimer) clearInterval(runtime.checkpointTimer);
  runtime.debounceTimer = null;
  runtime.criticalTimer = null;
  runtime.checkpointTimer = null;
  runtime.obdSessionActive = false;
  runtime.criticalWaiters.splice(0).forEach((resolve) => resolve(false));
  runtime.appStateSubscription?.remove();
  runtime.appStateSubscription = null;
  runtime.basePath = '';
  runtime.state = createEmptyMerivaState();
  runtime.dirty = false;
  runtime.saving = false;
  runtime.mutationVersion = 0;
  runtime.lastSavedAt = null;
  runtime.lastSaveReason = null;
  runtime.lastError = null;
  runtime.lastSavedFingerprint = null;
  runtime.lastReadingMutationAt.clear();
}
