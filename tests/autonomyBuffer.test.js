'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');
const ROOT = path.resolve(__dirname, '..');
function loadTs(file, overrides = {}) {
  const output = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
  }).outputText;
  const loaded = new Module(file, null);
  loaded.filename = file;
  loaded.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === file && Object.prototype.hasOwnProperty.call(overrides, request)) return overrides[request];
    return originalLoad.apply(this, arguments);
  };
  try { loaded._compile(output, file); } finally { Module._load = originalLoad; }
  return loaded.exports;
}
const bufferModule = loadTs(path.join(ROOT, 'src/trip/autonomyBuffer.ts'));
const fuelLevel = loadTs(path.join(ROOT, 'src/trip/fuelLevel.ts'));
const presentation = loadTs(path.join(ROOT, 'src/trip/autonomyPresentation.ts'), { './fuelLevel': fuelLevel });
const { AutonomyBuffer, AUTONOMY_BUFFER_CAPACITY, AUTONOMY_BUFFER_MIN_INTERVALS } = bufferModule;
const levels = new AutonomyBuffer();
for (let index = 0; index < 10; index += 1) assert.equal(levels.addFuelLevelSample(50, 1_000 + index * 5_000), true);
assert.equal(levels.getFuelLevelSampleCount(46_000), 10);
assert.equal(levels.getFuelLevelPercent(46_000), 50);
assert.equal(levels.addFuelLevelSample(100, 51_000), true);
assert.equal(levels.getFuelLevelSampleCount(51_000), 10, 'janela FIFO mantém dez leituras');
assert.equal(levels.getFuelLevelPercent(51_000), 50, 'mediana rejeita um pico isolado');
assert.equal(levels.addFuelLevelSample(101, 56_000), false, 'percentual fora de 0–100 é inválido');
assert.equal(levels.addFuelLevelSample(40, 50_999), false, 'timestamp fora de ordem é inválido');
assert.equal(levels.getFuelLevelPercent(81_001), null, 'nível vencido não alimenta autonomia');
assert.equal(levels.getFuelLevelSampleCount(81_001), 0);
const agedLevels = new AutonomyBuffer();
for (let index = 0; index < 10; index += 1) {
  agedLevels.addFuelLevelSample(index === 0 ? 100 : 40, 1_000 + index * 25_000);
}
assert.equal(agedLevels.getFuelLevelSampleCount(226_000), 3,
  'a janela temporal remove leituras antigas mesmo que nenhum intervalo adjacente supere 30 s');
assert.equal(agedLevels.getFuelLevelPercent(226_000), 40,
  'um pico antigo não pode dominar a mediana depois de vários minutos de polling lento');

const graceLevels = new AutonomyBuffer();
for (let index = 0; index < 3; index += 1) {
  assert.equal(graceLevels.addFuelLevelSample(42, 1_000_000 + index * 5_000), true);
}
assert.equal(graceLevels.getFuelLevelPercent(1_050_000), null,
  'uma leitura com 40 s não deve ser apresentada como PID atual');
assert.equal(graceLevels.getFuelLevelBufferPercent(1_050_000), 42,
  'buffer recente com pelo menos duas amostras válidas sustenta apenas a estimativa temporária');
assert.equal(graceLevels.getFuelLevelBufferReadAtMs(1_050_000), 1_010_000,
  'a idade da estimativa vem do timestamp real da última amostra');
assert.equal(graceLevels.getFuelLevelBufferSampleCount(1_050_000), 3);
assert.equal(graceLevels.getFuelLevelBufferPercent(1_070_001), null,
  'o buffer não pode sustentar autonomia após 60 s');
assert.equal(graceLevels.getFuelLevelBufferReadAtMs(1_070_001), null);
const singleGraceLevel = new AutonomyBuffer();
singleGraceLevel.addFuelLevelSample(42, 1_000_000);
assert.equal(singleGraceLevel.getFuelLevelBufferPercent(1_040_001), null,
  'uma única amostra não autoriza fallback pela mediana');

const flow = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) flow.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6 });
assert.equal(AUTONOMY_BUFFER_CAPACITY, 10);
assert.equal(AUTONOMY_BUFFER_MIN_INTERVALS, 10);
assert.equal(flow.getRollingConsumptionSampleCount(16_000), 10);
assert.ok(Math.abs(flow.getRollingConsumptionKml(16_000) - 36 / 12.6) < 0.001,
  'km/L é distância integrada dividida pelo combustível integrado');
flow.addFuelFlowSample({ timestampMs: 17_500, speedKmh: 0, fuelRateLph: 12.6 });
assert.equal(flow.getRollingConsumptionKml(46_001), null, 'consumo móvel vencido não é atual');
flow.reset();
assert.equal(flow.getRollingConsumptionKml(17_500), null, 'reset limpa a janela da sessão');

const interrupted = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) {
  interrupted.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6 });
}
assert.ok(interrupted.getRollingConsumptionKml(16_000) != null);
interrupted.addFuelFlowSample({ timestampMs: 17_500, speedKmh: 36, fuelRateLph: Number.NaN });
assert.equal(interrupted.getRollingConsumptionKml(17_500), null,
  'uma taxa inválida limpa a janela móvel anterior, não apenas a amostra anterior');
assert.equal(interrupted.getRollingConsumptionSampleCount(17_500), 0);

const gapAfterReady = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) {
  gapAfterReady.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6 });
}
gapAfterReady.addFuelFlowSample({ timestampMs: 27_001, speedKmh: 36, fuelRateLph: 12.6 });
assert.equal(gapAfterReady.getRollingConsumptionKml(27_001), null,
  'gap acima de 10 s deve descartar os dez intervalos antigos');
gapAfterReady.addFuelFlowSample({ timestampMs: 28_501, speedKmh: 36, fuelRateLph: 12.6 });
assert.equal(gapAfterReady.getRollingConsumptionKml(28_501), null,
  'é necessário construir dez novos intervalos contínuos depois do gap');

const stalled = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) {
  stalled.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6 });
}
assert.equal(stalled.getRollingConsumptionKml(26_001), null,
  'consumo móvel fica indisponível quando não há nova taxa por mais de 10 s');
const gaps = new AutonomyBuffer();
gaps.addFuelFlowSample({ timestampMs: 1_000, speedKmh: 36, fuelRateLph: 12 });
gaps.addFuelFlowSample({ timestampMs: 12_000, speedKmh: 36, fuelRateLph: 12 });
assert.equal(gaps.getRollingConsumptionSampleCount(12_000), 0, 'gap longo não é integrado');
const invalid = new AutonomyBuffer();
invalid.addFuelFlowSample({ timestampMs: 1_000, speedKmh: 36, fuelRateLph: 12 });
invalid.addFuelFlowSample({ timestampMs: 2_500, speedKmh: 36, fuelRateLph: Number.NaN });
invalid.addFuelFlowSample({ timestampMs: 4_000, speedKmh: 36, fuelRateLph: 12 });
assert.equal(invalid.getRollingConsumptionSampleCount(4_000), 0, 'taxa inválida rompe a continuidade');
const slow = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) slow.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 3, fuelRateLph: 12 });
assert.equal(slow.getRollingConsumptionSampleCount(16_000), 0, 'velocidade baixa não calibra km/L');
const sourceSwitch = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) {
  sourceSwitch.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6, sourceKey: 'MEASURED_015E' });
}
assert.ok(sourceSwitch.getRollingConsumptionKml(16_000) != null);
sourceSwitch.addFuelFlowSample({ timestampMs: 17_500, speedKmh: 36, fuelRateLph: 12.6, sourceKey: 'ESTIMATED_MAF:FLEX:30' });
assert.equal(sourceSwitch.getRollingConsumptionKml(17_500), null, 'troca de fonte de fluxo deve reiniciar a janela para não misturar fórmulas');
sourceSwitch.resetConsumption();
assert.equal(sourceSwitch.getRollingConsumptionKml(17_500), null, 'reset de consumo preserva o contrato de janela vazia');

const { getCurrentAutonomyRangeKm } = presentation;
const input = { ecuConnected: true, tripConnected: true, fuelLevelSupported: true, fuelLevelPercent: 50,
  fuelLevelReadAtMs: 1_000_000, tripConsumptionKml: 12, rollingConsumptionKml: 8,
  averageConsumptionKml: 10, nowMs: 1_000_000 };
assert.equal(getCurrentAutonomyRangeKm(input), 224, 'consumo móvel recente tem prioridade');
assert.equal(getCurrentAutonomyRangeKm({ ...input, rollingConsumptionKml: null }), 336, 'consumo da viagem é fallback');
assert.equal(getCurrentAutonomyRangeKm({ ...input, rollingConsumptionKml: null, tripConsumptionKml: null }), 280, 'média histórica é último fallback');
assert.equal(getCurrentAutonomyRangeKm({ ...input, fuelLevelSupported: false, fuelLevelPercent: null, fuelLevelReadAtMs: null, fallbackFuelRemainingL: 20, rollingConsumptionKml: 8 }), 160,
  'balanço de tanque cheio pode fornecer autonomia quando o PID 012F não é suportado');
assert.equal(getCurrentAutonomyRangeKm({ ...input, fuelLevelSupported: false, fuelLevelPercent: null, fuelLevelReadAtMs: null, fallbackFuelRemainingL: null }), null,
  'sem PID 012F e sem balanço de tanque cheio não inventar autonomia');
console.log('autonomyBuffer.test.js: PASS');
