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
const { getCurrentAutonomyRangeKm, isBufferEstimatedFuelLevelSample } = presentation;

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
  'amostra vencida sem buffer explícito nunca é tratada como atual');
assert.strictEqual(isBufferEstimatedFuelLevelSample(969_999, 2, 1_000_000), true,
  'buffer com duas amostras entre 30 e 60 s é elegível apenas à estimativa temporária');
assert.strictEqual(isBufferEstimatedFuelLevelSample(970_000, 2, 1_000_000), false,
  'a janela atual até 30 s não deve ser rotulada como fallback');
assert.strictEqual(isBufferEstimatedFuelLevelSample(940_000, 2, 1_000_000), true,
  'idade de exatamente 60 s ainda pode entrar na janela temporária');
assert.strictEqual(isBufferEstimatedFuelLevelSample(939_999, 2, 1_000_000), false,
  'acima de 60 s o buffer deixa de autorizar a estimativa');
assert.strictEqual(isBufferEstimatedFuelLevelSample(969_999, 1, 1_000_000), false,
  'uma amostra isolada não autoriza a estimativa');
assert.strictEqual(getCurrentAutonomyRangeKm({
  ...valid, fuelLevelReadAtMs: null, fuelLevelPercent: null,
  fuelLevelBufferPercent: 50, fuelLevelBufferReadAtMs: 969_999,
  fuelLevelBufferSampleCount: 3,
}), 280, 'buffer elegível calcula autonomia com a mediana real');
assert.strictEqual(getCurrentAutonomyRangeKm({
  ...valid, fuelLevelReadAtMs: null, fuelLevelPercent: null,
  fuelLevelBufferPercent: 50, fuelLevelBufferReadAtMs: 939_999,
  fuelLevelBufferSampleCount: 3,
}), null, 'buffer acima de 60 s não autoriza autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({
  ...valid, ecuConnected: false, fuelLevelReadAtMs: null, fuelLevelPercent: null,
  fuelLevelBufferPercent: 50, fuelLevelBufferReadAtMs: 969_999,
  fuelLevelBufferSampleCount: 3,
}), null, 'buffer nunca contorna a guarda de ECU desconectada');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: null }), null,
  'percentual sem timestamp de leitura atual não pode gerar autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: Number.NaN }), null,
  'timestamp inválido não pode gerar autonomia');
assert.strictEqual(getCurrentAutonomyRangeKm({ ...valid, fuelLevelReadAtMs: 1_000_001 }), null,
  'timestamp futuro não pode ser tratado como leitura atual');

console.log('autonomyPresentation.test.js: PASS');
