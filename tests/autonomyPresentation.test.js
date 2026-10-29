'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

function loadTs(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const mod = new Module(file, null);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === file && Object.prototype.hasOwnProperty.call(overrides, request)) {
      return overrides[request];
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    mod._compile(output, file);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const root = path.resolve(__dirname, '..');
const fuelLevel = loadTs(path.join(root, 'src/trip/fuelLevel.ts'));
const presentation = loadTs(path.join(root, 'src/trip/autonomyPresentation.ts'), { './fuelLevel': fuelLevel });
const { getCurrentAutonomyRangeKm, getCurrentAutonomyPresentation } = presentation;
const buffer = new fuelLevel.FuelLevelBuffer();
const bufferNow = Date.now();
const bufferBase = bufferNow - 20_000;
for (let i = 0; i < 10; i += 1) {
  assert.strictEqual(buffer.record(40 + i, bufferBase + i * 1000, bufferNow), true);
}
let bufferSnapshot = buffer.getSnapshot(bufferNow);
assert.strictEqual(bufferSnapshot.sampleCount, 10, 'buffer só fica semeado com dez leituras reais válidas');
assert.strictEqual(bufferSnapshot.medianPercent, 44.5);
assert.strictEqual(buffer.record(55, bufferBase + 8000, bufferNow), false,
  'leitura fora de ordem não pode entrar no buffer');
assert.strictEqual(buffer.record(101, bufferNow, bufferNow), false,
  'percentual acima de 100 deve ser rejeitado');
assert.strictEqual(buffer.record(50, bufferNow + 1000, bufferNow), false,
  'timestamp futuro deve ser rejeitado');
assert.strictEqual(buffer.record(55, bufferNow, bufferNow), true);
bufferSnapshot = buffer.getSnapshot(bufferNow);
assert.strictEqual(bufferSnapshot.sampleCount, 10, 'o buffer é rolling e permanece limitado a dez amostras');
assert.strictEqual(bufferSnapshot.medianPercent, 45.5, 'a mediana usa apenas as dez leituras mais recentes');

const outlierNow = bufferNow + 20_000;
const outlierBuffer = new fuelLevel.FuelLevelBuffer();
for (let i = 0; i < 10; i += 1) {
  assert.strictEqual(outlierBuffer.record(i === 9 ? 90 : 40, outlierNow - 9_000 + i * 1_000, outlierNow), true);
}
assert.strictEqual(outlierBuffer.getSnapshot(outlierNow).medianPercent, 40,
  'um pico isolado não deve deslocar a mediana do nível de combustível');

const agingNow = 1_000_000;
const agingBuffer = new fuelLevel.FuelLevelBuffer();
for (let i = 0; i < 10; i += 1) {
  assert.strictEqual(agingBuffer.record(10 + i, agingNow - 63_000 + i * 7_000, agingNow), true);
}
const agingSnapshot = agingBuffer.getSnapshot(agingNow);
assert.strictEqual(agingSnapshot.sampleCount, 9,
  'amostras com mais de 60 s devem ser excluídas individualmente do snapshot');
assert.strictEqual(agingSnapshot.medianPercent, 15);
assert.strictEqual(agingSnapshot.lastReadAtMs, agingNow);

const invalidClockBuffer = new fuelLevel.FuelLevelBuffer();
assert.strictEqual(invalidClockBuffer.record(50, 1_000, Number.NaN), false,
  'relógio inválido não pode contornar a validação de timestamp');

const valid = {
  ecuConnected: true,
  tripConnected: true,
  fuelLevelSupported: true,
  fuelLevelPercent: 50,
  fuelLevelReadAtMs: 1_000_000,
  tripConsumptionKml: null,
  averageConsumptionKml: 10,
  nowMs: 1_000_000,
};

assert.strictEqual(getCurrentAutonomyRangeKm(valid), 280,
  '50% de tanque de 56 L a 10 km/L deve estimar 280 km, não autonomia de tanque cheio');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, tripConsumptionKml: 12 }), 336,
  'consumo válido da viagem atual tem prioridade sobre a média histórica');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelPercent: 0 }), 0,
  'uma amostra válida de tanque vazio pode representar autonomia zero');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, ecuConnected: false }), null,
  'ECU desconectada não pode apresentar autonomia salva como atual');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, tripConnected: false }), null,
  'sem sessão ativa não há autonomia atual');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelSupported: false }), null,
  'PID 012F não suportado deve deixar autonomia atual indisponível');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelPercent: null }), null,
  'sem leitura atual do nível de combustível deve mostrar N/D');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelPercent: 101 }), null,
  'nível de combustível fora da faixa deve ser rejeitado');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, averageConsumptionKml: 0 }), null,
  'sem consumo válido não deve existir estimativa de autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: 970_000 }), 280,
  'a amostra de nível no limite de 30 s ainda é válida');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: 969_999 }), null,
  'amostra de nível com mais de 30 s deve ser considerada desatualizada');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: null }), null,
  'percentual sem timestamp de leitura atual não pode gerar autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: Number.NaN }), null,
  'timestamp inválido não pode gerar autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: 1_000_001 }), null,
  'timestamp futuro não pode ser tratado como leitura atual');

const buffered = {
  ...valid,
  fuelLevelPercent: null,
  fuelLevelReadAtMs: null,
  bufferMedianPercent: 50,
  bufferSampleCount: 10,
  bufferLastReadAtMs: 960_000,
};
const bufferPresentation = getCurrentAutonomyPresentation(buffered);
assert.strictEqual(bufferPresentation.source, 'BUFFER',
  'fallback deve ser distinguido explicitamente da leitura atual do PID');
assert.strictEqual(bufferPresentation.rangeKm, 280,
  'buffer com dez leituras reais deve estimar autonomia com o consumo válido');
assert.strictEqual(getCurrentAutonomyRangeKm(buffered), 280);
assert.strictEqual(getCurrentAutonomyPresentation({ ...buffered, bufferSampleCount: 9 }).source, 'UNAVAILABLE',
  'buffer incompleto não pode ser usado como fallback');
assert.strictEqual(getCurrentAutonomyPresentation({
  ...buffered,
  bufferMedianPercent: agingSnapshot.medianPercent,
  bufferSampleCount: agingSnapshot.sampleCount,
  bufferLastReadAtMs: agingSnapshot.lastReadAtMs,
  nowMs: agingNow,
}).source, 'UNAVAILABLE',
  'snapshot com amostras expiradas e menos de dez amostras atuais deve manter autonomia indisponível');
assert.strictEqual(getCurrentAutonomyPresentation({ ...buffered, bufferLastReadAtMs: 939_999 }).source, 'UNAVAILABLE',
  'buffer expirado depois de 60 s precisa voltar a N/D');
assert.strictEqual(getCurrentAutonomyPresentation({
  ...valid, bufferMedianPercent: 80, bufferSampleCount: 10, bufferLastReadAtMs: 999_000,
}).source, 'LIVE', 'leitura válida atual tem prioridade sobre o buffer');

console.log('autonomyPresentation.test.js: PASS');
