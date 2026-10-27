export interface ElmQueueHealth {
  queueDepth: number;
  maxQueueDepth: number;
  queueRejections: number;
  averageQueueWaitMs: number;
  maxQueueWaitMs: number;
}

function nonNegativeInteger(value: number): number {
  return Number.isFinite(value) ? Math.max(0, Math.round(value)) : 0;
}

/** Human-readable queue metrics for the Bluetooth diagnostics screen. */
export function formatElmQueueHealth(health: ElmQueueHealth): {
  queue: string;
  wait: string;
  warning: boolean;
} {
  const depth = nonNegativeInteger(health.queueDepth);
  const peak = nonNegativeInteger(health.maxQueueDepth);
  const rejected = nonNegativeInteger(health.queueRejections);
  const averageWait = nonNegativeInteger(health.averageQueueWaitMs);
  const maxWait = nonNegativeInteger(health.maxQueueWaitMs);
  return {
    queue: `FILA ${depth} PENDENTES • PICO ${peak} • RECUSAS ${rejected}`,
    wait: `ESPERA MÉDIA ${averageWait} ms • MÁXIMA ${maxWait} ms`,
    warning: rejected > 0 || maxWait >= 5000,
  };
}
