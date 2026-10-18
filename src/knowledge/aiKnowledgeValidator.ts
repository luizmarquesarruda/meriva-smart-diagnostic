import { compileSchema } from 'json-schema-library';
import aiPolicySchema from './ai_policy.schema.json';
import aiPolicy from './ai_policy.json';
import responseCatalogSchema from './diagnostic_responses.schema.json';
import responseCatalog from './diagnostic_responses.json';
import diagnosticRules from './diagnostic_rules.json';
import sensorTestsCatalog from './sensor_tests.json';
import pidCatalog from './pids.json';

export interface JsonSchemaValidationResult {
  valid: boolean;
  errors: string[];
}

export interface AiKnowledgeValidationResult extends JsonSchemaValidationResult {
  checkedCatalogs: string[];
}

type ValidationIssue = {
  message?: string;
  code?: string;
  data?: { pointer?: string };
};

function issueMessage(label: string, issue: ValidationIssue): string {
  const pointer = typeof issue.data?.pointer === 'string' && issue.data.pointer
    ? ' em ' + issue.data.pointer
    : '';
  return label + pointer + ': ' + (issue.message || issue.code || 'documento inválido');
}

/** Valida um objeto contra um schema local sem rede nem geração dinâmica de código da aplicação. */
export function validateJsonSchemaDocument(
  schema: unknown,
  document: unknown,
  label = 'JSON',
): JsonSchemaValidationResult {
  try {
    const compiled = compileSchema(schema as Parameters<typeof compileSchema>[0]);
    const result = compiled.validate(document);
    const errors = result.valid
      ? []
      : (result.errors ?? []).map((issue) => issueMessage(label, issue as ValidationIssue));
    return {
      valid: result.valid,
      errors: result.valid ? [] : errors.length ? errors : [label + ': documento não satisfaz o schema'],
    };
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : String(cause);
    return { valid: false, errors: [label + ': falha ao compilar/aplicar o schema: ' + message] };
  }
}

let cachedResult: AiKnowledgeValidationResult | null = null;

/**
 * Confere os catálogos locais uma vez por ciclo JS. Se um schema ou documento
 * estiver inválido, o motor de hipóteses deve falhar fechado e não exibir "normal".
 */
export function validateAiKnowledgeCatalogs(): AiKnowledgeValidationResult {
  if (cachedResult) return { ...cachedResult, errors: [...cachedResult.errors], checkedCatalogs: [...cachedResult.checkedCatalogs] };

  const policyResult = validateJsonSchemaDocument(aiPolicySchema, aiPolicy, 'ai_policy.json');
  const responsesResult = validateJsonSchemaDocument(responseCatalogSchema, responseCatalog, 'diagnostic_responses.json');
  const errors = [...policyResult.errors, ...responsesResult.errors];
  const checkedCatalogs = ['ai_policy.json', 'diagnostic_responses.json'];

  const ruleItems = (diagnosticRules as unknown as { rules?: Array<{ id?: string; hypothesis?: string }> }).rules;
  const responseMap = (responseCatalog as unknown as { responses?: Record<string, unknown> }).responses;
  if (!Array.isArray(ruleItems)) {
    errors.push('diagnostic_rules.json: propriedade rules ausente ou inválida');
  } else {
    for (const rule of ruleItems) {
      if (typeof rule.hypothesis !== 'string' || !responseMap?.[rule.hypothesis]) {
        errors.push('diagnostic_responses.json: resposta ausente para a hipótese da regra ' + String(rule.id ?? 'sem ID'));
      }
    }
  }

  const ruleIds = new Set(Array.isArray(ruleItems) ? ruleItems.map((rule) => rule.id).filter((id): id is string => typeof id === 'string') : []);
  const sensorTests = (sensorTestsCatalog as unknown as { tests?: Array<{ id?: string; diagnosticRuleIds?: string[] }> }).tests;
  if (!Array.isArray(sensorTests)) {
    errors.push('sensor_tests.json: propriedade tests ausente ou inválida');
  } else {
    for (const test of sensorTests) {
      for (const ruleId of test.diagnosticRuleIds ?? []) {
        if (!ruleIds.has(ruleId)) errors.push('sensor_tests.json: teste ' + String(test.id ?? 'sem ID') + ' referencia regra inexistente ' + ruleId);
      }
    }
  }

  cachedResult = { valid: errors.length === 0, errors, checkedCatalogs };
  return { ...cachedResult, errors: [...cachedResult.errors], checkedCatalogs: [...cachedResult.checkedCatalogs] };
}
