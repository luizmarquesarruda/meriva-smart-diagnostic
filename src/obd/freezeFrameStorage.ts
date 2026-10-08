import * as FileSystem from 'expo-file-system';
import type { FreezeFrameReading } from './advancedDiagnostics';

export interface FreezeFrameSnapshot {
  id: string;
  capturedAt: string;
  dtcCode?: string;
  protocol?: string;
  source: 'REAL_OBD';
  readings: FreezeFrameReading[];
}

const MAX_SNAPSHOTS = 20;

function storagePath(basePath: string): string {
  return `${basePath}/DTC/freeze_frames.json`;
}

function isValidReading(value: unknown): value is FreezeFrameReading {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FreezeFrameReading>;
  return typeof item.pid === 'string'
    && typeof item.name === 'string'
    && typeof item.value === 'number'
    && typeof item.unit === 'string'
    && typeof item.rawResponse === 'string'
    && typeof item.timestamp === 'string'
    && item.source === 'REAL_OBD'
    && item.status === 'RESPONDEU';
}

function isValidSnapshot(value: unknown): value is FreezeFrameSnapshot {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<FreezeFrameSnapshot>;
  return typeof item.id === 'string'
    && typeof item.capturedAt === 'string'
    && (item.dtcCode == null || typeof item.dtcCode === 'string')
    && (item.protocol == null || typeof item.protocol === 'string')
    && item.source === 'REAL_OBD'
    && Array.isArray(item.readings)
    && item.readings.every(isValidReading);
}

export function normalizeFreezeFrameSnapshots(items: FreezeFrameSnapshot[]): FreezeFrameSnapshot[] {
  return items
    .filter(isValidSnapshot)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))
    .slice(0, MAX_SNAPSHOTS);
}

export async function readFreezeFrameSnapshots(basePath: string): Promise<FreezeFrameSnapshot[]> {
  try {
    const path = storagePath(basePath);
    const info = await FileSystem.getInfoAsync(path);
    if (!info.exists || info.isDirectory) return [];
    const content = await FileSystem.readAsStringAsync(path, { encoding: FileSystem.EncodingType.UTF8 });
    const parsed = JSON.parse(content);
    return Array.isArray(parsed) ? normalizeFreezeFrameSnapshots(parsed) : [];
  } catch {
    return [];
  }
}

export async function appendFreezeFrameSnapshot(basePath: string, snapshot: FreezeFrameSnapshot): Promise<void> {
  const snapshots = await readFreezeFrameSnapshots(basePath);
  const next = normalizeFreezeFrameSnapshots([snapshot, ...snapshots]);
  await FileSystem.makeDirectoryAsync(`${basePath}/DTC`, { intermediates: true });
  await FileSystem.writeAsStringAsync(storagePath(basePath), JSON.stringify(next, null, 2), {
    encoding: FileSystem.EncodingType.UTF8,
  });
}

export const FREEZE_FRAME_MAX_SNAPSHOTS = MAX_SNAPSHOTS;
