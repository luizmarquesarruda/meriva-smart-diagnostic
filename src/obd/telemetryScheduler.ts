export type TelemetryPriority = 'FAST' | 'MEDIUM' | 'SLOW';

export interface TelemetryPlanItem {
  pid: string;
  priority: TelemetryPriority;
  intervalMs: number;
}

export const DEFAULT_TELEMETRY_PLAN: TelemetryPlanItem[] = [
  { pid: '010C', priority: 'FAST', intervalMs: 1000 },
  { pid: '010D', priority: 'FAST', intervalMs: 1000 },
  { pid: '0105', priority: 'FAST', intervalMs: 1500 },
  { pid: '010B', priority: 'MEDIUM', intervalMs: 2500 },
  { pid: '0111', priority: 'MEDIUM', intervalMs: 2500 },
  { pid: '0110', priority: 'MEDIUM', intervalMs: 3000 },
  { pid: '012F', priority: 'SLOW', intervalMs: 5000 },
  { pid: '015E', priority: 'SLOW', intervalMs: 5000 },
];

function normalizePid(pid: string): string {
  return pid.replace(/\s/g, '').toUpperCase();
}

export class TelemetryScheduler {
  private readonly plan: TelemetryPlanItem[];
  private readonly lastPolled = new Map<string, number>();
  private cursor = 0;

  constructor(plan: TelemetryPlanItem[] = DEFAULT_TELEMETRY_PLAN) {
    this.plan = plan.map((item) => ({
      ...item,
      pid: normalizePid(item.pid),
      intervalMs: Math.max(100, Math.round(item.intervalMs)),
    }));
  }

  reset(): void {
    this.lastPolled.clear();
    this.cursor = 0;
  }

  getDuePids(nowMs: number, supportedPids: string[], multiPid = false): string[] {
    const supported = new Set(supportedPids.map(normalizePid));
    const due = this.plan.filter((item) => {
      if (!supported.has(item.pid)) return false;
      const last = this.lastPolled.get(item.pid);
      return last == null || nowMs - last >= item.intervalMs;
    });
    if (!due.length) return [];

    if (multiPid) return due.slice(0, 6).map((item) => item.pid);

    for (let offset = 0; offset < this.plan.length; offset += 1) {
      const index = (this.cursor + offset) % this.plan.length;
      const candidate = this.plan[index];
      if (due.some((item) => item.pid === candidate.pid)) {
        this.cursor = (index + 1) % this.plan.length;
        return [candidate.pid];
      }
    }
    return [due[0].pid];
  }

  markPolled(pids: string[], nowMs: number): void {
    for (const pid of pids) this.lastPolled.set(normalizePid(pid), nowMs);
  }

  getNextDueDelayMs(nowMs: number, supportedPids: string[]): number {
    const supported = new Set(supportedPids.map(normalizePid));
    const delays = this.plan
      .filter((item) => supported.has(item.pid))
      .map((item) => {
        const last = this.lastPolled.get(item.pid);
        return last == null ? 0 : Math.max(100, item.intervalMs - (nowMs - last));
      });
    return delays.length ? Math.min(...delays) : 1000;
  }
}
