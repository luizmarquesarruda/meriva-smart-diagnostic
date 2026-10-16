import * as FileSystem from 'expo-file-system';
import { getDesktopSyncBatch } from './merivaDatabase';

const SERVICE_URL = 'http://localhost:8765';
const CURSOR_FILE = (FileSystem.documentDirectory ?? '') + 'MERIVA_SMART/CONFIG/desktop_sync_cursor.json';
const MAX_PAGES_PER_PASS = 3;
let syncInFlight: Promise<boolean> | null = null;
let lastAttemptAt = 0;

interface SyncCursor {
  instanceId: string;
  pidReadingId: number;
  updatedAt: string;
}

async function readCursor(): Promise<SyncCursor | null> {
  try {
    const info = await FileSystem.getInfoAsync(CURSOR_FILE);
    if (!info.exists || info.isDirectory) return null;
    const raw = await FileSystem.readAsStringAsync(CURSOR_FILE, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(raw) as Partial<SyncCursor>;
    if (
      typeof parsed.instanceId !== 'string' ||
      typeof parsed.pidReadingId !== 'number' ||
      !Number.isFinite(parsed.pidReadingId) ||
      parsed.pidReadingId < 0
    ) return null;
    return {
      instanceId: parsed.instanceId,
      pidReadingId: Math.floor(parsed.pidReadingId),
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : '',
    };
  } catch {
    return null;
  }
}

async function writeCursor(cursor: SyncCursor): Promise<void> {
  const directory = (FileSystem.documentDirectory ?? '') + 'MERIVA_SMART/CONFIG';
  const info = await FileSystem.getInfoAsync(directory);
  if (!info.exists) await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
  await FileSystem.writeAsStringAsync(CURSOR_FILE, JSON.stringify(cursor), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

/**
 * Sincronização oportunista por ADB reverse: quando o notebook executa
 * adb reverse tcp:8765 tcp:8765, localhost:8765 no Android chega ao serviço
 * local do Windows. Se o serviço não estiver presente, a função termina sem
 * alterar o estado operacional do diagnóstico.
 */
export async function syncDesktopDashboardIfAvailable(force = false): Promise<boolean> {
  if (syncInFlight) return syncInFlight;
  const now = Date.now();
  if (!force && now - lastAttemptAt < 15_000) return false;
  lastAttemptAt = now;

  syncInFlight = (async () => {
    try {
      const healthResponse = await fetch(SERVICE_URL + '/api/health');
      if (!healthResponse.ok) return false;
      const health = await healthResponse.json() as { ok?: boolean; instanceId?: string; schemaVersion?: number };
      if (health.ok !== true || typeof health.instanceId !== 'string' || health.schemaVersion !== 1) return false;

      const saved = await readCursor();
      let cursor = saved?.instanceId === health.instanceId ? saved.pidReadingId : 0;

      for (let pageNumber = 0; pageNumber < MAX_PAGES_PER_PASS; pageNumber += 1) {
        const batch = await getDesktopSyncBatch(cursor, 500);
        const response = await fetch(SERVICE_URL + '/api/sync/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(batch),
        });
        if (!response.ok) return false;
        const ack = await response.json() as { instanceId?: string; duplicate?: boolean };
        if (ack.instanceId !== health.instanceId) {
          // O banco do notebook foi recriado durante a sincronização; recomeçar
          // desde o início na próxima tentativa para não deixar lacunas.
          await writeCursor({ instanceId: ack.instanceId ?? '', pidReadingId: 0, updatedAt: new Date().toISOString() });
          return false;
        }

        cursor = batch.nextPidCursor;
        await writeCursor({
          instanceId: health.instanceId,
          pidReadingId: cursor,
          updatedAt: new Date().toISOString(),
        });
        if (!batch.hasMorePidReadings) break;
      }
      return true;
    } catch (error) {
      if (typeof __DEV__ !== 'undefined' && __DEV__) {
        console.debug('[DesktopSync] Serviço USB indisponível ou lote adiado:', error);
      }
      return false;
    } finally {
      syncInFlight = null;
    }
  })();
  return syncInFlight;
}
