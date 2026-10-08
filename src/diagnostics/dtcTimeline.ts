import type { DtcRecord } from '../types/sourceTypes';
import type { LiveTelemetryPoint } from '../obd/liveTelemetry';

export interface DtcTimeline {
  code: string;
  occurrenceAt: string;
  windowStart: string;
  windowEnd: string;
  samples: LiveTelemetryPoint[];
}

export function buildDtcTimeline(
  dtc: DtcRecord,
  samples: LiveTelemetryPoint[],
  beforeMs = 30_000,
  afterMs = 30_000,
): DtcTimeline {
  const centerMs = Date.parse(dtc.lastSeen);
  const safeCenter = Number.isFinite(centerMs) ? centerMs : Date.now();
  return {
    code: dtc.code,
    occurrenceAt: dtc.lastSeen,
    windowStart: new Date(safeCenter - beforeMs).toISOString(),
    windowEnd: new Date(safeCenter + afterMs).toISOString(),
    samples,
  };
}

export function summarizeDtcTimeline(timeline: DtcTimeline): string {
  if (!timeline.samples.length) return 'Sem telemetria real disponível na janela da ocorrência nesta sessão.';
  const pids = new Set(timeline.samples.map((sample) => sample.pid));
  return `${timeline.samples.length} amostras reais • ${pids.size} PIDs • janela de ±30 s`;
}
