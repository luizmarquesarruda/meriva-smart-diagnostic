import * as FileSystem from 'expo-file-system';
import type { GpsJsonRecord } from './gpsTracker';
import { appendDailyGpsHistoryIndex } from '../meriva/dailyObdHistory';

export const GPS_HISTORY_DIRECTORY = 'VIAGENS/GPS';
export const GPS_HISTORY_RETENTION_DAYS = 14;
export const GPS_HISTORY_MAX_SAMPLES_PER_DAY = 4320;
export const GPS_HISTORY_SEGMENT_RECORDS = 300;
export const GPS_HISTORY_FLUSH_BATCH_SIZE = 5;
export const GPS_HISTORY_MOVING_INTERVAL_MS = 10_000;
export const GPS_HISTORY_STATIONARY_INTERVAL_MS = 5 * 60_000;
const MAX_SAMPLE_AGE_MS = 10 * 60_000;
const MAX_FUTURE_SKEW_MS = 5 * 60_000;
const ERROR_LOG_INTERVAL_MS = 60_000;
const GPS_FILE_RE = /^gps_(\d{4}-\d{2}-\d{2})_(\d{4})\.jsonl$/;

function localDayKey(timestampMs: number): string {
  const date = new Date(timestampMs);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function retentionCutoffDayKey(nowMs: number): string {
  const cutoff = new Date(nowMs);
  cutoff.setHours(0, 0, 0, 0);
  cutoff.setDate(cutoff.getDate() - (GPS_HISTORY_RETENTION_DAYS - 1));
  return localDayKey(cutoff.getTime());
}

function gpsDirectory(basePath: string): string {
  return `${basePath}/${GPS_HISTORY_DIRECTORY}`;
}

function gpsFileName(day: string, segment: number): string {
  return `gps_${day}_${String(segment).padStart(4, '0')}.jsonl`;
}

function parseLines(content: string): string[] {
  return content.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function parseSample(line: string): GpsJsonRecord | null {
  try {
    const value = JSON.parse(line) as Partial<GpsJsonRecord>;
    if (
      value.schemaVersion !== 1 ||
      value.source !== 'GPS' ||
      typeof value.timestamp !== 'number' ||
      !Number.isFinite(value.timestamp) ||
      typeof value.latitude !== 'number' ||
      !Number.isFinite(value.latitude) ||
      value.latitude < -90 ||
      value.latitude > 90 ||
      typeof value.longitude !== 'number' ||
      !Number.isFinite(value.longitude) ||
      value.longitude < -180 ||
      value.longitude > 180 ||
      typeof value.valid !== 'boolean' ||
      !['SEM_FIX', 'FRACA', 'BOA', 'EXCELENTE'].includes(String(value.signalQuality))
    ) return null;
    return value as GpsJsonRecord;
  } catch {
    return null;
  }
}

/**
 * Bounded local GPS journal.
 *
 * Records are JSON Lines (one schema-v1 sample per line), segmented to avoid
 * rewriting a large daily file. Coordinates are stored only on the device.
 * This journal is observational: it never changes trip distance or fuel data.
 */
export class GpsHistoryStore {
  private basePath: string;
  private currentDayKey: string | null = null;
  private segmentIndex = 1;
  private segmentRecordCount = 0;
  private segmentContent = '';
  private dailyRecordCount = 0;
  private lastPersistedTimestamp = 0;
  private lastQueuedTimestamp = 0;
  private lastAcceptedTimestamp = 0;
  private lastQueuedQuality: GpsJsonRecord['signalQuality'] | null = null;
  private lastQueuedMoving: boolean | null = null;
  private lastObservedQuality: GpsJsonRecord['signalQuality'] | null = null;
  private lastObservedMoving: boolean | null = null;
  private pending: GpsJsonRecord[] = [];
  private queue: Promise<void> = Promise.resolve();
  private lastErrorLoggedAt = 0;
  private readonly nowProvider: () => number;

  constructor(
    basePath = FileSystem.documentDirectory ? `${FileSystem.documentDirectory}MERIVA_SMART` : '',
    nowProvider: () => number = () => Date.now(),
  ) {
    this.basePath = basePath.replace(/[/]+$/, '');
    this.nowProvider = nowProvider;
  }

  configure(basePath: string): void {
    const normalized = basePath.replace(/\/+$/, '');
    if (!normalized || normalized === this.basePath) return;
    if (this.pending.length) {
      console.warn('[gps-history] caminho alterado com amostras pendentes; elas serão descartadas para evitar gravar no veículo/perfil errado.');
    }
    this.basePath = normalized;
    this.resetRuntimeState();
  }

  private resetRuntimeState(): void {
    this.currentDayKey = null;
    this.segmentIndex = 1;
    this.segmentRecordCount = 0;
    this.segmentContent = '';
    this.dailyRecordCount = 0;
    this.lastPersistedTimestamp = 0;
    this.lastQueuedTimestamp = 0;
    this.lastAcceptedTimestamp = 0;
    this.lastQueuedQuality = null;
    this.lastQueuedMoving = null;
    this.lastObservedQuality = null;
    this.lastObservedMoving = null;
    this.pending = [];
  }

  record(sample: GpsJsonRecord, effectiveSpeedKmh: number | null): Promise<void> {
    const operation = this.queue.then(async () => {
      await this.recordUnsafe(sample, effectiveSpeedKmh);
    });
    this.queue = operation.catch((cause) => this.reportError(cause));
    return this.queue;
  }

  flush(): Promise<void> {
    const operation = this.queue.then(async () => {
      await this.flushPendingUnsafe();
    });
    this.queue = operation.catch((cause) => this.reportError(cause));
    return this.queue;
  }

  private reportError(cause: unknown): void {
    const now = Date.now();
    if (now - this.lastErrorLoggedAt < ERROR_LOG_INTERVAL_MS) return;
    this.lastErrorLoggedAt = now;
    console.warn('[gps-history] falha na persistência do histórico GPS:', cause instanceof Error ? cause.message : cause);
  }

  private async recordUnsafe(sample: GpsJsonRecord, effectiveSpeedKmh: number | null): Promise<void> {
    if (!this.basePath) return;
    const now = this.nowProvider();
    if (!Number.isFinite(sample.timestamp) || sample.timestamp <= 0) return;
    // Avoid persisting cached fixes that arrive long after they were measured.
    if (sample.timestamp < now - MAX_SAMPLE_AGE_MS || sample.timestamp > now + MAX_FUTURE_SKEW_MS) return;

    const day = localDayKey(sample.timestamp);
    if (this.currentDayKey !== day) {
      await this.flushPendingUnsafe();
      await this.openDayUnsafe(day, now);
    }
    if (sample.timestamp <= this.lastAcceptedTimestamp) return;
    this.lastAcceptedTimestamp = sample.timestamp;

    const moving = effectiveSpeedKmh != null && Number.isFinite(effectiveSpeedKmh) && effectiveSpeedKmh >= 3;
    const qualityChanged = this.lastObservedQuality != null && sample.signalQuality !== this.lastObservedQuality;
    const movementChanged = this.lastObservedMoving != null && moving !== this.lastObservedMoving;
    this.lastObservedQuality = sample.signalQuality;
    this.lastObservedMoving = moving;

    const firstRecord = this.dailyRecordCount === 0 && this.pending.length === 0;
    const elapsedMs = sample.timestamp - this.lastQueuedTimestamp;
    const minimumInterval = moving ? GPS_HISTORY_MOVING_INTERVAL_MS : GPS_HISTORY_STATIONARY_INTERVAL_MS;
    if (!firstRecord && !qualityChanged && !movementChanged && elapsedMs < minimumInterval) return;
    if (this.dailyRecordCount + this.pending.length >= GPS_HISTORY_MAX_SAMPLES_PER_DAY) return;

    this.pending.push(sample);
    this.lastQueuedTimestamp = sample.timestamp;
    this.lastQueuedQuality = sample.signalQuality;
    this.lastQueuedMoving = moving;
    if (this.pending.length >= GPS_HISTORY_FLUSH_BATCH_SIZE) {
      await this.flushPendingUnsafe();
    }
  }

  private async openDayUnsafe(day: string, nowMs: number): Promise<void> {
    if (!this.basePath) return;
    const directory = gpsDirectory(this.basePath);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });
    const names = await FileSystem.readDirectoryAsync(directory);
    const datedFiles = names
      .map((name) => ({ name, match: name.match(GPS_FILE_RE) }))
      .filter((item): item is { name: string; match: RegExpMatchArray } => item.match != null)
      .sort((a, b) => a.name.localeCompare(b.name));

    const cutoff = retentionCutoffDayKey(nowMs);
    for (const item of datedFiles) {
      if (item.match[1] < cutoff) {
        await FileSystem.deleteAsync(`${directory}/${item.name}`, { idempotent: true });
      }
    }

    const todaysFiles = datedFiles.filter((item) => item.match[1] === day);
    this.currentDayKey = day;
    this.segmentIndex = todaysFiles.length
      ? Math.max(...todaysFiles.map((item) => Number(item.match[2])))
      : 1;
    this.segmentRecordCount = 0;
    this.segmentContent = '';
    this.dailyRecordCount = 0;
    this.lastPersistedTimestamp = 0;
    this.lastQueuedTimestamp = 0;
    this.lastAcceptedTimestamp = 0;
    this.lastQueuedQuality = null;
    this.lastQueuedMoving = null;
    this.lastObservedQuality = null;
    this.lastObservedMoving = null;

    let latestSample: GpsJsonRecord | null = null;
    for (const item of todaysFiles) {
      const content = await FileSystem.readAsStringAsync(`${directory}/${item.name}`, {
        encoding: FileSystem.EncodingType.UTF8,
      });
      const lines = parseLines(content);
      this.dailyRecordCount += lines.length;
      for (let index = lines.length - 1; index >= 0; index -= 1) {
        const parsed = parseSample(lines[index]);
        if (parsed) {
          latestSample = parsed;
          break;
        }
      }
      if (Number(item.match[2]) === this.segmentIndex) {
        this.segmentContent = content;
        this.segmentRecordCount = lines.length;
      }
    }

    if (latestSample) {
      this.lastPersistedTimestamp = latestSample.timestamp;
      this.lastQueuedTimestamp = latestSample.timestamp;
      this.lastAcceptedTimestamp = latestSample.timestamp;
      this.lastQueuedQuality = latestSample.signalQuality;
      this.lastObservedQuality = latestSample.signalQuality;
      this.lastQueuedMoving = latestSample.speedKmh != null && latestSample.speedKmh >= 3;
      this.lastObservedMoving = this.lastQueuedMoving;
    }
    if (this.segmentRecordCount >= GPS_HISTORY_SEGMENT_RECORDS) {
      this.segmentIndex += 1;
      this.segmentRecordCount = 0;
      this.segmentContent = '';
    }

    // The daily TXT becomes the human-readable index; raw points remain in bounded JSONL segments.
    void appendDailyGpsHistoryIndex(this.basePath, day).catch((cause) => this.reportError(cause));
  }

  private async flushPendingUnsafe(): Promise<void> {
    if (!this.basePath || this.pending.length === 0 || !this.currentDayKey) return;
    const directory = gpsDirectory(this.basePath);
    await FileSystem.makeDirectoryAsync(directory, { intermediates: true });

    while (this.pending.length > 0 && this.dailyRecordCount < GPS_HISTORY_MAX_SAMPLES_PER_DAY) {
      if (this.segmentRecordCount >= GPS_HISTORY_SEGMENT_RECORDS) {
        this.segmentIndex += 1;
        this.segmentRecordCount = 0;
        this.segmentContent = '';
      }
      const dailyRoom = GPS_HISTORY_MAX_SAMPLES_PER_DAY - this.dailyRecordCount;
      const segmentRoom = GPS_HISTORY_SEGMENT_RECORDS - this.segmentRecordCount;
      const count = Math.min(this.pending.length, dailyRoom, segmentRoom);
      if (count <= 0) break;
      const rows = this.pending.slice(0, count);
      const content = `${this.segmentContent}${rows.map((row) => JSON.stringify(row)).join('\n')}\n`;
      const path = `${directory}/${gpsFileName(this.currentDayKey, this.segmentIndex)}`;
      await FileSystem.writeAsStringAsync(path, content, { encoding: FileSystem.EncodingType.UTF8 });
      this.segmentContent = content;
      this.segmentRecordCount += rows.length;
      this.dailyRecordCount += rows.length;
      this.lastPersistedTimestamp = rows[rows.length - 1].timestamp;
      this.pending.splice(0, rows.length);
    }

    // Pending samples beyond the hard daily cap are intentionally dropped.
    if (this.dailyRecordCount >= GPS_HISTORY_MAX_SAMPLES_PER_DAY) this.pending = [];
  }
}

export const gpsHistoryStore = new GpsHistoryStore();
