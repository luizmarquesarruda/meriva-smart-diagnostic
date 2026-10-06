import obdServices from '../knowledge/obd_services.json';
import dtcKnowledge from '../knowledge/dtc.json';
import componentsKnowledge from '../knowledge/components.json';
import contextsKnowledge from '../knowledge/contexts.json';
import learningKnowledge from '../knowledge/learning.json';
import diagnosticsKnowledge from '../knowledge/diagnostics.json';
import alertsKnowledge from '../knowledge/alerts.json';

type ObdService = (typeof obdServices.services)[number];
type DtcKnowledge = (typeof dtcKnowledge.codes)[number];
export type RuntimeContext =
  | 'MOTOR_FRIO'
  | 'MOTOR_AQUECIDO'
  | 'IDLE'
  | 'TRANSITO'
  | 'ESTRADA'
  | 'CARGA'
  | 'AR_CONDICIONADO';

export interface ContextInput {
  engineTemperatureC?: number | null;
  vehicleSpeedKmh?: number | null;
  rpm?: number | null;
  engineLoadPercent?: number | null;
  airConditioningOn?: boolean | null;
}

export function getObdService(mode: string): ObdService | null {
  const normalized = mode.replace(/\s/g, '').toUpperCase().replace(/^0X/, '');
  return obdServices.services.find((service) => service.mode === normalized) ?? null;
}

export function assertObdServiceAllowed(mode: string, explicitUserAction = false): void {
  const service = getObdService(mode);
  if (!service) throw new Error(`SERVIÇO OBD ${mode} NÃO ESTÁ NO BANCO DE SERVIÇOS PERMITIDOS.`);
  if (!service.allowed && !(service.requiresExplicitUserAction && explicitUserAction)) {
    throw new Error(`SERVIÇO OBD ${service.mode} BLOQUEADO SEM AÇÃO EXPLÍCITA DO USUÁRIO.`);
  }
}

export function getDtcKnowledge(code: string): DtcKnowledge | null {
  const normalized = code.trim().toUpperCase();
  return dtcKnowledge.codes.find((item) => item.code === normalized) ?? null;
}

export function getComponentKnowledge(id: string) {
  const normalized = id.trim().toUpperCase();
  return componentsKnowledge.components.find((item) => item.id === normalized) ?? null;
}

function finite(value: number | null | undefined): value is number {
  return value != null && Number.isFinite(value);
}

export function detectContexts(input: ContextInput): RuntimeContext[] {
  const contexts: RuntimeContext[] = [];
  const temperature = input.engineTemperatureC;
  const speed = input.vehicleSpeedKmh;
  const rpm = input.rpm;
  const load = input.engineLoadPercent;

  if (finite(temperature) && temperature < 70) contexts.push('MOTOR_FRIO');
  if (finite(temperature) && temperature >= 80) contexts.push('MOTOR_AQUECIDO');
  if (finite(speed) && finite(rpm) && speed === 0 && rpm >= 600 && rpm <= 1000) contexts.push('IDLE');
  if (finite(speed) && speed > 0 && speed < 60) contexts.push('TRANSITO');
  if (finite(speed) && speed >= 60) contexts.push('ESTRADA');
  if (finite(load) && load >= 50) contexts.push('CARGA');
  if (input.airConditioningOn === true) contexts.push('AR_CONDICIONADO');

  return contexts;
}

export function canLearnPid(pid: string): boolean {
  return learningKnowledge.learnable.includes(pid.replace(/\s/g, '').toUpperCase());
}

export function getLearningPolicy() {
  return learningKnowledge.rules;
}

export function getDiagnosticCorrelations() {
  return diagnosticsKnowledge.correlations;
}

export function getAlertPolicy() {
  return alertsKnowledge;
}

export function getKnowledgeRuntimeVersion(): number {
  return Math.min(
    obdServices.version,
    dtcKnowledge.version,
    componentsKnowledge.version,
    contextsKnowledge.version,
    learningKnowledge.version,
    diagnosticsKnowledge.version,
    alertsKnowledge.version,
  );
}
