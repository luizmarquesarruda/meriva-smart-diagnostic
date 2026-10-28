import type { DataSource, DtcRecord, PidObservation, VehicleCondition } from '../types/sourceTypes';
import { validatePidValue } from '../obd/formulaEngine';
import ruleCatalog from '../knowledge/diagnostic_rules.json';
import sensorTestCatalogJson from '../knowledge/sensor_tests.json';

export interface DiagnosticInput { observations: PidObservation[]; dtcs?: DtcRecord[]; condition?: VehicleCondition; nowMs?: number; maxObservationAgeMs?: number; maxDtcAgeMs?: number; }
export interface DiagnosticEvidence { ruleId: string; text: string; source: 'DTC' | 'PID'; pid?: string; dtc?: string; value?: number; sampleCount?: number; }
export interface DiagnosticHypothesis { id: string; label: string; score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; evidence: DiagnosticEvidence[]; nextTests: string[]; }
export interface DiagnosticResult { engine: 'LOCAL_EVIDENCE_ENGINE'; version: 2; generatedAt: string; hypotheses: DiagnosticHypothesis[]; acceptedLiveSamples: number; evaluatedRuleGroups: number; blockedSimulationSamples: number; blockedNonLiveSamples: number; blockedStaleSamples: number; blockedInvalidSamples: number; blockedNonLiveDtcs: number; blockedStaleDtcs: number; disclaimer: string; }

interface Rule { id: string; trigger: { dtc?: string; combinedTrimMin?: number; combinedTrimMax?: number; condition?: VehicleCondition; mapMinKpa?: number; }; hypothesis: string; baseScore: number; tests: string[]; }

const rules = ruleCatalog.rules as Rule[];
interface SensorTestLink { pid: string; label: string; aiGuidance: string; diagnosticRuleIds: string[]; }
const sensorTestLinks = (sensorTestCatalogJson as unknown as { tests: SensorTestLink[] }).tests;
function linkedSensorRecommendations(ruleId: string): string[] {
 return sensorTestLinks.filter((test)=>test.diagnosticRuleIds.includes(ruleId)).slice(0,3)
  .map((test)=>test.label+' (PID '+test.pid+'): '+test.aiGuidance);
}
const ACTIVE_DTC_STATUSES = new Set(['CONFIRMED', 'PENDING', 'PERMANENT', 'CURRENT']);
export const MAX_DIAGNOSTIC_OBSERVATION_AGE_MS = 45_000;
export const MIN_DIAGNOSTIC_SAMPLES_PER_PID = 3;
export const MAX_DIAGNOSTIC_SAMPLES_PER_PID = 5;
export const MAX_DIAGNOSTIC_DTC_AGE_MS = 5 * 60_000;

/**
 * Preserve provenance explicitly. Unknown/imported sources must never be
 * promoted to REAL_OBD by default; 'REAL' is accepted only for the live
 * LastPidReading contract used by the current native app.
 */
export function normalizeDiagnosticSource(value: unknown): DataSource {
  const source = String(value ?? '').trim().toUpperCase();
  if (source === 'REAL' || source === 'REAL_OBD') return 'REAL_OBD';
  if (source === 'SIMULACAO') return 'SIMULACAO';
  if (source === 'CARSCANNER_BASELINE' || source === 'CARSCANNER_SEED') return 'CARSCANNER_BASELINE';
  if (source === 'USER_REAL_OBSERVATION') return 'USER_REAL_OBSERVATION';
  return 'IMPORTADO';
}

function isSimulation(item: PidObservation): boolean {
  return normalizeDiagnosticSource(item.source) === 'SIMULACAO';
}
function isLiveObd(item: PidObservation): boolean {
  return normalizeDiagnosticSource(item.source) === 'REAL_OBD';
}

function normalizePid(pid: string): string { return pid.replace(/\s/g, '').toUpperCase(); }

function isFreshTimestamp(timestamp: string, nowMs: number, maxAgeMs: number): boolean {
  const parsed = Date.parse(timestamp);
  return Number.isFinite(parsed) && parsed <= nowMs && nowMs - parsed <= maxAgeMs;
}

function isCurrentValidLiveObservation(
  item: PidObservation,
  nowMs: number,
  maxAgeMs: number,
): boolean {
  if (!isLiveObd(item) || item.derived === true || item.value === null || !Number.isFinite(item.value)) return false;
  if (!isFreshTimestamp(item.timestamp, nowMs, maxAgeMs)) return false;
  return validatePidValue(normalizePid(item.pid), item.value).valid;
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}

function pidValue(
  observations: PidObservation[],
  pid: string,
  nowMs: number,
  maxAgeMs: number,
): (PidObservation & { sampleCount: number }) | undefined {
  const valid = observations
    .filter((item) =>
      normalizePid(item.pid) === pid.toUpperCase()
      && isCurrentValidLiveObservation(item, nowMs, maxAgeMs),
    )
    .sort((a, b) => Date.parse(a.timestamp) - Date.parse(b.timestamp))
    .slice(-MAX_DIAGNOSTIC_SAMPLES_PER_PID);
  if (valid.length < MIN_DIAGNOSTIC_SAMPLES_PER_PID) return undefined;

  const latest = valid[valid.length - 1];
  return {
    ...latest,
    value: median(valid.map((item) => item.value as number)),
    sampleCount: valid.length,
  };
}

function confidence(score: number): DiagnosticHypothesis['confidence'] {
  if (score >= 0.75) return 'HIGH';
  if (score >= 0.5) return 'MEDIUM';
  return 'LOW';
}

function isTrimContext(condition?: VehicleCondition): boolean {
  return condition === 'IDLE_WARM' || condition === 'CRUISE';
}

export function runLocalDiagnostic(input: DiagnosticInput): DiagnosticResult {
  const nowMs = Number.isFinite(input.nowMs) ? input.nowMs as number : Date.now();
  const maxObservationAgeMs = Number.isFinite(input.maxObservationAgeMs) && (input.maxObservationAgeMs as number) > 0
    ? input.maxObservationAgeMs as number
    : MAX_DIAGNOSTIC_OBSERVATION_AGE_MS;
  const rawObservations = input.observations ?? [];
  const observations = rawObservations.filter((item) =>
    isCurrentValidLiveObservation(item, nowMs, maxObservationAgeMs),
  );
  const maxDtcAgeMs = Number.isFinite(input.maxDtcAgeMs) && (input.maxDtcAgeMs as number) > 0
    ? input.maxDtcAgeMs as number
    : MAX_DIAGNOSTIC_DTC_AGE_MS;
  const rawDtcs = input.dtcs ?? [];
  const isLiveDtcRecord = (item: DtcRecord) =>
    String(item.source ?? '').trim().toUpperCase() === 'REAL_OBD'
    && item.historical !== true
    && ACTIVE_DTC_STATUSES.has(String(item.status ?? '').trim().toUpperCase());
  const liveDtcs = rawDtcs.filter((item) =>
    isLiveDtcRecord(item) && isFreshTimestamp(item.lastSeen, nowMs, maxDtcAgeMs),
  );
  const blockedSimulationSamples = rawObservations.filter(isSimulation).length;
  const blockedNonLiveSamples = rawObservations.filter((item) => !isLiveObd(item) && !isSimulation(item)).length;
  const blockedStaleSamples = rawObservations.filter((item) =>
    isLiveObd(item) && !isFreshTimestamp(item.timestamp, nowMs, maxObservationAgeMs),
  ).length;
  const blockedInvalidSamples = rawObservations.filter((item) =>
    isLiveObd(item)
    && isFreshTimestamp(item.timestamp, nowMs, maxObservationAgeMs)
    && (item.derived === true || item.value === null || !Number.isFinite(item.value) || !validatePidValue(normalizePid(item.pid), item.value).valid),
  ).length;
  const blockedNonLiveDtcs = rawDtcs.filter((item) => !isLiveDtcRecord(item)).length;
  const blockedStaleDtcs = rawDtcs.filter((item) => isLiveDtcRecord(item) && !isFreshTimestamp(item.lastSeen, nowMs, maxDtcAgeMs)).length;
  const hypotheses = new Map<string, DiagnosticHypothesis>();
  let evaluatedRuleGroups = 0;

  const add = (rule: Rule, evidence: DiagnosticEvidence): void => {
    const current = hypotheses.get(rule.hypothesis);
    if (current) {
      const evidenceKey = `${evidence.source}:${evidence.ruleId}:${evidence.dtc ?? evidence.pid ?? ''}`;
      if (current.evidence.some((item) => `${item.source}:${item.ruleId}:${item.dtc ?? item.pid ?? ''}` === evidenceKey)) return;
      current.score = Math.min(0.99, current.score + 0.15);
      current.evidence.push(evidence);
      current.confidence = confidence(current.score);
      return;
    }
    hypotheses.set(rule.hypothesis, {
      id: rule.hypothesis,
      label: rule.hypothesis.replaceAll('_', ' '),
      score: rule.baseScore,
      confidence: confidence(rule.baseScore),
      evidence: [evidence],
      nextTests: [...new Set([...rule.tests, ...linkedSensorRecommendations(rule.id)])],
    });
  };

  for (const rule of rules) {
    if (!rule.trigger.dtc) continue;
    const dtc = liveDtcs.find((item) => item.code.toUpperCase() === rule.trigger.dtc);
    if (!dtc) continue;
    add(rule, {
      ruleId: rule.id,
      text: 'DTC ' + dtc.code + ' presente com status ' + dtc.status + '; fonte REAL_OBD.',
      source: 'DTC',
      dtc: dtc.code,
    });
  }

  const stft = pidValue(observations, '0106', nowMs, maxObservationAgeMs);
  const ltft = pidValue(observations, '0107', nowMs, maxObservationAgeMs);
  if (stft && ltft && isTrimContext(input.condition)) {
    evaluatedRuleGroups += 1;
    const combinedTrim = stft.value! + ltft.value!;
    const lean = rules.find((item) => item.id === 'FUEL_TRIM_LEAN');
    const rich = rules.find((item) => item.id === 'FUEL_TRIM_RICH');
    if (lean && combinedTrim >= (lean.trigger.combinedTrimMin ?? Number.POSITIVE_INFINITY)) {
      add(lean, { ruleId: lean.id, text: 'Mediana de ' + stft.sampleCount + ' leituras STFT e ' + ltft.sampleCount + ' leituras LTFT: soma = ' + combinedTrim.toFixed(2) + '% em contexto ' + input.condition + '.', source: 'PID', pid: '0106/0107', value: combinedTrim, sampleCount: Math.min(stft.sampleCount, ltft.sampleCount) });
    } else if (rich && combinedTrim <= (rich.trigger.combinedTrimMax ?? Number.NEGATIVE_INFINITY)) {
      add(rich, { ruleId: rich.id, text: 'Mediana de ' + stft.sampleCount + ' leituras STFT e ' + ltft.sampleCount + ' leituras LTFT: soma = ' + combinedTrim.toFixed(2) + '% em contexto ' + input.condition + '.', source: 'PID', pid: '0106/0107', value: combinedTrim, sampleCount: Math.min(stft.sampleCount, ltft.sampleCount) });
    }
  }

  const map = pidValue(observations, '010B', nowMs, maxObservationAgeMs);
  const mapRule = rules.find((item) => item.id === 'MAP_HIGH_IDLE');
  if (map && mapRule && input.condition === mapRule.trigger.condition) {
    evaluatedRuleGroups += 1;
    if (map.value! >= (mapRule.trigger.mapMinKpa ?? Number.POSITIVE_INFINITY)) {
      add(mapRule, { ruleId: mapRule.id, text: 'Mediana de ' + map.sampleCount + ' leituras MAP em marcha lenta aquecida = ' + map.value!.toFixed(2) + ' kPa.', source: 'PID', pid: '010B', value: map.value!, sampleCount: map.sampleCount });
    }
  }

  return {
    engine: 'LOCAL_EVIDENCE_ENGINE',
    version: 2,
    generatedAt: new Date().toISOString(),
    hypotheses: [...hypotheses.values()].sort((a, b) => b.score - a.score),
    acceptedLiveSamples: observations.length,
    evaluatedRuleGroups,
    blockedSimulationSamples,
    blockedNonLiveSamples,
    blockedStaleSamples,
    blockedInvalidSamples,
    blockedNonLiveDtcs,
    blockedStaleDtcs,
    disclaimer: 'Pontuação e nível de evidência são heurísticos, não probabilidades estatísticas. Regras de tendência exigem ao menos ' + MIN_DIAGNOSTIC_SAMPLES_PER_PID + ' amostras REAL_OBD finitas, plausíveis, distintas e recentes (até ' + Math.round(maxObservationAgeMs / 1000) + ' s); a comparação usa a mediana das últimas amostras. Nenhuma hipótese isolada confirma defeito; ausência de hipótese não certifica a saúde do veículo.'
  };
}
