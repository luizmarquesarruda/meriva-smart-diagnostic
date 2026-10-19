import * as FileSystem from 'expo-file-system';
import type { DiagnosticResult, DiagnosticHypothesis, DiagnosticEvidence } from './diagnosticEngine';
import type { VehicleCondition } from '../types/sourceTypes';

export interface DiagnosticFindingTimelinePoint {
  at: string;
  score: number;
  confidence: DiagnosticHypothesis['confidence'];
  sources: Array<DiagnosticEvidence['source']>;
  evidence: DiagnosticEvidence[];
}

export interface DiagnosticFindingHistoryEntry {
  id: string;
  hypothesisId: string;
  label: string;
  condition: VehicleCondition;
  firstSeenAt: string;
  lastSeenAt: string;
  lastCountedAt: string;
  observations: number;
  score: number;
  confidence: DiagnosticHypothesis['confidence'];
  sources: Array<DiagnosticEvidence['source']>;
  evidence: DiagnosticEvidence[];
  timeline: DiagnosticFindingTimelinePoint[];
  nextTests: string[];
}

interface DailyHistoryFile {
  version: 1;
  localDate: string;
  updatedAt: string;
  entries: DiagnosticFindingHistoryEntry[];
}

const HISTORY_DIR = 'DIAGNOSTIC_HISTORY';
const ACTIVE_EPISODE_WINDOW_MS = 5 * 60_000;
const MIN_OBSERVATION_INTERVAL_MS = 60_000;
const historyQueues = new Map<string, Promise<void>>();

function localDayKey(date: Date): string {
  return [
    String(date.getFullYear()).padStart(4, '0'),
    String(date.getMonth() + 1).padStart(2, '0'),
    String(date.getDate()).padStart(2, '0'),
  ].join('-');
}

function paths(basePath: string, date: string) {
  const directory = basePath + '/' + HISTORY_DIR;
  return {
    directory,
    json: directory + '/findings_' + date + '.json',
    txt: directory + '/findings_' + date + '.txt',
  };
}

function emptyHistory(date: string, now: Date): DailyHistoryFile {
  return { version: 1, localDate: date, updatedAt: now.toISOString(), entries: [] };
}

async function loadDailyHistory(file: string, date: string, now: Date): Promise<DailyHistoryFile> {
  try {
    const info = await FileSystem.getInfoAsync(file);
    if (!info.exists || info.isDirectory) return emptyHistory(date, now);
    const parsed = JSON.parse(await FileSystem.readAsStringAsync(file)) as Partial<DailyHistoryFile>;
    if (parsed.version !== 1 || !Array.isArray(parsed.entries)) return emptyHistory(date, now);
    return {
      version: 1,
      localDate: date,
      updatedAt: typeof parsed.updatedAt === 'string' ? parsed.updatedAt : now.toISOString(),
      entries: parsed.entries.filter((entry): entry is DiagnosticFindingHistoryEntry =>
        Boolean(entry && typeof entry.hypothesisId === 'string' && typeof entry.lastSeenAt === 'string'),
      ).map((entry) => ({
        ...entry,
        timeline: Array.isArray(entry.timeline) ? entry.timeline : [{
          at: entry.lastSeenAt,
          score: Number.isFinite(entry.score) ? entry.score : 0,
          confidence: entry.confidence ?? 'LOW',
          sources: Array.isArray(entry.sources) ? entry.sources : [],
          evidence: Array.isArray(entry.evidence) ? entry.evidence : [],
        }],
      })),
    };
  } catch {
    return emptyHistory(date, now);
  }
}

function renderDailyTxt(date: string, entries: DiagnosticFindingHistoryEntry[]): string {
  const lines = [
    'MERIVA SMART DIAGNOSTIC — HISTÓRICO DE EVIDÊNCIAS',
    'DATA DO ARQUIVO (LOCAL): ' + date,
    'As observações registram persistência de evidências, não uma contagem de falhas independentes.',
    '',
  ];
  for (const entry of entries) {
    const sources = entry.sources.length ? entry.sources.join(', ') : 'N/D';
    lines.push(
      'HIPÓTESE: ' + entry.label,
      'ID: ' + entry.hypothesisId,
      'CONTEXTO: ' + entry.condition,
      'PRIMEIRA OBSERVAÇÃO LOCAL: ' + new Date(entry.firstSeenAt).toLocaleString(),
      'PRIMEIRA OBSERVAÇÃO UTC: ' + entry.firstSeenAt,
      'ÚLTIMA OBSERVAÇÃO LOCAL: ' + new Date(entry.lastSeenAt).toLocaleString(),
      'ÚLTIMA OBSERVAÇÃO UTC: ' + entry.lastSeenAt,
      'OBSERVAÇÕES REGISTRADAS: ' + entry.observations,
      'CONFIANÇA: ' + entry.confidence + ' | SCORE: ' + entry.score.toFixed(2),
      'FONTES DE EVIDÊNCIA: ' + sources,
      ...entry.timeline.map((point) => 'TENDÊNCIA ' + point.at + ' | SCORE ' + point.score.toFixed(2) + ' | CONFIANÇA ' + point.confidence + ' | FONTES ' + point.sources.join(', ')),
      ...entry.evidence.map((item) => 'EVIDÊNCIA [' + item.source + ']: ' + item.text),
      ...entry.nextTests.map((item) => 'PRÓXIMO TESTE: ' + item),
      '',
      '---',
      '',
    );
  }
  if (!entries.length) lines.push('NENHUMA HIPÓTESE REGISTRADA NESTA DATA.');
  return lines.join('\n') + '\n';
}

function queueWrite<T>(key: string, operation: () => Promise<T>): Promise<T> {
  const previous = historyQueues.get(key) ?? Promise.resolve();
  const current = previous.catch(() => undefined).then(operation);
  historyQueues.set(key, current.then(() => undefined, () => undefined));
  return current;
}

function snapshotEvidence(items: DiagnosticEvidence[]): DiagnosticEvidence[] {
  return items.map((item) => ({ ...item }));
}

/**
 * Persists a daily, explainable history. Matching findings in the same
 * operating context are merged for five minutes; observations are counted at
 * most once per minute so a fast UI refresh cannot inflate repetition counts.
 */
export async function recordDiagnosticFindings(
  basePath: string,
  result: DiagnosticResult,
  condition: VehicleCondition,
  observedAt = new Date(),
): Promise<DiagnosticFindingHistoryEntry[]> {
  if (!result.hypotheses.length || !Number.isFinite(observedAt.getTime())) return [];
  const date = localDayKey(observedAt);
  const target = paths(basePath, date);

  return queueWrite(target.json, async () => {
    await FileSystem.makeDirectoryAsync(target.directory, { intermediates: true });
    const history = await loadDailyHistory(target.json, date, observedAt);

    for (const hypothesis of result.hypotheses) {
      const existing = history.entries
        .filter((entry) => entry.hypothesisId === hypothesis.id && entry.condition === condition)
        .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))[0];
      const existingLastSeen = existing ? Date.parse(existing.lastSeenAt) : Number.NaN;
      const ageSinceLastSeen = observedAt.getTime() - existingLastSeen;

      if (existing && Number.isFinite(existingLastSeen) && ageSinceLastSeen >= 0 && ageSinceLastSeen <= ACTIVE_EPISODE_WINDOW_MS) {
        existing.lastSeenAt = observedAt.toISOString();
        const countTrendPoint = observedAt.getTime() - Date.parse(existing.lastCountedAt) >= MIN_OBSERVATION_INTERVAL_MS;
        if (countTrendPoint) {
          existing.observations += 1;
          existing.lastCountedAt = observedAt.toISOString();
        }
        existing.score = hypothesis.score;
        existing.confidence = hypothesis.confidence;
        existing.sources = [...new Set(hypothesis.evidence.map((item) => item.source))];
        if (!Array.isArray(existing.timeline)) existing.timeline = [];
        if (countTrendPoint) {
          existing.timeline.push({
            at: observedAt.toISOString(),
            score: hypothesis.score,
            confidence: hypothesis.confidence,
            sources: [...new Set(hypothesis.evidence.map((item) => item.source))],
            evidence: snapshotEvidence(hypothesis.evidence),
          });
        }
        existing.evidence = snapshotEvidence(hypothesis.evidence);
        existing.nextTests = [...hypothesis.nextTests];
      } else {
        history.entries.push({
          id: 'finding_' + hypothesis.id + '_' + observedAt.getTime() + '_' + history.entries.length,
          hypothesisId: hypothesis.id,
          label: hypothesis.label,
          condition,
          firstSeenAt: observedAt.toISOString(),
          lastSeenAt: observedAt.toISOString(),
          lastCountedAt: observedAt.toISOString(),
          observations: 1,
          score: hypothesis.score,
          confidence: hypothesis.confidence,
          sources: [...new Set(hypothesis.evidence.map((item) => item.source))],
          evidence: snapshotEvidence(hypothesis.evidence),
          timeline: [{
            at: observedAt.toISOString(),
            score: hypothesis.score,
            confidence: hypothesis.confidence,
            sources: [...new Set(hypothesis.evidence.map((item) => item.source))],
            evidence: snapshotEvidence(hypothesis.evidence),
          }],
          nextTests: [...hypothesis.nextTests],
        });
      }
    }

    history.updatedAt = observedAt.toISOString();
    history.entries.sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt));
    await FileSystem.writeAsStringAsync(target.json, JSON.stringify(history, null, 2), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    await FileSystem.writeAsStringAsync(target.txt, renderDailyTxt(date, history.entries), {
      encoding: FileSystem.EncodingType.UTF8,
    });
    return history.entries.map((entry) => ({ ...entry, evidence: snapshotEvidence(entry.evidence), timeline: entry.timeline.map((point) => ({ ...point, sources: [...point.sources], evidence: snapshotEvidence(point.evidence) })), nextTests: [...entry.nextTests], sources: [...entry.sources] }));
  });
}

export async function readRecentDiagnosticFindings(
  basePath: string,
  limit = 20,
  now = new Date(),
): Promise<DiagnosticFindingHistoryEntry[]> {
  const entries: DiagnosticFindingHistoryEntry[] = [];
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(now.getTime());
    date.setDate(date.getDate() - offset);
    const target = paths(basePath, localDayKey(date));
    await (historyQueues.get(target.json) ?? Promise.resolve()).catch(() => undefined);
    const daily = await loadDailyHistory(target.json, localDayKey(date), now);
    entries.push(...daily.entries);
  }
  return entries
    .sort((a, b) => Date.parse(b.lastSeenAt) - Date.parse(a.lastSeenAt))
    .slice(0, Math.max(0, Math.floor(limit)))
    .map((entry) => ({ ...entry, evidence: snapshotEvidence(entry.evidence), timeline: entry.timeline.map((point) => ({ ...point, sources: [...point.sources], evidence: snapshotEvidence(point.evidence) })), nextTests: [...entry.nextTests], sources: [...entry.sources] }));
}

export const DIAGNOSTIC_HISTORY_ACTIVE_WINDOW_MS = ACTIVE_EPISODE_WINDOW_MS;
export const DIAGNOSTIC_HISTORY_MIN_INTERVAL_MS = MIN_OBSERVATION_INTERVAL_MS;
