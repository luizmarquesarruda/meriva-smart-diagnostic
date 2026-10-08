import type { DtcRecord, PidObservation, VehicleCondition } from '../types/sourceTypes';
import ruleCatalog from '../knowledge/diagnostic_rules.json';

export interface DiagnosticInput { observations: PidObservation[]; dtcs?: DtcRecord[]; condition?: VehicleCondition; }
export interface DiagnosticEvidence { ruleId: string; text: string; source: 'DTC' | 'PID'; pid?: string; dtc?: string; value?: number; }
export interface DiagnosticHypothesis { id: string; label: string; score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; evidence: DiagnosticEvidence[]; nextTests: string[]; }
export interface DiagnosticResult { engine: 'LOCAL_EVIDENCE_ENGINE'; version: 1; generatedAt: string; hypotheses: DiagnosticHypothesis[]; blockedSimulationSamples: number; blockedNonLiveDtcs: number; disclaimer: string; }

interface Rule { id: string; trigger: { dtc?: string; combinedTrimMin?: number; combinedTrimMax?: number; condition?: VehicleCondition; mapMinKpa?: number; }; hypothesis: string; baseScore: number; tests: string[]; }

const rules = ruleCatalog.rules as Rule[];
const ACTIVE_DTC_STATUSES = new Set(['CONFIRMED', 'PENDING', 'PERMANENT', 'CURRENT']);

function isSimulation(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === 'SIMULACAO'; }
function isLiveObd(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === 'REAL_OBD'; }

function pidValue(observations: PidObservation[], pid: string): PidObservation | undefined {
  return observations
    .filter((item) => item.pid.toUpperCase() === pid.toUpperCase() && item.value !== null && isLiveObd(item))
    .sort((a, b) => Date.parse(b.timestamp) - Date.parse(a.timestamp))[0];
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
  const rawObservations = input.observations ?? [];
  const observations = rawObservations.filter((item) => !isSimulation(item));
  const rawDtcs = input.dtcs ?? [];
  const liveDtcs = rawDtcs.filter((item) =>
    String(item.source ?? '').trim().toUpperCase() === 'REAL_OBD'
    && ACTIVE_DTC_STATUSES.has(String(item.status ?? '').trim().toUpperCase()),
  );
  const blockedSimulationSamples = rawObservations.filter(isSimulation).length;
  const blockedNonLiveDtcs = rawDtcs.length - liveDtcs.length;
  const hypotheses = new Map<string, DiagnosticHypothesis>();

  const add = (rule: Rule, evidence: DiagnosticEvidence): void => {
    const current = hypotheses.get(rule.hypothesis);
    if (current) {
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
      nextTests: [...rule.tests],
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
    disclaimer: 'Hipóteses baseadas em evidências locais. Não condenar peça apenas por um DTC ou um PID isolado; status histórico/inativo e dados não-REAL_OBD não geram falha atual.',
  };
}
