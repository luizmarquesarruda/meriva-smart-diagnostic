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
  options?: { knownPids?: string[]; prevalidatedResults?: ElmCommandResult[] },
): Promise<IntelligentPidDiscoveryResult> {
  const observations: IntelligentPidObservation[] = [];
  const supportResponses: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  // A bitmap is an advertisement, not proof that a PID returned a valid payload.
  const bitmapAdvertised = new Set<string>();
  const supported = new Set<string>();

  // Fase 1: reutilizar a resposta 010C que já validou a ECU. Os demais PIDs,
  // inclusive velocidade, só são sondados individualmente depois de a bitmap
  // atual anunciar suporte. Isso reduz tráfego e respeita o conjunto da sessão.
  const priorityPids = ['010C'];
  const confirmedCandidates = options?.knownPids ?? [];

  const probePid = async (pid: string, prevalidated?: ElmCommandResult): Promise<void> => {
    let result: ElmCommandResult;
    try {
      result = prevalidated ?? await session.executeCommand(pid);
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

  const prevalidatedByPid = new Map(
    (options?.prevalidatedResults ?? []).map((item) => [
      item.command.replace(/\s/g, '').toUpperCase(),
      item,
    ]),
  );
  for (const pid of priorityPids) await probePid(pid, prevalidatedByPid.get(pid));

  // Fase 2: consulta as páginas bitmap em cadeia. A próxima página só existe
  // quando o bit de continuação da página anterior declara esse PID.
  // Isso evita até três round trips inúteis em ECUs K-Line antigas.
  const bitmapSupport = new Map<string, string[]>();
  for (let index = 0; index < DISCOVERY_PIDS.length; index += 1) {
    const supportPid = DISCOVERY_PIDS[index];
    if (index > 0 && !bitmapSupport.get(DISCOVERY_PIDS[index - 1])?.includes(supportPid)) {
      break;
    }

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
    bitmapSupport.set(supportPid, mapped);

    for (const pid of mapped) bitmapAdvertised.add(pid);

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

    if (index + 1 < DISCOVERY_PIDS.length && !mapped.includes(DISCOVERY_PIDS[index + 1])) {
      break;
    }
  }

  for (const pid of priorityPids) {
    const observation = observations.find((item) => item.pid === pid);
    if (observation && observation.value !== null) {
      // Bitmap anuncia capacidade, mas a resposta individual é a prova de que
      // o PID é funcional nesta sessão. Não deixar um PID sem resposta entrar
      // no polling simplesmente porque seu bit veio marcado.
      if (supported.has(pid)) {
        observation.status = 'CONFIRMADO';
        observation.confidence = 1;
        observation.reason = 'RESPOSTA RAW_ECU VÁLIDA NA FASE PRIORITÁRIA';
        confidence[pid] = 1;
      }
    } else {
      supported.delete(pid);
      confidence[pid] = 0;
    }
  }

  // Fase 3: conhecidos do projeto e PIDs apontados pelos bitmaps.
  // Só testar PIDs do catálogo que a bitmap anunciou, além de PIDs já conhecidos.
  // Antes, KNOWN_PIDS inteiro era consultado em toda conexão: até 30+ round trips
  // desnecessários, inclusive para PIDs que a própria ECU não anunciava.
  const knownCandidateSet = new Set(
    confirmedCandidates.map((pid) => pid.replace(/\s/g, '').toUpperCase()),
  );
  // Prior knowledge changes ordering only. A PID absent from the current ECU
  // bitmap is not probed in this session, even if it worked on an earlier ECU.
  const candidates = Array.from(bitmapAdvertised).filter((pid) =>
    /^01[0-9A-F]{2}$/.test(pid) &&
    KNOWN_PIDS.includes(pid) &&
    !priorityPids.includes(pid),
  ).sort((a, b) => Number(knownCandidateSet.has(b)) - Number(knownCandidateSet.has(a)));

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
    const confirmedByBitmap = bitmapAdvertised.has(pid);
    const pidConfidence = valid ? (confirmedByBitmap ? 1 : 0.85) : confirmedByBitmap ? 0.35 : 0;

    if (valid) supported.add(pid);
    else supported.delete(pid);
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
