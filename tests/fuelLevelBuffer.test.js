'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.join(__dirname, '..', 'src', 'trip', 'fuelLevelBuffer.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const { FuelLevelBuffer, FUEL_LEVEL_BUFFER_CAPACITY, FUEL_LEVEL_BUFFER_MAX_AGE_MS, monotonicNowMs } = mod.exports;
const buffer = new FuelLevelBuffer();
const start = 1_000_000;

const originalPerformance = Object.getOwnPropertyDescriptor(globalThis, 'performance');
try {
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 1000 } });
  assert.equal(monotonicNowMs(), 1000);
  Object.defineProperty(globalThis, 'performance', { configurable: true, value: { now: () => 999 } });
  assert.equal(monotonicNowMs(), 1000, 'relógio regressivo não pode retroceder a ordenação monotônica');
} finally {
  if (originalPerformance) Object.defineProperty(globalThis, 'performance', originalPerformance);
  else delete globalThis.performance;
}

assert.equal(FUEL_LEVEL_BUFFER_CAPACITY, 10);
assert.equal(FUEL_LEVEL_BUFFER_MAX_AGE_MS, 60_000);
for (let index = 0; index < 9; index += 1) {
  assert.equal(buffer.addSample(40 + index, start + index * 6000, start + index * 6000), true);
}
assert.equal(buffer.getEstimate(start + 54_000), null, 'nove leituras reais não completam o buffer 10/10');
assert.equal(buffer.addSample(49, start + 54_000, start + 54_000), true);
assert.deepEqual(buffer.getEstimate(start + 54_000), {
  percent: 44.5, latestReadAtMs: start + 54_000, sampleCount: 10,
});
assert.equal(buffer.addSample(100, start + 60_000, start + 60_000), true);
assert.equal(buffer.getSampleCount(start + 60_000), 10);
assert.equal(buffer.getEstimate(start + 60_000).percent, 50.5, 'a média usa as dez leituras mais recentes');
assert.equal(buffer.addSample(101, start + 66_000, start + 66_000), false);
assert.equal(buffer.addSample(-1, start + 66_000, start + 66_000), false);
assert.equal(buffer.addSample(50, start + 66_000, start + 65_999), false, 'timestamp futuro rejeitado');
assert.equal(buffer.addSample(50, start + 60_000, start + 66_000), false, 'timestamp duplicado/antigo rejeitado');
assert.equal(buffer.getEstimate(start + 120_001), null, 'última amostra com mais de 60 s expira');
assert.equal(buffer.getSampleCount(start + 180_001), 0, 'amostras expiram após retenção máxima');
buffer.reset();
assert.equal(buffer.getSampleCount(start + 1), 0, 'nova sessão inicia sem leituras herdadas');
console.log('fuelLevelBuffer.test.js: PASS');
