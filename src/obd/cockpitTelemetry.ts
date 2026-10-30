import pidCatalog from '../knowledge/pids.json';
import pollingPolicy from '../knowledge/polling_policy.json';
import type { LastPidReading } from '../meriva/autosaveState';

export type CockpitSeverity = 'normal' | 'warning' | 'danger';
export type CockpitFreshness = 'fresh' | 'stale' | 'missing';

export interface CockpitPidMetric {
  pid: string;
  label: string;
  value: number | null;
  unit: string;
  severity: CockpitSeverity;
  freshness: CockpitFreshness;
  hint: string;
}

interface PidCatalogEntry {
  pid: string;
  name: string;
  unit: string;
}

const cockpitPolicy = pollingPolicy.cockpit;
const catalogByPid = new Map<string, PidCatalogEntry>(
  (pidCatalog.pids as PidCatalogEntry[]).map((item) => [item.pid.toUpperCase(), item]),
);

const labels: Record<string, string> = {
  '0105': 'TEMPERATURA DO MOTOR',
  '0142': 'VOLTAGEM DO SISTEMA',
  '0111': 'POSIÇÃO DA BORBOLETA',
  '010C': 'ROTAÇÃO DO MOTOR',
  '010D': 'VELOCIDADE DO VEÍCULO',
  '0104': 'CARGA CALCULADA DO MOTOR',
  '0106': 'AJUSTE CURTO DE COMBUSTÍVEL',
  '0107': 'AJUSTE LONGO DE COMBUSTÍVEL',
  '010B': 'PRESSÃO DO COLETOR (MAP)',
  '010F': 'TEMPERATURA DO AR DE ADMISSÃO',
  '0110': 'FLUXO DE AR (MAF)',
  '0114': 'TENSÃO DO SENSOR O2',
  '012F': 'NÍVEL DE COMBUSTÍVEL',
  '0133': 'PRESSÃO BAROMÉTRICA',
  '0143': 'CARGA ABSOLUTA DO MOTOR',
  '0146': 'TEMPERATURA AMBIENTE',
  '0152': 'PERCENTUAL DE ETANOL',
  '015E': 'TAXA DE COMBUSTÍVEL',
  '015A': 'POSIÇÃO DO PEDAL DO ACELERADOR',
  '015C': 'TEMPERATURA DO ÓLEO DO MOTOR',
};

const unitSymbols: Record<string, string> = {
  celsius: '°C',
  volts: 'V',
  percent: '%',
  rpm: 'RPM',
  'km/h': 'km/h',
  kpa: 'kPa',
  grams_per_second: 'g/s',
  'L/h': 'L/h',
  degrees: '°',
  km: 'km',
};

function normalizePid(pid: string): string {
  return pid.replace(/\s/g, '').toUpperCase();
}

function classifySeverity(pid: string, value: number): CockpitSeverity {
  // Faixas de alerta operacionais conservadoras: não convertem alertas em DTCs.
  if (pid === '0105') {
    if (value >= 115) return 'danger';
    if (value >= 110) return 'warning';
  }
  if (pid === '0142') {
    if (value <= 10.5 || value >= 15.5) return 'danger';
    if (value < 11.5 || value > 15) return 'warning';
  }
  if (pid === '0106' || pid === '0107') {
    if (Math.abs(value) >= 30) return 'danger';
    if (Math.abs(value) >= 20) return 'warning';
  }
  if (pid === '010C') {
    if (value >= 6800) return 'danger';
    if (value >= 6000) return 'warning';
  }
  if (pid === '010D') {
    if (value >= 220) return 'danger';
    if (value >= 200) return 'warning';
  }
  if (pid === '012F') {
    if (value <= 3) return 'danger';
    if (value <= 8) return 'warning';
  }
  if (pid === '015C') {
    if (value >= 160) return 'danger';
    if (value >= 140) return 'warning';
  }
  return 'normal';
}

export function buildCockpitPidMetrics(
  supportedPids: string[],
  readings: readonly LastPidReading[],
  nowMs = Date.now(),
): CockpitPidMetric[] {
  const supported = new Set(supportedPids.map(normalizePid));
  const latestValid = new Map<string, { reading: LastPidReading; timestampMs: number }>();

  for (const reading of readings) {
    if (reading.source !== 'REAL' || reading.status !== 'RESPONDEU' ||
      reading.value == null || !Number.isFinite(reading.value)) continue;
    const pid = normalizePid(reading.pid);
    const timestampMs = Date.parse(reading.timestamp);
    if (!Number.isFinite(timestampMs) || timestampMs > nowMs || timestampMs < 0) continue;
    const previous = latestValid.get(pid);
    if (!previous || timestampMs > previous.timestampMs) {
      latestValid.set(pid, { reading, timestampMs });
    }
  }

  return (cockpitPolicy.pidOrder as string[])
    .map(normalizePid)
    .filter((pid) => supported.has(pid) && catalogByPid.has(pid))
    .slice(0, cockpitPolicy.maxDisplayedPids)
    .map((pid) => {
      const entry = catalogByPid.get(pid)!;
      const sample = latestValid.get(pid);
      const ageMs = sample ? nowMs - sample.timestampMs : Number.POSITIVE_INFINITY;
      const hasRecentValue = Boolean(sample && ageMs >= 0 && ageMs <= cockpitPolicy.displayStaleAfterMs);
      const value = hasRecentValue ? sample!.reading.value : null;
      const freshness: CockpitFreshness = value == null
        ? 'missing'
        : ageMs <= cockpitPolicy.displayFreshAfterMs ? 'fresh' : 'stale';
      const severity = value == null ? 'normal' : classifySeverity(pid, value);
      const ageSeconds = Number.isFinite(ageMs) ? Math.floor(ageMs / 1000) : null;
      let hint: string;
      if (value == null) {
        hint = 'N/D • AGUARDANDO LEITURA REAL RECENTE • PID ' + pid;
      } else if (severity === 'danger') {
        hint = 'ALERTA • FORA DA FAIXA DE REFERÊNCIA • PID ' + pid + ' • ' + ageSeconds + ' s';
      } else if (severity === 'warning') {
        hint = 'ATENÇÃO • VERIFICAR LEITURA • PID ' + pid + ' • ' + ageSeconds + ' s';
      } else if (freshness === 'stale') {
        hint = 'ÚLTIMA LEITURA REAL • ' + ageSeconds + ' s • ATUALIZANDO';
      } else {
        hint = 'LEITURA REAL • PID ' + pid + ' • ' + ageSeconds + ' s';
      }
      return {
        pid,
        label: labels[pid] ?? entry.name.toLocaleUpperCase('pt-BR'),
        value,
        unit: unitSymbols[entry.unit] ?? entry.unit,
        severity,
        freshness,
        hint,
      };
    });
}


export const COCKPIT_QUADRANT_PAGE_SIZE = 4;

/**
 * Returns one four-metric page, wrapping safely at either end of the list.
 * It only arranges existing metric objects; it never creates sensor values.
 */
export function getCockpitMetricPage(
  metrics: readonly CockpitPidMetric[],
  pageIndex: number,
  pageSize = COCKPIT_QUADRANT_PAGE_SIZE,
): CockpitPidMetric[] {
  if (metrics.length === 0 || !Number.isFinite(pageIndex) || !Number.isFinite(pageSize)) return [];
  const size = Math.floor(pageSize);
  if (size < 1) return [];
  const pageCount = Math.ceil(metrics.length / size);
  const normalizedPage = ((Math.floor(pageIndex) % pageCount) + pageCount) % pageCount;
  const start = normalizedPage * size;
  return metrics.slice(start, start + size);
}
