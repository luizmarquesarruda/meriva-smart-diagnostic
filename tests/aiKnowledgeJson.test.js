'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');

function readJson(relativePath) {
  const file = path.join(ROOT, relativePath);
  assert.ok(fs.existsSync(file), relativePath + ' deve existir');
  const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
  assert.ok(parsed && typeof parsed === 'object', relativePath + ' deve conter objeto JSON');
  return parsed;
}

const policy = readJson('src/knowledge/ai_policy.json');
const policySchema = readJson('src/knowledge/ai_policy.schema.json');
const responseCatalog = readJson('src/knowledge/diagnostic_responses.json');
const responseSchema = readJson('src/knowledge/diagnostic_responses.schema.json');
const rules = readJson('src/knowledge/diagnostic_rules.json');
const confirmedPids = readJson('src/knowledge/meriva_confirmed_pids.json');

assert.strictEqual(policy.schemaVersion, 1);
assert.strictEqual(policy.policyId, 'MERIVA_LOCAL_DIAGNOSTIC_POLICY');
assert.strictEqual(policy.mode, 'DETERMINISTIC_RULE_ENGINE');
assert.strictEqual(policy.sources.liveObd, 'REAL_OBD');
assert.strictEqual(policy.sources.simulation, 'SIMULACAO');
assert.strictEqual(policy.sources.historicalBaseline, 'CARSCANNER_BASELINE');
assert.ok(policy.sources.neverPromoteToLive.includes('SIMULACAO'));
assert.ok(policy.sources.neverPromoteToLive.includes('CARSCANNER_BASELINE'));
assert.strictEqual(policy.observations.allowedLiveSource, 'REAL_OBD');
assert.strictEqual(policy.observations.rejectFutureTimestamps, true);
assert.strictEqual(policy.observations.requireFiniteValue, true);
assert.ok(Number.isInteger(policy.observations.maxAgeMs) && policy.observations.maxAgeMs >= 1000 && policy.observations.maxAgeMs <= 60000,
  'freshness não pode superar o teto conservador atual de 60 segundos');
const safeStatuses = ['CONFIRMED', 'PENDING', 'PERMANENT', 'CURRENT'];
assert.deepStrictEqual([...policy.dtcs.activeStatuses].sort(), [...safeStatuses].sort());
assert.ok(policy.dtcs.inactiveOrHistoricalStatuses.includes('HISTORICAL'));
assert.ok(policy.dtcs.inactiveOrHistoricalStatuses.includes('INACTIVE'));
assert.ok(policy.scoring.mediumAt < policy.scoring.highAt);
assert.ok(policy.scoring.highAt <= policy.scoring.maxScore);
assert.strictEqual(policy.scoring.isCalibratedProbability, false);
for (const prohibition of [
  'NAO_CONDENAR_COMPONENTE_POR_UM_DTC_ISOLADO',
  'NAO_PROMOVER_BASELINE_PARA_REAL_OBD',
  'NAO_USAR_SIMULACAO_COMO_EVIDENCIA_ATUAL',
  'NAO_ENVIAR_COMANDOS_DE_ESCRITA_OU_ATUACAO_A_ECU'
]) assert.ok(policy.prohibitions.includes(prohibition), 'proteção ausente: ' + prohibition);

assert.strictEqual(policySchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.strictEqual(policySchema.properties.observations.properties.maxAgeMs.maximum, 60000);
assert.strictEqual(responseSchema.$schema, 'https://json-schema.org/draft/2020-12/schema');
assert.strictEqual(responseCatalog.schemaVersion, 1);
assert.strictEqual(responseCatalog.language, 'pt-BR');
assert.ok(responseCatalog.defaults.cautionWithoutEvidence);
assert.ok(responseCatalog.confidenceLabels.LOW && responseCatalog.confidenceLabels.MEDIUM && responseCatalog.confidenceLabels.HIGH);
const responseIds = Object.keys(responseCatalog.responses);
assert.strictEqual(new Set(responseIds).size, responseIds.length, 'IDs duplicados no catálogo de respostas');
for (const rule of rules.rules) assert.ok(responseCatalog.responses[rule.hypothesis], 'regra sem resposta legível: ' + rule.hypothesis);
for (const [id, response] of Object.entries(responseCatalog.responses)) {
  assert.ok(response.title && response.title.trim(), 'resposta sem título: ' + id);
  assert.ok(response.summary && response.summary.trim(), 'resposta sem resumo: ' + id);
}
assert.ok(confirmedPids.confirmed_pids.every((pid) => pid.evidence === 'RAW_ECU' && pid.status === 'CONFIRMADO'),
  'somente resposta RAW_ECU pode declarar PID confirmado');

const engine = fs.readFileSync(path.join(ROOT, 'src/diagnostics/diagnosticEngine.ts'), 'utf8');
const composer = fs.readFileSync(path.join(ROOT, 'src/diagnostics/diagnosticResponse.ts'), 'utf8');
assert.match(engine, /ai_policy\.json/, 'motor precisa consumir a política JSON');
assert.match(composer, /diagnostic_responses\.json/, 'compositor precisa consumir textos JSON');
assert.match(composer, /catalog\.responses\[hypothesis\.id\]/);
assert.match(engine, /validateAiKnowledgeCatalogs/);
assert.match(engine, /knowledgeValidationErrors/, 'motor deve bloquear hipóteses quando os catálogos falharem');

const validatorPath = path.resolve(ROOT, 'src/knowledge/aiKnowledgeValidator.ts');
const validatorSource = fs.readFileSync(validatorPath, 'utf8');
const validatorJs = ts.transpileModule(validatorSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
    resolveJsonModule: true,
  },
}).outputText;
const validatorModule = { exports: {}, filename: validatorPath, paths: require('module')._nodeModulePaths(path.dirname(validatorPath)) };
const localRequire = (request) => request.endsWith('.json')
  ? require(path.resolve(path.dirname(validatorPath), request))
  : require(require.resolve(request, { paths: [path.dirname(validatorPath)] }));
new Function('exports', 'require', 'module', '__filename', '__dirname', validatorJs)(
  validatorModule.exports, localRequire, validatorModule, validatorPath, path.dirname(validatorPath)
);
const validatorApi = validatorModule.exports;
const liveValidation = validatorApi.validateAiKnowledgeCatalogs();
assert.strictEqual(liveValidation.valid, true, liveValidation.errors.join(' | '));
assert.ok(liveValidation.checkedCatalogs.includes('ai_policy.json'));
assert.ok(liveValidation.checkedCatalogs.includes('diagnostic_responses.json'));
assert.ok(liveValidation.checkedCatalogs.includes('pids.json'));
assert.ok(liveValidation.checkedCatalogs.includes('sensor_tests.json'));
assert.ok(liveValidation.checkedCatalogs.includes('pid_learning_policy.json'));

const invalidPolicy = {
  ...policy,
  observations: { ...policy.observations, maxAgeMs: 60001 },
};
const invalidResult = validatorApi.validateJsonSchemaDocument(policySchema, invalidPolicy, 'fixture inválido');
assert.strictEqual(invalidResult.valid, false, 'biblioteca deve rejeitar idade de leitura acima do teto do schema');
assert.match(invalidResult.errors.join(' '), /maxAgeMs/i);
console.log('AI JSON Schema library runtime validation: OK');
