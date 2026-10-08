const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(output, sourcePath);
  return mod.exports;
}

const { buildDtcTimeline, summarizeDtcTimeline } = loadTs('src/diagnostics/dtcTimeline.ts');
const center = '2026-10-08T12:00:00.000Z';
const timeline = buildDtcTimeline({ code: 'P0135', lastSeen: center }, [
  { pid: '010C', name: 'RPM', value: 900, unit: 'rpm', timestamp: center, source: 'REAL_OBD' },
]);

assert.strictEqual(timeline.code, 'P0135');
assert.strictEqual(timeline.occurrenceAt, center);
assert.strictEqual(timeline.samples.length, 1);
assert.ok(timeline.windowStart.endsWith('11:59:30.000Z'));
assert.ok(timeline.windowEnd.endsWith('12:00:30.000Z'));
assert.ok(summarizeDtcTimeline(timeline).includes('1 amostras reais'));

console.log('dtcTimeline.test.js: PASS');
