'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/trip/autonomyBuffer.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const loaded = new Module(sourcePath, null);
loaded.filename = sourcePath;
loaded.paths = Module._nodeModulePaths(path.dirname(sourcePath));
loaded._compile(output, sourcePath);

const { AutonomyBuffer, AUTONOMY_BUFFER_CAPACITY, AUTONOMY_BUFFER_MIN_INTERVALS } = loaded.exports;

const levels = new AutonomyBuffer();
for (let index = 0; index < 10; index += 1) {
  assert.equal(levels.addFuelLevelSample(50, 1_000 + index * 5_000), true);
}
assert.equal(levels.getFuelLevelSampleCount(46_000), 10);
assert.equal(levels.getFuelLevelPercent(46_000), 50);
assert.equal(levels.addFuelLevelSample(100, 51_000), true);
assert.equal(levels.getFuelLevelSampleCount(51_000), 10, 'janela FIFO mantém dez leituras');
assert.equal(levels.getFuelLevelPercent(51_000), 50, 'mediana rejeita um pico isolado');
assert.equal(levels.addFuelLevelSample(101, 56_000), false, 'percentual fora de 0–100 é inválido');
assert.equal(levels.addFuelLevelSample(40, 55_999), false, 'timestamp fora de ordem é inválido');
assert.equal(levels.getFuelLevelPercent(81_001), null, 'nível vencido não alimenta autonomia');
assert.equal(levels.getFuelLevelSampleCount(81_001), 0);

const flow = new AutonomyBuffer();
for (let index = 0; index <= 10; index += 1) {
  flow.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 36, fuelRateLph: 12.6 });
}
assert.equal(AUTONOMY_BUFFER_CAPACITY, 10);
assert.equal(AUTONOMY_BUFFER_MIN_INTERVALS, 10);
assert.equal(flow.getRollingConsumptionSampleCount(16_000), 10);
assert.ok(Math.abs(flow.getRollingConsumptionKml(16_000) - 36 / 12.6) < 0.001,
  'km/L é distância integrada dividida pelo combustível integrado');
flow.addFuelFlowSample({ timestampMs: 17_500, speedKmh: 0, fuelRateLph: 12.6 });
assert.equal(flow.getRollingConsumptionKml(46_001), null, 'consumo móvel vencido não é atual');
flow.reset();
assert.equal(flow.getRollingConsumptionKml(17_500), null, 'reset limpa a janela da sessão');

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
for (let index = 0; index <= 10; index += 1) {
  slow.addFuelFlowSample({ timestampMs: 1_000 + index * 1_500, speedKmh: 3, fuelRateLph: 12 });
}
assert.equal(slow.getRollingConsumptionSampleCount(16_000), 0, 'velocidade abaixo do limite não calibra km/L');

console.log('autonomyBuffer.test.js: PASS');
