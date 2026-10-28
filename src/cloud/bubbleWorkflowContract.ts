/**
 * Native-side contract for the existing Bubble Workflow API.
 *
 * This module validates only the public workflow contract. It does not make
 * cloud data authoritative over local ECU readings, GPS filtering, or SQLite.
 */
export const BUBBLE_WORKFLOW_VERSION = 1 as const;
export const BUBBLE_ANDROID_INGRESS = 'ANDROID_INGRESS_V1' as const;
export const BUBBLE_MAX_EVENT_AGE_MS = 24 * 60 * 60 * 1000;
export const BUBBLE_MIN_READING_INTERVAL_MS = 1000;

export const BUBBLE_SUPPORTED_PIDS = [
  '010C', '010D', '0105', '010F', '0110', '010B',
  '0111', '0104', '0106', '0107', '012F', '015E',
] as const;
export type BubblePid = (typeof BUBBLE_SUPPORTED_PIDS)[number];

export const BUBBLE_VALIDITY = [
  'Válido', 'Expirado', 'Rejeitado', 'Timeout', 'Aguardando',
] as const;
export type BubbleValidity = (typeof BUBBLE_VALIDITY)[number];

export const BUBBLE_TRIP_STATES = ['Em andamento', 'Concluída'] as const;
export type BubbleTripState = (typeof BUBBLE_TRIP_STATES)[number];

export const BUBBLE_DTC_SEVERITIES = [
  'Crítico', 'Alerta', 'Informativo', 'Resolvido',
] as const;
export type BubbleDtcSeverity = (typeof BUBBLE_DTC_SEVERITIES)[number];

export const BUBBLE_CONNECTION_STATES = [
  'Conectado', 'Sincronizando', 'Desconectado', 'Timeout', 'Erro',
] as const;
export type BubbleConnectionState = (typeof BUBBLE_CONNECTION_STATES)[number];

export class BubbleContractError extends Error {
  readonly code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = 'BubbleContractError';
    this.code = code;
  }
}

export function normalizeBubblePid(value: string): BubblePid {
  const pid = value.trim().toUpperCase();
  if (!(BUBBLE_SUPPORTED_PIDS as readonly string[]).includes(pid)) {
    throw new BubbleContractError('PID_NOT_IN_BUBBLE_CATALOG', 'PID não consta no catálogo de entrada do Bubble.');
  }
  return pid as BubblePid;
}

function requireText(value: string, field: string, maxLength = 160): string {
  if (typeof value !== 'string' || value.trim().length === 0 || value.trim().length > maxLength) {
    throw new BubbleContractError('INVALID_' + field.toUpperCase(), field + ' precisa ser um texto não vazio dentro do limite.');
  }
  return value.trim();
}

function toTimestampMs(value: string | number, field: string): number {
  const ms = typeof value === 'number' ? value : Date.parse(value);
  if (!Number.isFinite(ms) || ms <= 0) {
    throw new BubbleContractError('INVALID_' + field.toUpperCase(), field + ' precisa conter uma data válida.');
  }
  return ms;
}

function normalizeDate(value: string | number, field: string): string {
  return new Date(toTimestampMs(value, field)).toISOString();
}

function requireFreshTimestamp(
  value: string | number,
  nowMs: number,
  field: string,
  previousAtMs?: number,
): string {
  const atMs = toTimestampMs(value, field);
  if (atMs > nowMs) {
    throw new BubbleContractError('FUTURE_TIMESTAMP', field + ' está no futuro.');
  }
  if (nowMs - atMs > BUBBLE_MAX_EVENT_AGE_MS) {
    throw new BubbleContractError('EVENT_EXPIRED', field + ' excede a janela de 24 horas aceita pelo Bubble.');
  }
  if (previousAtMs != null) {
    if (!Number.isFinite(previousAtMs) || atMs - previousAtMs < BUBBLE_MIN_READING_INTERVAL_MS) {
      throw new BubbleContractError('NON_MONOTONIC_TIMESTAMP', field + ' precisa avançar pelo menos 1 segundo.');
    }
  }
  return new Date(atMs).toISOString();
}

function requireByte(value: number, field: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 255) {
    throw new BubbleContractError('INVALID_' + field.toUpperCase(), field + ' precisa ser um byte inteiro de 0 a 255.');
  }
  return value;
}

export interface BubbleReadingDraft {
  deviceId: string;
  tripId?: string | null;
  eventId: string;
  pid: string;
  a: number;
  b: number;
  at: string | number;
  source: 'REAL_OBD' | 'SIMULACAO' | 'CARSCANNER_BASELINE';
  ecuValidated: boolean;
  declared: boolean;
  previousAtMs?: number;
}

export interface BubbleReadingPayload {
  version: 1;
  device: string;
  trip?: string;
  event_id: string;
  pid: BubblePid;
  a: number;
  b: number;
  at: string;
  status: 'Válido';
  declared: false;
}

export function prepareBubbleReading(draft: BubbleReadingDraft, nowMs = Date.now()): BubbleReadingPayload {
  const device = requireText(draft.deviceId, 'deviceId');
  const event_id = requireText(draft.eventId, 'eventId', 128);
  const pid = normalizeBubblePid(draft.pid);
  if (draft.source !== 'REAL_OBD' || draft.ecuValidated !== true) {
    throw new BubbleContractError('REAL_ECU_EVIDENCE_REQUIRED', 'Somente amostras reais após validação da ECU podem ser sincronizadas como leitura válida.');
  }
  if (draft.declared !== false) {
    throw new BubbleContractError('DECLARED_SUPPORT_IS_NOT_A_READING', 'Suporte declarado não comprova uma resposta real da ECU.');
  }
  if (draft.tripId != null && draft.tripId.trim().length === 0) {
    throw new BubbleContractError('INVALID_TRIP_ID', 'tripId precisa ser omitido ou conter um identificador válido.');
  }
  const payload: BubbleReadingPayload = {
    version: BUBBLE_WORKFLOW_VERSION,
    device,
    event_id,
    pid,
    a: requireByte(draft.a, 'a'),
    b: requireByte(draft.b, 'b'),
    at: requireFreshTimestamp(draft.at, nowMs, 'at', draft.previousAtMs),
    status: 'Válido',
    declared: false,
  };
  if (draft.tripId != null) payload.trip = requireText(draft.tripId, 'tripId');
  return payload;
}

export interface BubbleGpsDraft {
  deviceId: string;
  tripId: string;
  eventId: string;
  at: string | number;
  lat: number;
  lng: number;
  accuracy: number;
  speedKmh: number;
  previousAtMs?: number;
}

export interface BubbleGpsPayload {
  version: 1;
  device: string;
  trip: string;
  event_id: string;
  at: string;
  lat: number;
  lng: number;
  accuracy: number;
  speed: number;
}

export function prepareBubbleGps(draft: BubbleGpsDraft, nowMs = Date.now()): BubbleGpsPayload {
  const lat = draft.lat;
  const lng = draft.lng;
  const accuracy = draft.accuracy;
  const speed = draft.speedKmh;
  if (!Number.isFinite(lat) || lat < -85 || lat > 85) {
    throw new BubbleContractError('GPS_LATITUDE_OUT_OF_RANGE', 'Latitude fora do limite aceito pelo workflow Bubble.');
  }
  if (!Number.isFinite(lng) || lng < -180 || lng > 180) {
    throw new BubbleContractError('GPS_LONGITUDE_OUT_OF_RANGE', 'Longitude fora do limite aceito pelo workflow Bubble.');
  }
  if (!Number.isFinite(accuracy) || accuracy < 0 || accuracy > 50) {
    throw new BubbleContractError('GPS_ACCURACY_OUT_OF_RANGE', 'Precisão GPS deve estar entre 0 e 50 metros.');
  }
  if (!Number.isFinite(speed) || speed < 0 || speed > 250) {
    throw new BubbleContractError('GPS_SPEED_OUT_OF_RANGE', 'Velocidade GPS deve estar entre 0 e 250 km/h.');
  }
  return {
    version: BUBBLE_WORKFLOW_VERSION,
    device: requireText(draft.deviceId, 'deviceId'),
    trip: requireText(draft.tripId, 'tripId'),
    event_id: requireText(draft.eventId, 'eventId', 128),
    at: requireFreshTimestamp(draft.at, nowMs, 'at', draft.previousAtMs),
    lat,
    lng,
    accuracy,
    speed,
  };
}

export interface BubbleTripDraft {
  deviceId: string;
  externalId: string;
  name: string;
  startAt: string | number;
  endAt?: string | number | null;
  status: BubbleTripState;
}

export function prepareBubbleTrip(draft: BubbleTripDraft): Record<string, unknown> {
  if (!(BUBBLE_TRIP_STATES as readonly string[]).includes(draft.status)) {
    throw new BubbleContractError('INVALID_TRIP_STATUS', 'Estado de viagem não consta no contrato Bubble.');
  }
  const start = normalizeDate(draft.startAt, 'startAt');
  const end = draft.endAt == null ? null : normalizeDate(draft.endAt, 'endAt');
  if (end != null && Date.parse(end) < Date.parse(start)) {
    throw new BubbleContractError('TRIP_END_BEFORE_START', 'Fim da viagem não pode anteceder o início.');
  }
  if (draft.status === 'Concluída' && end == null) {
    throw new BubbleContractError('COMPLETED_TRIP_NEEDS_END', 'Viagem concluída precisa ter horário final.');
  }
  return {
    version: BUBBLE_WORKFLOW_VERSION,
    device: requireText(draft.deviceId, 'deviceId'),
    external_id: requireText(draft.externalId, 'externalId', 128),
    name: requireText(draft.name, 'name'),
    start,
    ...(end == null ? {} : { end }),
    status: draft.status,
  };
}

export interface BubbleDtcDraft {
  deviceId: string;
  tripId?: string | null;
  code: string;
  description: string;
  severity: BubbleDtcSeverity;
  confirmed: boolean;
  at: string | number;
}

export function prepareBubbleDtc(draft: BubbleDtcDraft): Record<string, unknown> {
  const code = requireText(draft.code, 'code', 8).toUpperCase();
  if (!/^[PCBU][0-9A-F]{4}$/.test(code)) {
    throw new BubbleContractError('INVALID_DTC_CODE', 'Código DTC precisa ter formato OBD-II válido.');
  }
  if (!(BUBBLE_DTC_SEVERITIES as readonly string[]).includes(draft.severity)) {
    throw new BubbleContractError('INVALID_DTC_SEVERITY', 'Severidade DTC não consta no contrato Bubble.');
  }
  if (typeof draft.confirmed !== 'boolean') {
    throw new BubbleContractError('INVALID_DTC_CONFIRMATION', 'Confirmação DTC precisa ser booleana.');
  }
  const payload: Record<string, unknown> = {
    version: BUBBLE_WORKFLOW_VERSION,
    device: requireText(draft.deviceId, 'deviceId'),
    code,
    description: requireText(draft.description, 'description', 500),
    severity: draft.severity,
    confirmed: draft.confirmed,
    at: normalizeDate(draft.at, 'at'),
  };
  if (draft.tripId != null) payload.trip = requireText(draft.tripId, 'tripId');
  return payload;
}

export function prepareBubblePidSupport(deviceId: string, pidValue: string, supported: boolean): Record<string, unknown> {
  if (typeof supported !== 'boolean') {
    throw new BubbleContractError('INVALID_PID_SUPPORT', 'supported precisa ser booleano.');
  }
  return {
    version: BUBBLE_WORKFLOW_VERSION,
    device: requireText(deviceId, 'deviceId'),
    pid: normalizeBubblePid(pidValue),
    supported,
  };
}

export function prepareBubbleHeartbeat(
  deviceId: string,
  connection: BubbleConnectionState,
  signal: number,
  firmware: string,
): Record<string, unknown> {
  if (!(BUBBLE_CONNECTION_STATES as readonly string[]).includes(connection)) {
    throw new BubbleContractError('INVALID_CONNECTION_STATE', 'Estado de conexão não consta no contrato Bubble.');
  }
  if (!Number.isFinite(signal)) {
    throw new BubbleContractError('INVALID_SIGNAL', 'signal precisa ser um número finito.');
  }
  return {
    version: BUBBLE_WORKFLOW_VERSION,
    device: requireText(deviceId, 'deviceId'),
    connection,
    signal,
    firmware: typeof firmware === 'string' ? firmware.trim().slice(0, 160) : '',
  };
}

export type BubbleAcknowledgement = 'ACCEPTED' | 'DUPLICATE_ACCEPTED' | 'REJECTED' | 'UNKNOWN';

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : null;
}

export function unwrapBubbleResponse(value: unknown): unknown {
  const record = asRecord(value);
  return record != null && Object.prototype.hasOwnProperty.call(record, 'response')
    ? record.response
    : value;
}

export function classifyBubbleAcknowledgement(value: unknown): BubbleAcknowledgement {
  const record = asRecord(unwrapBubbleResponse(value));
  if (record == null) return 'UNKNOWN';
  if (record.duplicate === true && record.accepted === true) return 'DUPLICATE_ACCEPTED';
  if (record.accepted === true) return 'ACCEPTED';
  if (record.accepted === false) return 'REJECTED';
  if (record.duplicate === true) return 'UNKNOWN';
  return 'UNKNOWN';
}
