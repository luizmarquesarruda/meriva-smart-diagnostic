export interface ElmQueueHealthMetrics {
  queueDepth: number;
  maxQueueDepth: number;
  queueRejections: number;
  averageQueueWaitMs: number;
  maxQueueWaitMs: number;
}

export interface ElmQueueHealthPresentation {
  queue: string;
  wait: string;
  warning: boolean;
}

function finiteNonNegative(value: number): number {
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

function safeCount(value: number): number {
  return Math.floor(finiteNonNegative(value));
}

function safeWait(value: number): number {
  return Math.round(finiteNonNegative(value));
}

/** Convert ELM command-queue metrics to bounded, deterministic driver-facing text. */
export function formatElmQueueHealth(metrics: ElmQueueHealthMetrics): ElmQueueHealthPresentation {
  const queueDepth = safeCount(metrics.queueDepth);
  const maxQueueDepth = safeCount(metrics.maxQueueDepth);
  const queueRejections = safeCount(metrics.queueRejections);
  const averageQueueWaitMs = safeWait(metrics.averageQueueWaitMs);
  const maxQueueWaitMs = safeWait(metrics.maxQueueWaitMs);

  return {
    queue: `FILA ${queueDepth} PENDENTES • PICO ${maxQueueDepth} • RECUSAS ${queueRejections}`,
    wait: `ESPERA MÉDIA ${averageQueueWaitMs} ms • MÁXIMA ${maxQueueWaitMs} ms`,
    warning: queueRejections > 0 || queueDepth >= 10 || maxQueueWaitMs >= 5000,
  };
}
