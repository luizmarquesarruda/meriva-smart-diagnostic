import type { DataSource, DtcRecord, PidObservation, VehicleCondition } from '../types/sourceTypes';
import ruleCatalog from '../knowledge/diagnostic_rules.json';
import sensorTestCatalogJson from '../knowledge/sensor_tests.json';
import diagnosticPolicy from '../knowledge/diagnostic_policy.json';

export interface DiagnosticInput { observations: PidObservation[]; dtcs?: DtcRecord[]; condition?: VehicleCondition; ecuConnected?: boolean; }
export interface DiagnosticEvidence { ruleId: string; text: string; source: 'DTC' | 'PID'; pid?: string; dtc?: string; value?: number; }
export interface DiagnosticAction { id: string; priority: 'HIGH' | 'MEDIUM' | 'INFO'; title: string; detail: string; }
export interface DiagnosticHypothesis { id: string; label: string; score: number; confidence: 'LOW' | 'MEDIUM' | 'HIGH'; evidence: DiagnosticEvidence[]; nextTests: string[]; }
export interface DiagnosticResult { engine: 'LOCAL_EVIDENCE_ENGINE'; version: 1; generatedAt: string; hypotheses: DiagnosticHypothesis[]; blockedSimulationSamples: number; blockedNonLiveSamples: number; blockedNonLiveDtcs: number; blockedStaleObservations: number; blockedStaleDtcs: number; disconnectedEvidenceIgnored: boolean; recommendedActions: DiagnosticAction[]; disclaimer: string; }

interface Rule { id: string; trigger: { dtc?: string; combinedTrimMin?: number; combinedTrimMax?: number; condition?: VehicleCondition; mapMinKpa?: number; }; hypothesis: string; baseScore: number; tests: string[]; }

const rules = ruleCatalog.rules as Rule[];
interface SensorTestLink { pid: string; label: string; aiGuidance: string; diagnosticRuleIds: string[]; }
const sensorTestLinks = (sensorTestCatalogJson as unknown as { tests: SensorTestLink[] }).tests;
function linkedSensorRecommendations(ruleId: string): string[] {
 return sensorTestLinks.filter((test)=>test.diagnosticRuleIds.includes(ruleId)).slice(0,3)
  .map((test)=>test.label+' (PID '+test.pid+'): '+test.aiGuidance);
}
const ACTIVE_DTC_STATUSES = new Set<string>(diagnosticPolicy.activeDtcStatuses);

/**
 * A persistência usa REAL/SIMULACAO; o motor aceita REAL_OBD somente quando
 * a consulta foi uma resposta válida. Fontes desconhecidas nunca são promovidas.
 */
export function normalizeDiagnosticSource(source: unknown, status?: unknown): DataSource {
  const normalized = String(source ?? '').trim().toUpperCase();
  const responseStatus = String(status ?? '').trim().toUpperCase();

  if (normalized === 'SIMULACAO') return 'SIMULACAO';
  if (normalized === 'REAL' || normalized === 'REAL_OBD') {
    return responseStatus === 'RESPONDEU' ? 'REAL_OBD' : 'IMPORTADO';
  }
  if (normalized === 'CARSCANNER_BASELINE') return 'CARSCANNER_BASELINE';
  if (normalized === 'USER_REAL_OBSERVATION') return 'USER_REAL_OBSERVATION';
  if (normalized === 'IMPORTADO') return 'IMPORTADO';
  return 'IMPORTADO';
}

function isSimulation(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === 'SIMULACAO'; }
function isLiveObd(item: PidObservation): boolean { return String(item.source ?? '').trim().toUpperCase() === 'REAL_OBD'; }

/** Evidence older than two minutes is not presented as a current diagnosis. */
export const MAX_DIAGNOSTIC_EVIDENCE_AGE_MS = diagnosticPolicy.freshness.maxEvidenceAgeMs;
const MAX_FUTURE_DIAGNOSTIC_CLOCK_SKEW_MS = diagnosticPolicy.freshness.maxFutureClockSkewMs;
export function isFreshDiagnosticTimestamp(timestamp: string, nowMs = Date.now()): boolean {
  const timestampMs = Date.parse(timestamp);
  return Number.isFinite(timestampMs)
    && timestampMs <= nowMs + MAX_FUTURE_DIAGNOSTIC_CLOCK_SKEW_MS
    && nowMs - timestampMs <= MAX_DIAGNOSTIC_EVIDENCE_AGE_MS;
}

/** Indexa a leitura REAL mais recente de cada PID em uma única passagem. */
function indexLatestPidObservations(observations: PidObservation[]): Map<string, PidObservation> {
  const latest = new Map<string, PidObservation>();
  for (const item of observations) {
    if (item.value === null || !Number.isFinite(item.value) || !isLiveObd(item)) continue;
    const pid = item.pid.trim().toUpperCase();
    const previous = latest.get(pid);
    if (!previous || Date.parse(item.timestamp) > Date.parse(previous.timestamp)) latest.set(pid, item);
  }
  return latest;
}

function pidValue(index: Map<string, PidObservation>, pid: string): PidObservation | undefined {
  return index.get(pid.toUpperCase());
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
  const nowMs = Date.now();
  const rawObservations = input.observations ?? [];
  const realSourceObservations = rawObservations.filter(isLiveObd);
  const blockedStaleObservations = realSourceObservations.filter((item) =>
    !isFreshDiagnosticTimestamp(item.timestamp, nowMs),
  ).length;
  const observations = input.ecuConnected === false ? [] : realSourceObservations.filter((item) =>
    item.value !== null
    && Number.isFinite(item.value)
    && isFreshDiagnosticTimestamp(item.timestamp, nowMs),
  );
  const latestPidById = indexLatestPidObservations(observations);
  const rawDtcs = input.dtcs ?? [];
  const activeSourceDtcs = rawDtcs.filter((item) =>
    String(item.source ?? '').trim().toUpperCase() === 'REAL_OBD'
    && ACTIVE_DTC_STATUSES.has(String(item.status ?? '').trim().toUpperCase()),
  );
  const blockedStaleDtcs = activeSourceDtcs.filter((item) =>
    !isFreshDiagnosticTimestamp(item.lastSeen, nowMs),
  ).length;
  const liveDtcs = input.ecuConnected === false ? [] : activeSourceDtcs.filter((item) =>
    isFreshDiagnosticTimestamp(item.lastSeen, nowMs),
  );
  const liveDtcsByCode = new Map<string, DtcRecord>();
  for (const dtc of liveDtcs) {
    const code = dtc.code.toUpperCase();
    const previous = liveDtcsByCode.get(code);
    if (!previous || Date.parse(dtc.lastSeen) > Date.parse(previous.lastSeen)) liveDtcsByCode.set(code, dtc);
  }
  const blockedSimulationSamples = rawObservations.filter(isSimulation).length;
  const blockedNonLiveSamples = rawObservations.filter((item) => !isSimulation(item) && !isLiveObd(item)).length;
  const blockedNonLiveDtcs = rawDtcs.length - activeSourceDtcs.length;
  const disconnectedEvidenceIgnored = input.ecuConnected === false
    && (realSourceObservations.length > 0 || activeSourceDtcs.length > 0);
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
      nextTests: [...new Set([...rule.tests, ...linkedSensorRecommendations(rule.id)])],
    });
  };

  for (const rule of rules) {
    if (!rule.trigger.dtc) continue;
    const dtc = liveDtcsByCode.get(rule.trigger.dtc);
    if (!dtc) continue;
    add(rule, {
      ruleId: rule.id,
      text: 'DTC ' + dtc.code + ' presente com status ' + dtc.status + '; última leitura válida em ' + dtc.lastSeen + '; fonte REAL_OBD.',
      source: 'DTC',
      dtc: dtc.code,
    });
  }

  const stft = pidValue(latestPidById, '0106');
  const ltft = pidValue(latestPidById, '0107');
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

  const map = pidValue(latestPidById, '010B');
  const mapRule = rules.find((item) => item.id === 'MAP_HIGH_IDLE');
  if (map && mapRule && input.condition === mapRule.trigger.condition && map.value! >= (mapRule.trigger.mapMinKpa ?? Number.POSITIVE_INFINITY)) {
    add(mapRule, { ruleId: mapRule.id, text: 'MAP em marcha lenta aquecida = ' + map.value!.toFixed(2) + ' kPa.', source: 'PID', pid: '010B', value: map.value! });
  }

  const hypothesisResults = [...hypotheses.values()].sort((a, b) => b.score - a.score);
  const recommendedActions: DiagnosticAction[] = [];

  if (input.ecuConnected === false) {
    recommendedActions.push({
      id: 'RESTORE_ECU_LINK',
      priority: 'HIGH',
      title: 'Restabelecer comunicação com a ECU',
      detail: 'Sem resposta atual, dados guardados são histórico e não confirmam o estado presente do motor.',
    });
  } else {
    if (blockedStaleObservations > 0 || (input.ecuConnected === true && latestPidById.size === 0)) {
      recommendedActions.push({
        id: 'REFRESH_CONFIRMED_PIDS',
        priority: 'HIGH',
        title: 'Atualizar PIDs confirmados',
        detail: blockedStaleObservations > 0
          ? blockedStaleObservations + ' leitura(s) passaram de 120 s; repetir somente consultas anunciadas e funcionais na ECU.'
          : 'Ainda não há leitura atual válida; coletar respostas reais para PIDs confirmados antes de inferir falhas.',
      });
    }
    if (input.ecuConnected === true && (liveDtcs.length === 0 || blockedStaleDtcs > 0)) {
      recommendedActions.push({
        id: 'READ_SESSION_DTCS',
        priority: 'MEDIUM',
        title: 'Reler os DTCs da sessão',
        detail: 'Consultar modos 03 e 07 e o modo 0A quando suportado; só classificar o código como atual depois de resposta válida da ECU.',
      });
    }
    if (input.ecuConnected === true && hypothesisResults.length === 0 && latestPidById.size > 0) {
      recommendedActions.push({
        id: 'COLLECT_CONTEXTUAL_EVIDENCE',
        priority: 'INFO',
        title: 'Coletar evidência complementar',
        detail: 'Nenhuma regra atual disparou. Isso não comprova normalidade; registrar leituras adicionais válidas nas condições em que o sintoma ocorre.',
      });
    }
  }

  return {
    engine: 'LOCAL_EVIDENCE_ENGINE',
    version: 1,
    generatedAt: new Date().toISOString(),
    hypotheses: hypothesisResults,
    recommendedActions,
    blockedSimulationSamples,
    blockedNonLiveSamples,
    blockedNonLiveDtcs,
    blockedStaleObservations,
    blockedStaleDtcs,
    disconnectedEvidenceIgnored,
    disclaimer: 'Hipóteses baseadas em evidências locais recentes. Amostras com mais de 120 s, valores não finitos, DTCs sem atualização recente e dados não-REAL_OBD não geram falha atual. Sem resposta da ECU, o motor de hipóteses não usa evidência OBD armazenada como estado atual.',
  };
}
