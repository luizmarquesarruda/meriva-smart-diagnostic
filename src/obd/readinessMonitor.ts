import type { Elm327Session } from './elm327';

export type ReadinessIgnition = 'SPARK' | 'COMPRESSION';
export type MonitorReadinessState = 'READY' | 'INCOMPLETE' | 'NOT_SUPPORTED';

export interface ReadinessMonitorItem {
  id: string;
  label: string;
  supported: boolean;
  complete: boolean | null;
  state: MonitorReadinessState;
}

export interface ReadinessMonitorReport {
  milOn: boolean;
  confirmedDtcCount: number;
  ignition: ReadinessIgnition;
  monitors: ReadinessMonitorItem[];
  supportedCount: number;
  completeCount: number;
  incompleteCount: number;
  readinessPercent: number | null;
  rawResponse: string;
  summary: string;
}

export interface ReadinessScanResult {
  available: boolean;
  report: ReadinessMonitorReport | null;
  response: string;
  elapsedMs: number;
  reason?: string;
}

type CommandReply = {
  response?: string;
  status: string;
  elapsedMs?: number;
  errorMessage?: string;
};

type ExecuteCommand = (command: string) => Promise<CommandReply>;

function monitor(
  id: string,
  label: string,
  supported: boolean,
  incomplete: boolean,
): ReadinessMonitorItem {
  const complete = supported ? !incomplete : null;
  return {
    id,
    label,
    supported,
    complete,
    state: !supported ? 'NOT_SUPPORTED' : complete ? 'READY' : 'INCOMPLETE',
  };
}

/**
 * Decodes the four data bytes of Mode 01 PID 01 according to the ignition
 * type reported by the ECU. The incomplete bits are inverted: 0 means complete.
 */
export function parseReadinessMonitorResponse(rawResponse: string): ReadinessMonitorReport | null {
  const stream = String(rawResponse ?? '').replace(/[^0-9A-F]/gi, '').toUpperCase();
  const marker = stream.indexOf('4101');
  if (marker < 0) return null;

  const payload = stream.slice(marker + 4, marker + 12);
  if (payload.length !== 8 || !/^[0-9A-F]{8}$/.test(payload)) return null;

  const [a, b, c, d] = [0, 2, 4, 6].map((offset) => Number.parseInt(payload.slice(offset, offset + 2), 16));
  const ignition: ReadinessIgnition = (b & 0x08) !== 0 ? 'COMPRESSION' : 'SPARK';
  const monitors: ReadinessMonitorItem[] = [
    monitor('MISFIRE', 'Falha de combustão', (b & 0x01) !== 0, (b & 0x10) !== 0),
    monitor('FUEL_SYSTEM', 'Sistema de combustível', (b & 0x02) !== 0, (b & 0x20) !== 0),
    monitor('COMPONENTS', 'Componentes abrangentes', (b & 0x04) !== 0, (b & 0x40) !== 0),
  ];

  const engineSpecific = ignition === 'SPARK'
    ? [
        ['CATALYST', 'Catalisador', 0x01],
        ['HEATED_CATALYST', 'Catalisador aquecido', 0x02],
        ['EVAP', 'Sistema evaporativo (EVAP)', 0x04],
        ['SECONDARY_AIR', 'Injeção de ar secundário', 0x08],
        ['MONITOR_C4', 'Monitor não contínuo específico (bit C4)', 0x10],
        ['O2_SENSOR', 'Sensor de oxigênio (O2)', 0x20],
        ['O2_HEATER', 'Aquecedor do sensor O2', 0x40],
        ['EGR_VVT', 'EGR / sincronismo variável', 0x80],
      ]
    : [
        ['NMHC_CATALYST', 'Catalisador NMHC', 0x01],
        ['NOX_SCR', 'Sistema NOx / SCR', 0x02],
        ['BOOST_PRESSURE', 'Pressão de sobrealimentação', 0x08],
        ['EXHAUST_GAS_SENSOR', 'Sensor de gases de escape', 0x20],
        ['PARTICULATE_FILTER', 'Filtro de partículas', 0x40],
        ['EGR_VVT', 'EGR / sincronismo variável', 0x80],
      ];

  for (const [id, label, mask] of engineSpecific as [string, string, number][]) {
    monitors.push(monitor(id, label, c, d, mask));
  }

  const supportedCount = monitors.filter((item) => item.supported).length;
  const completeCount = monitors.filter((item) => item.supported && item.complete === true).length;
  const incompleteCount = monitors.filter((item) => item.supported && item.complete === false).length;

  return {
    milOn: (a & 0x80) !== 0,
    confirmedDtcCount: a & 0x7f,
    ignition,
    monitors,
    supportedCount,
    completeCount,
    incompleteCount,
    readinessPercent: supportedCount > 0 ? Math.round((completeCount / supportedCount) * 100) : null,
    rawResponse,
    summary: `MIL=${(a & 0x80) !== 0 ? 'ON' : 'OFF'} | DTCs=${a & 0x7f} | MOTOR=${ignition} | PRONTOS=${completeCount}/${supportedCount} | INCOMPLETOS=${incompleteCount}`,
  };
}

export async function readReadinessMonitor(
  session: Pick<Elm327Session, 'executeCommand'>,
  execute: ExecuteCommand = (command) => session.executeCommand(command),
): Promise<ReadinessScanResult> {
  try {
    const reply = await execute('0101');
    const response = reply.response ?? '';
    const report = reply.status === 'OK' ? parseReadinessMonitorResponse(response) : null;
    const available = report !== null;
    return {
      available,
      report,
      response,
      elapsedMs: reply.elapsedMs ?? 0,
      ...(!available ? {
        reason: reply.errorMessage || (reply.status === 'OK'
          ? 'RESPOSTA 0101 SEM OS QUATRO BYTES DE PRONTIDÃO'
          : 'PID 0101 NÃO DISPONÍVEL: ' + reply.status),
      } : {}),
    };
  } catch (cause) {
    return {
      available: false,
      report: null,
      response: '',
      elapsedMs: 0,
      reason: cause instanceof Error ? cause.message : 'FALHA AO LER PRONTIDÃO OBD',
    };
  }
}
