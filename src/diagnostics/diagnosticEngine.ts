import type { DtcRecord, PidObservation, VehicleCondition } from '../types/sourceTypes';
import ruleCatalog from '../knowledge/diagnostic_rules.json';
import sensorTestCatalogJson from '../knowledge/sensor_tests.json';
import * as aiPolicyJson from '../knowledge/ai_policy.json';

export interface DiagnosticInput { observations: PidObservation[]; dtcs?: DtcRecord[]; condition?: VehicleCondition; }
export interface DiagnosticEvidence { ruleId: string; text: string; source: 'DTC' | 'PID'; pid?: string; dtc?: string; value?: number; }
export interface DiagnosticHypothesis { id: string; label: string; score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; evidence: DiagnosticEvidence[]; nextTests: string[]; }
export interface DiagnosticResult { engine: 'LOCAL_EVIDENCE_ENGINE'; version: 1; generatedAt: string; hypotheses: DiagnosticHypothesis[]; blockedSimulationSamples: number; blockedNonLiveDtcs: number; blockedStaleSamples: number; disclaimer: string; }

interface Rule { id: string; trigger: { dtc?: string; combinedTrimMin?: number; combinedTrimMax?: number; condition?: VehicleCondition; mapMinKpa?: number; }; hypothesis: string; baseScore: number; tests: string[]; }

const rules = ruleCatalog.rules as Rule[];
interface SensorTestLink { pid: string; label: string; aiGuidance: string; diagnosticRuleIds: string[]; }
const sensorTestLinks = (sensorTestCatalogJson as unknown as { tests: SensorTestLink[] }).tests;
function linkedSensorRecommendations(ruleId: string): string[] {
 return sensorTestLinks.filter((test)=>test.diagnosticRuleIds.includes(ruleId)).slice(0,3)
  .map((test)=>test.label+' (PID '+test.pid+'): '+test.aiGuidance);
}
interface AiPolicyConfig {
  sources?: { liveObd?: unknown };
  observations?: { maxAgeMs?: unknown };
  dtcs?: { activeStatuses?: unknown };
  scoring?: { mediumAt?: unknown; highAt?: unknown; additionalEvidenceIncrement?: unknown; maxScore?: unknown };
}
const aiPolicy = aiPolicyJson as unknown as AiPolicyConfig;
function policyNumber(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return fallback;
  return Math.max(min, Math.min(max, value));
}
// Falhar fechado: uma fonte configurada diferente de REAL_OBD nunca vira evidência real.
const LIVE_OBD_SOURCE = aiPolicy.sources?.liveObd === 'REAL_OBD' ? 'REAL_OBD' : '__INVALID_AI_POLICY_SOURCE__';
const MAX_DIAGNOSTIC_READING_AGE_MS = policyNumber(aiPolicy.observations?.maxAgeMs, 60_000, 1_000, 60_000);
const SAFE_ACTIVE_DTC_STATUSES = new Set(['CONFIRMED', 'PENDING', 'PERMANENT', 'CURRENT']);
const configuredActiveStatuses = aiPolicy.dtcs?.activeStatuses;
const ACTIVE_DTC_STATUSES = new Set(
  (Array.isArray(configuredActiveStatuses) ? configuredActiveStatuses : [])
    .filter((status): status is string => typeof status === 'string')
    .map((status) => status.toUpperCase())
    .filter((status) => SAFE_ACTIVE_DTC_STATUSES.has(status)),
);
const MEDIUM_CONFIDENCE_AT = policyNumber(aiPolicy.scoring?.mediumAt, 0.5, 0.01, 0.98);
const HIGH_CONFIDENCE_AT_RAW = policyNumber(aiPolicy.scoring?.highAt, 0.75, 0.51, 0.99);
const HIGH_CONFIDENCE_AT = HIGH_CONFIDENCE_AT_RAW > MEDIUM_CONFIDENCE_AT ? HIGH_CONFIDENCE_AT_RAW : Math.min(0.99, MEDIUM_CONFIDENCE_AT + 0.01);
const ADDITIONAL_EVIDENCE_INCREMENT = policyNumber(aiPolicy.scoring?.additionalEvidenceIncrement, 0.15, 0, 0.49);
const MAX_HYPOTHESIS_SCORE = policyNumber(aiPolicy.scoring?.maxScore, 0.99, 0.5, 0.99);

function isSimulation(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === 'SIMULACAO'; }
function isLiveObd(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === LIVE_OBD_SOURCE; }
function isFreshReading(item: PidObservation, now = Date.now()): boolean {
  const timestamp = Date.parse(item.timestamp);
  const age = now - timestamp;
  return Number.isFinite(timestamp) && age >= 0 && age <= MAX_DIAGNOSTIC_READING_AGE_MS;
}

function pidValue(observations: PidObservation[], pid: string): PidObservation | undefined {
  return observations
    .filter((item) => item.pid.toUpperCase() === pid.toUpperCase() && typeof item.value === 'number' && Number.isFinite(item.value) && isLiveObd(item) && isFreshReading(item))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
}

function confidence(score: number): DiagnosticHypothesis['confidence'] {
  if (score >= HIGH_CONFIDENCE_AT) return 'HIGH';
  if (score >= MEDIUM_CONFIDENCE_AT) return 'MEDIUM';
  return 'LOW';
}

function isTrimContext(condition?: VehicleCondition): boolean {
  return condition === 'IDLE_WARM' || condition === 'CRUISE';
}

export function runLocalDiagnostic(input: DiagnosticInput): DiagnosticResult {
  const rawObservations = input.observations ?? [];
  const observations = rawObservations.filter((item) => !isSimulation(item));
  const rawDtcs = input.dtcs ?? [];
  const liveDtcs = rawDtcs.filter((item) =>
    String(item.source ?? '').trim().toUpperCase() === LIVE_OBD_SOURCE
    && ACTIVE_DTC_STATUSES.has(String(item.status ?? '').trim().toUpperCase()),
  );
  const blockedSimulationSamples = rawObservations.filter(isSimulation).length;
  const blockedStaleSamples = rawObservations.filter((item) => isLiveObd(item) && !isFreshReading(item)).length;
  const blockedNonLiveDtcs = rawDtcs.length - liveDtcs.length;
  const hypotheses = new Map<string, DiagnosticHypothesis>();

  const add = (rule: Rule, evidence: DiagnosticEvidence): void => {
    const current = hypotheses.get(rule.hypothesis);
    if (current) {
      current.score = Math.min(MAX_HYPOTHESIS_SCORE, current.score + ADDITIONAL_EVIDENCE_INCREMENT);
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

  const stft = pidValue(observations, '0106');
  const ltft = pidValue(observations, '0107');
  if (stft && ltft && isTrimContext(input.condition)) {
    const combinedTrim = stft.value! + ltft.value!;
    const lean = rules.find((item) => item.id === 'FUEL_TRIM_LEAN');
    const rich = rules.find((item) => item.id === 'FUEL_TRIM_RICH');
    if (lean && combinedTrim >= (lean.trigger.combinedTrimMin ?? Number.POSITIVE_INFINITY)) {
      add(lean, { ruleId: lean.id, text: 'STFT + LTFT = ' + combinedTrim.toFixed(2) + '% em contexto ' + input.condition + '.', source: 'PID', pid: '0106/0107', value: combinedTrim });
    } else if (rich && combinedTrim <= (rich.trigger.combinedTrimMax ?? Number.NEGATIVE_INFINITY)) {
      add(rich, { ruleId: rich.id, text: 'STFT + LTFT = ' + combinedTrim.toFixed(2) + '% em contexto ' + input.condition + '.', source: 'PID', pid: '0106/0107', value: combinedTrim });
    }
  }

  const map = pidValue(observations, '010B');
  const mapRule = rules.find((item) => item.id === 'MAP_HIGH_IDLE');
  if (map && mapRule && input.condition === mapRule.trigger.condition && map.value! >= (mapRule.trigger.mapMinKpa ?? Number.POSITIVE_INFINITY)) {
    add(mapRule, { ruleId: mapRule.id, text: 'MAP em marcha lenta aquecida = ' + map.value!.toFixed(2) + ' kPa.', source: 'PID', pid: '010B', value: map.value! });
  }

  return {
    engine: 'LOCAL_EVIDENCE_ENGINE',
    version: 1,
    generatedAt: new Date().toISOString(),
    hypotheses: [...hypotheses.values()].sort((a, b) => b.score - a.score),
    blockedSimulationSamples,
    blockedNonLiveDtcs,
    blockedStaleSamples,
    disclaimer: 'Hipóteses baseadas em evidências locais. Não condenar peça apenas por um DTC ou um PID isolado; status histórico/inativo e dados não-REAL_OBD não geram falha atual.',
  };
}
