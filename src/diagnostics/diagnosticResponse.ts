import type { DiagnosticHypothesis } from './diagnosticEngine';
import * as responseCatalogJson from '../knowledge/diagnostic_responses.json';

export interface DiagnosticResponse {
  title: string;
  summary: string;
  confidenceLabel: string;
  nextAction: string;
  caution: string;
}

interface ResponseCopy { title: string; summary: string; }
interface ResponseCatalog {
  confidenceLabels: Record<DiagnosticHypothesis['confidence'], string>;
  defaults: {
    summary: string;
    nextAction: string;
    cautionWithEvidencePrefix: string;
    cautionWithEvidenceSuffix: string;
    cautionWithoutEvidence: string;
  };
  responses: Record<string, ResponseCopy>;
}

const catalog = responseCatalogJson as unknown as ResponseCatalog;

export function composeDiagnosticResponse(hypothesis: DiagnosticHypothesis): DiagnosticResponse {
  const copy = catalog.responses[hypothesis.id];
  const firstEvidence = hypothesis.evidence[0]?.text;
  const firstAction = hypothesis.nextTests[0];
  return {
    title: copy?.title ?? hypothesis.label,
    summary: copy?.summary ?? catalog.defaults.summary,
    confidenceLabel: catalog.confidenceLabels[hypothesis.confidence] ?? catalog.confidenceLabels.LOW,
    nextAction: firstAction ?? catalog.defaults.nextAction,
    caution: firstEvidence
      ? catalog.defaults.cautionWithEvidencePrefix + firstEvidence + catalog.defaults.cautionWithEvidenceSuffix
      : catalog.defaults.cautionWithoutEvidence,
  };
}
