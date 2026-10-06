import healthReference from '../knowledge/meriva_health.json';
import { detectContexts, getAlertPolicy, type RuntimeContext } from './knowledgeRuntime';

export type HealthState = 'NORMAL' | 'ATENCAO' | 'CRITICO' | 'SEM_DADOS';
export type HealthContext =
  | 'IDLE'
  | 'TRANSITO'
  | 'ESTRADA'
  | 'MOTOR_FRIO'
  | 'MOTOR_AQUECIDO'
  | 'CARGA'
  | 'AR_CONDICIONADO';

export interface HealthSample {
  pid: string;
  value: number | null;
  valid?: boolean;
  timestampMs?: number;
}

export interface HealthFinding {
  id: string;
  state: HealthState;
  pid?: string;
  message: string;
  action?: string;
  value?: number | null;
  reference?: number | null;
  consecutiveSamples: number;
}

export interface HealthSnapshot {
  state: HealthState;
  findings: HealthFinding[];
}

type CounterMap = Map<string, number>;

const REF = healthReference as any;
const ALERTS = getAlertPolicy() as any;
const OVERHEAT_REFERENCE = ALERTS.events.find((event: any) => event.id === 'OVERHEAT_REFERENCE');

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

function count(counter: CounterMap, key: string, condition: boolean): number {
  const next = condition ? (counter.get(key) ?? 0) + 1 : 0;
  counter.set(key, next);
  return next;
}

function worstState(findings: HealthFinding[]): HealthState {
  if (findings.some((item) => item.state === 'CRITICO')) return 'CRITICO';
  if (findings.some((item) => item.state === 'ATENCAO')) return 'ATENCAO';
  if (findings.some((item) => item.state === 'SEM_DADOS')) return 'SEM_DADOS';
  return 'NORMAL';
}

/**
 * Motor de saúde local da Meriva.
 *
 * Regras numéricas são lidas exclusivamente de meriva_health.json.
 * Este módulo não inventa limite de superaquecimento: a documentação
 * disponível fornece referências da termostática/ventoinha, mas não um
 * limite OBD universal para "temperatura máxima".
 */
export class MerivaHealthMonitor {
  private readonly counters: CounterMap = new Map();

  reset(): void {
    this.counters.clear();
  }

  evaluate(
    samples: HealthSample[],
    context: HealthContext | null = null,
  ): HealthSnapshot {
    const byPid = new Map(samples.map((sample) => [sample.pid.toUpperCase(), sample]));
    const findings: HealthFinding[] = [];
    const runtimeContexts = detectContexts({
      engineTemperatureC: byPid.get('0105')?.value,
      vehicleSpeedKmh: byPid.get('010D')?.value,
      rpm: byPid.get('010C')?.value,
      engineLoadPercent: byPid.get('0104')?.value,
    });
    const effectiveContext = context ?? (runtimeContexts[0] as RuntimeContext | undefined) ?? null;

    this.evaluateCooling(byPid, findings);
    this.evaluateEngine(byPid, effectiveContext as HealthContext | null, findings);
    this.evaluateElectrical(byPid, effectiveContext as HealthContext | null, findings);
    this.evaluateFueling(byPid, effectiveContext as HealthContext | null, findings);

    return {
      state: worstState(findings),
      findings,
    };
  }

  private evaluateCooling(
    byPid: Map<string, HealthSample>,
    findings: HealthFinding[],
  ): void {
    const coolant = byPid.get('0105');
    if (!coolant || coolant.valid === false || !finite(coolant.value)) {
      const samples = count(this.counters, 'coolant_missing', true);
      findings.push({
        id: 'coolant_missing',
        state: 'SEM_DADOS',
        pid: '0105',
        message: 'Temperatura do líquido de arrefecimento sem dado OBD válido.',
        action: 'REPORTAR_LIMITACAO',
        value: null,
        consecutiveSamples: samples,
      });
      return;
    }

    count(this.counters, 'coolant_missing', false);

    const thermostat = Number(REF.reference_values.coolant_thermostat_open.value);
    const fanOn = Number(OVERHEAT_REFERENCE?.condition.match(/>=\s*(\d+)/)?.[1] ?? REF.reference_values.coolant_fan_stage1_on.value);
    const fanOff = Number(REF.reference_values.coolant_fan_off.value);

    const thermostatCrossed = count(
      this.counters,
      'thermostat_transition',
      coolant.value >= thermostat,
    );
    if (coolant.value >= thermostat) {
      findings.push({
        id: 'thermostat_transition',
        state: 'NORMAL',
        pid: '0105',
        message: 'Temperatura atingiu a referência de abertura da termostática.',
        action: 'REGISTRAR_TRANSICAO',
        value: coolant.value,
        reference: thermostat,
        consecutiveSamples: thermostatCrossed,
      });
    }

    const fanReached = count(this.counters, 'fan_stage1', coolant.value >= fanOn);
    if (coolant.value >= fanOn) {
      findings.push({
        id: 'fan_stage1',
        state: 'ATENCAO',
        pid: '0105',
        message: 'Temperatura atingiu a referência de acionamento da primeira velocidade da ventoinha.',
        action: 'VERIFICAR_COMANDO_DA_VENTOINHA',
        value: coolant.value,
        reference: fanOn,
        consecutiveSamples: fanReached,
      });
    }

    const fanRelease = count(
      this.counters,
      'fan_should_release',
      coolant.value < fanOff,
    );
    if (coolant.value < fanOff) {
      findings.push({
        id: 'fan_should_release',
        state: 'NORMAL',
        pid: '0105',
        message: 'Temperatura está abaixo da referência de desacionamento da ventoinha.',
        action: 'VERIFICAR_DESACIONAMENTO_SE_VENTOINHA_CONTINUAR_LIGADA',
        value: coolant.value,
        reference: fanOff,
        consecutiveSamples: fanRelease,
      });
    }
  }

  private evaluateEngine(
    byPid: Map<string, HealthSample>,
    context: HealthContext | null,
    findings: HealthFinding[],
  ): void {
    const rpm = byPid.get('010C');
    if (
      context === 'IDLE' &&
      rpm &&
      rpm.valid !== false &&
      finite(rpm.value)
    ) {
      const min = Number(REF.reference_values.engine_idle_rpm.value_min);
      const max = Number(REF.reference_values.engine_idle_rpm.value_max);
      const outside = rpm.value < min || rpm.value > max;
      const samples = count(this.counters, 'idle_rpm_reference', outside);
      if (outside && samples >= 5) {
        findings.push({
          id: 'idle_rpm_reference',
          state: 'ATENCAO',
          pid: '010C',
          message: 'Marcha lenta fora da faixa de referência de forma persistente.',
          action: 'REGISTRAR_TENDENCIA',
          value: rpm.value,
          reference: rpm.value < min ? min : max,
          consecutiveSamples: samples,
        });
      }
      if (!outside) count(this.counters, 'idle_rpm_reference', false);
    }

    const cutoff = Number(REF.reference_values.engine_cutoff_rpm.value);
    if (rpm && rpm.valid !== false && finite(rpm.value)) {
      const nearCutoff = rpm.value > cutoff * 0.9;
      const samples = count(this.counters, 'rpm_near_cutoff', nearCutoff);
      if (nearCutoff && samples >= 2) {
        findings.push({
          id: 'rpm_near_cutoff',
          state: 'ATENCAO',
          pid: '010C',
          message: 'RPM próximo do corte de injeção especificado.',
          action: 'ALERTAR',
          value: rpm.value,
          reference: cutoff,
          consecutiveSamples: samples,
        });
      }
    }
  }

  private evaluateElectrical(
    byPid: Map<string, HealthSample>,
    context: HealthContext | null,
    findings: HealthFinding[],
  ): void {
    if (context !== 'MOTOR_FRIO' && context !== 'IDLE' && context !== 'MOTOR_AQUECIDO') return;
    const voltage = byPid.get('0142');
    if (!voltage || voltage.valid === false || !finite(voltage.value)) return;

    const min = Number(REF.reference_values.ecu_supply.value_min_engine_running);
    const max = Number(REF.reference_values.ecu_supply.value_max_engine_running);
    const outside = voltage.value < min || voltage.value > max;
    const samples = count(this.counters, 'ecu_supply_reference', outside);
    if (outside && samples >= 3) {
      findings.push({
        id: 'ecu_supply_reference',
        state: 'ATENCAO',
        pid: '0142',
        message: 'Tensão da UCE fora da faixa de referência com motor em funcionamento.',
        action: 'COMPARAR_E_REGISTRAR',
        value: voltage.value,
        reference: voltage.value < min ? min : max,
        consecutiveSamples: samples,
      });
    }
    if (!outside) count(this.counters, 'ecu_supply_reference', false);
  }

  private evaluateFueling(
    byPid: Map<string, HealthSample>,
    context: HealthContext | null,
    findings: HealthFinding[],
  ): void {
    if (context !== 'IDLE' && context !== 'MOTOR_AQUECIDO') return;
    const o2 = byPid.get('0114');
    if (!o2 || o2.valid === false || !finite(o2.value)) return;

    const min = Number(REF.reference_values.o2_idle_voltage.value_min);
    const max = Number(REF.reference_values.o2_idle_voltage.value_max);
    if (o2.value < min || o2.value > max) {
      findings.push({
        id: 'o2_signal_reference',
        state: 'ATENCAO',
        pid: '0114',
        message: 'Sinal da sonda lambda fora da faixa de referência do teste.',
        action: 'ANALISAR_SINAL_E_TEMPO_DE_RESPOSTA',
        value: o2.value,
        reference: o2.value < min ? min : max,
        consecutiveSamples: count(this.counters, 'o2_signal_reference', true),
      });
    } else {
      count(this.counters, 'o2_signal_reference', false);
    }
  }
}

export const merivaHealthMonitor = new MerivaHealthMonitor();
