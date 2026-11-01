export const MAX_PENDING_CSV_ROWS = 10_000;
export const HARD_MAX_PENDING_CSV_ROWS = 20_000;
export const SPILL_CHUNK_ROWS = 128;
export const BATCH_FLUSH_ROW_LIMIT = 8;

export type CsvQueueAction = 'queue' | 'flush' | 'spill' | 'drop';

/** Pure queue policy shared by the live logger and deterministic stress tests. */
export function getCsvQueueAction(pendingRows: number): CsvQueueAction {
  if (!Number.isFinite(pendingRows) || pendingRows < 0) return 'drop';
  if (pendingRows >= HARD_MAX_PENDING_CSV_ROWS) return 'drop';
  if (pendingRows >= MAX_PENDING_CSV_ROWS) return 'spill';
  if (pendingRows >= BATCH_FLUSH_ROW_LIMIT) return 'flush';
  return 'queue';
}
