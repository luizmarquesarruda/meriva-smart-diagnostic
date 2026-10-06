import type { Elm327Session, ElmCommandResult } from './elm327';
import { parsePidResponse, validateOBDResponse } from './parser';
import { DISCOVERY_PIDS, KNOWN_PIDS, decodeSupportedPids } from './pidScanner';

export type IntelligentPidStatus =
  | 'CONFIRMADO'
  | 'RESPONDEU'
  | 'NAO_RESPONDEU'
  | 'INVALIDO';

export interface IntelligentPidObservation {
  pid: string;
  status: IntelligentPidStatus;
  response: string;
  elapsedMs: number;
  value: number | null;
  unit: string;
  confidence: number;
  reason: string;
}

export interface IntelligentPidDiscoveryResult {
  supportedPids: string[];
  observations: IntelligentPidObservation[];
  supportResponses: Record<string, string>;
  confidence: Record<string, number>;
}

/**
 * "IA burrinha": descoberta determinística e adaptativa.
 *
 * Ela não inventa PID. Primeiro lê os mapas OBD-II de suporte e depois
 * confirma somente candidatos de uma lista segura/conhecida. Cada resposta
 * bruta é preservada para permitir auditoria e aprendizado posterior.
 */
export async function discoverIntelligentPids(
  session: Elm327Session,
  options?: { knownPids?: string[] },
): Promise<IntelligentPidDiscoveryResult> {
  const observations: IntelligentPidObservation[] = [];
  const supportResponses: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const supported = new Set<string>();

  // Fase 1: PIDs essenciais. Isso evita gastar quatro consultas de bitmap
  // antes de saber se o adaptador/ECU responde aos dados que realmente usamos.
  const priorityPids = ['010C', '010D', '012F', '015E'];
  const confirmedCandidates = options?.knownPids ?? [];

  const probePid = async (pid: string): Promise<void> => {
    let result: ElmCommandResult;
    try {
      result = await session.executeCommand(pid);
    } catch {
      return;
    }

    const parsed = result.status === 'OK' ? parsePidResponse(pid, result.response) : null;
    const valid = Boolean(
      result.status === 'OK' &&
      validateOBDResponse(result.response) &&
      parsed &&
      parsed.status !== 'VALOR NÃO INTERPRETADO' &&
      parsed.value !== null &&
      Number.isFinite(parsed.value),
    );

    confidence[pid] = valid ? 0.85 : 0;
    if (valid) supported.add(pid);

    observations.push({
      pid,
      status: valid ? 'RESPONDEU' : 'NAO_RESPONDEU',
      response: result.response,
      elapsedMs: result.elapsedMs,
      value: parsed?.value ?? null,
      unit: parsed?.unit ?? '',
      confidence: confidence[pid],
      reason: valid ? 'RESPOSTA VÁLIDA NA FASE PRIORITÁRIA' : 'SEM RESPOSTA VÁLIDA NA FASE PRIORITÁRIA',
    });
  };

  for (const pid of priorityPids) await probePid(pid);

  // Fase 2: mapas de suporte OBD-II. Só chegamos aqui depois dos PIDs essenciais.
  for (const supportPid of DISCOVERY_PIDS) {
    let result: ElmCommandResult;
    try {
      result = await session.executeCommand(supportPid);
    } catch {
      break;
    }

    supportResponses[supportPid] = result.response;
    const mapped = result.status === 'OK'
      ? decodeSupportedPids(supportPid, result.response)
      : [];

    for (const pid of mapped) supported.add(pid);

    observations.push({
      pid: supportPid,
      status: mapped.length > 0 ? 'RESPONDEU' : 'NAO_RESPONDEU',
      response: result.response,
      elapsedMs: result.elapsedMs,
      value: null,
      unit: 'BITMAP',
      confidence: mapped.length > 0 ? 0.9 : 0.5,
      reason: mapped.length > 0
        ? 'MAPA DE PIDs ACEITO PELA ECU'
        : 'MAPA SEM PIDs CONFIRMADOS',
    });
  }

  // Fase 3: conhecidos do projeto e PIDs apontados pelos bitmaps.
  const candidates = Array.from(new Set([
    ...confirmedCandidates,
    ...KNOWN_PIDS,
    ...Array.from(supported),
  ])).filter((pid) =>
    /^01[0-9A-F]{2}$/i.test(pid) && !priorityPids.includes(pid.toUpperCase()),
  );

  for (const pid of candidates) {
    let result: ElmCommandResult;
    try {
      result = await session.executeCommand(pid);
    } catch {
      continue;
    }

    const parsed = result.status === 'OK' ? parsePidResponse(pid, result.response) : null;
    const valid = Boolean(
      result.status === 'OK' &&
      validateOBDResponse(result.response) &&
      parsed &&
      parsed.status !== 'VALOR NÃO INTERPRETADO' &&
      parsed.value !== null &&
      Number.isFinite(parsed.value),
    );
    const confirmedByBitmap = supported.has(pid);
    const pidConfidence = valid ? (confirmedByBitmap ? 1 : 0.85) : confirmedByBitmap ? 0.35 : 0;

    if (valid) supported.add(pid);
    confidence[pid] = pidConfidence;
    observations.push({
      pid,
      status: valid ? (confirmedByBitmap ? 'CONFIRMADO' : 'RESPONDEU') : confirmedByBitmap ? 'INVALIDO' : 'NAO_RESPONDEU',
      response: result.response,
      elapsedMs: result.elapsedMs,
      value: parsed?.value ?? null,
      unit: parsed?.unit ?? '',
      confidence: pidConfidence,
      reason: valid
        ? confirmedByBitmap ? 'BITMAP + RESPOSTA VÁLIDA' : 'RESPOSTA VÁLIDA'
        : confirmedByBitmap ? 'BITMAP INDICA SUPORTE, MAS RESPOSTA NÃO FOI VALIDADA' : 'SEM RESPOSTA VÁLIDA',
    });
  }

  return {
    supportedPids: Array.from(supported).sort(),
    observations,
    supportResponses,
    confidence,
  };
}
