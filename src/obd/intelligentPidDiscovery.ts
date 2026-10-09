import type { Elm327Session, ElmCommandResult } from './elm327';
import { parsePidResponse, validateOBDResponse } from './parser';
import { DISCOVERY_PIDS, KNOWN_PIDS, decodeSupportedPids } from './pidScanner';
import { getPidDefinition, getPidReference, getPidReferenceIds } from './pidDefinition';
import { readPidConfirmations, type PidConfirmationEntry } from '../database/pidBank';

export type IntelligentPidStatus =
  | 'CONFIRMADO'
  | 'RESPONDEU'
  | 'NAO_RESPONDEU'
  | 'INVALIDO'
  | 'SEM_DEFINICAO';

export interface IntelligentPidObservation {
  pid: string;
  status: IntelligentPidStatus;
  response: string;
  elapsedMs: number;
  value: number | null;
  unit: string;
  confidence: number;
  reason: string;
  knowledgeSource: 'CATALOGO_PADRAO' | 'REFERENCIA_PADRAO' | 'BANCO_LOCAL' | 'BITMAP_ECU' | 'SEM_DEFINICAO';
  definitionName: string | null;
  formulaId: string | null;
}

export interface IntelligentPidDiscoveryResult {
  supportedPids: string[];
  observations: IntelligentPidObservation[];
  supportResponses: Record<string, string>;
  confidence: Record<string, number>;
}

/**
 * Descoberta local agressiva, porém limitada a PIDs Mode 01 documentados.
 * Primeiro consulta PIDs prioritários e bitmaps; depois testa o catálogo ativo,
 * os PIDs encontrados anteriormente e referências padrão, inclusive os que a
 * ECU pode responder apesar de um bitmap incompleto. Nenhuma fórmula é inferida.
 */
export async function discoverIntelligentPids(
  session: Elm327Session,
  options?: { knownPids?: string[]; basePath?: string },
): Promise<IntelligentPidDiscoveryResult> {
  const observations: IntelligentPidObservation[] = [];
  const storedKnowledge: PidConfirmationEntry[] = options?.basePath
    ? await readPidConfirmations(options.basePath).catch(() => [])
    : [];
  const storedByPid = new Map(storedKnowledge.map((entry) => [entry.pid.toUpperCase(), entry]));
  // Achou e salvou um PID real? Ele sai da fila de sondagem nas próximas varreduras.
  const alreadyFound = new Set(storedKnowledge
    .filter((entry) => entry.source === 'REAL_OBD' &&
      (entry.status === 'CONFIRMADO' || entry.status === 'RESPONDEU' || entry.status === 'DESCOBERTO'))
    .map((entry) => entry.pid.replace(/\s/g, '').toUpperCase())
    .filter((pid) => /^01[0-9A-F]{2}$/.test(pid)));
  const knownFromBank = Array.from(alreadyFound);

  const getKnowledge = (pid: string, bitmapOnly = false) => {
    const normalized = pid.toUpperCase();
    const definition = getPidDefinition(normalized);
    const reference = getPidReference(normalized);
    const stored = storedByPid.get(normalized);
    return {
      knowledgeSource: definition ? 'CATALOGO_PADRAO' as const
        : reference ? 'REFERENCIA_PADRAO' as const
        : stored ? 'BANCO_LOCAL' as const
        : bitmapOnly ? 'BITMAP_ECU' as const
        : 'SEM_DEFINICAO' as const,
      definitionName: definition?.name ?? reference?.name ?? stored?.name ?? null,
      formulaId: definition?.formulaId ?? stored?.formulaId ?? null,
    };
  };
  const supportResponses: Record<string, string> = {};
  const confidence: Record<string, number> = {};
  const supported = new Set<string>();
  const bitmapSupported = new Set<string>();

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
      ...getKnowledge(pid),
    });
  };

  for (const pid of priorityPids) {
    if (alreadyFound.has(pid)) continue;
    await probePid(pid);
  }

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

    for (const pid of mapped) {
      supported.add(pid);
      bitmapSupported.add(pid);
    }

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
      ...getKnowledge(supportPid, true),
    });
  }

  for (const pid of priorityPids) {
    const observation = observations.find((item) => item.pid === pid);
    if (observation && observation.value !== null && bitmapSupported.has(pid)) {
      observation.status = 'CONFIRMADO';
      observation.confidence = 1;
      observation.reason = 'RESPOSTA RAW_ECU VÁLIDA NA FASE PRIORITÁRIA';
      confidence[pid] = 1;
    }
  }

  // Fase 3: conhecidos do projeto e PIDs apontados pelos bitmaps.
  const candidates = Array.from(new Set([
    ...confirmedCandidates,
    ...knownFromBank,
    ...KNOWN_PIDS,
    ...getPidReferenceIds(),
    ...Array.from(supported),
  ])).map((pid) => pid.replace(/\s/g, '').toUpperCase()).filter((pid) =>
    /^01[0-9A-F]{2}$/.test(pid) &&
    !priorityPids.includes(pid) &&
    !alreadyFound.has(pid),
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
    const rawResponseValid = result.status === 'OK' && validateOBDResponse(result.response);
    const knowledge = getKnowledge(pid, confirmedByBitmap);
    const hasDefinition = Boolean(getPidDefinition(pid));
    const missingDefinition = rawResponseValid && !hasDefinition;
    const pidConfidence = valid ? (confirmedByBitmap ? 1 : 0.85) : confirmedByBitmap ? 0.35 : 0;

    if (valid) supported.add(pid);
    confidence[pid] = pidConfidence;
    observations.push({
      pid,
      status: missingDefinition ? 'SEM_DEFINICAO'
        : valid ? (confirmedByBitmap ? 'CONFIRMADO' : 'RESPONDEU')
        : confirmedByBitmap ? 'INVALIDO' : 'NAO_RESPONDEU',
      response: result.response,
      elapsedMs: result.elapsedMs,
      value: parsed?.value ?? null,
      unit: parsed?.unit ?? '',
      confidence: pidConfidence,
      reason: missingDefinition
        ? 'RESPOSTA RAW VÁLIDA, MAS NÃO HÁ FÓRMULA LOCAL VALIDADA; MANTER SEM INTERPRETAÇÃO'
        : valid ? confirmedByBitmap ? 'BITMAP + RESPOSTA VÁLIDA' : 'RESPOSTA VÁLIDA'
        : confirmedByBitmap ? 'BITMAP INDICA SUPORTE, MAS RESPOSTA NÃO FOI VALIDADA' : 'SEM RESPOSTA VÁLIDA',
      ...knowledge,
    });
  }

  return {
    supportedPids: Array.from(supported).sort(),
    observations,
    supportResponses,
    confidence,
  };
}
