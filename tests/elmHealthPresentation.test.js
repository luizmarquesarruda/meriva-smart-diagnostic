'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const sourcePath = path.resolve(__dirname, '../src/obd/elmHealthPresentation.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
const { formatElmQueueHealth } = mod.exports;

assert.deepStrictEqual(formatElmQueueHealth({
  queueDepth: 2,
  maxQueueDepth: 7,
  queueRejections: 0,
  averageQueueWaitMs: 120,
  maxQueueWaitMs: 900,
}), {
  queue: 'FILA 2 PENDENTES • PICO 7 • RECUSAS 0',
  wait: 'ESPERA MÉDIA 120 ms • MÁXIMA 900 ms',
  warning: false,
});

assert.strictEqual(formatElmQueueHealth({
  queueDepth: 16,
  maxQueueDepth: 16,
  queueRejections: 3,
  averageQueueWaitMs: 2000,
  maxQueueWaitMs: 4500,
}).warning, true, 'recusas de fila precisam sinalizar atenção');

assert.strictEqual(formatElmQueueHealth({
  queueDepth: -1,
  maxQueueDepth: Number.NaN,
  queueRejections: Number.POSITIVE_INFINITY,
  averageQueueWaitMs: Number.NaN,
  maxQueueWaitMs: -3,
}).queue, 'FILA 0 PENDENTES • PICO 0 • RECUSAS 0', 'métricas inválidas não podem aparecer no diagnóstico');

assert.strictEqual(formatElmQueueHealth({
  queueDepth: 0,
  maxQueueDepth: 1,
  queueRejections: 0,
  averageQueueWaitMs: 0,
  maxQueueWaitMs: 5000,
}).warning, true, 'espera máxima de cinco segundos sinaliza fila degradada');

console.log('elmHealthPresentation.test.js: OK');
