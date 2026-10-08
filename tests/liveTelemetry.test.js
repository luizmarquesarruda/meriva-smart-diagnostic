'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const originalResolveFilename = Module._resolveFilename;
const originalTsExtension = Module._extensions['.ts'];

Module._extensions['.ts'] = function compileTypeScript(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveFilename(request, parent, isMain, options) {
  try {
    return originalResolveFilename.call(this, request, parent, isMain, options);
  } catch (error) {
    if (typeof request === 'string' && parent?.filename && request.startsWith('.')) {
      const candidate = path.resolve(path.dirname(parent.filename), request + '.ts');
      if (fs.existsSync(candidate)) return candidate;
    }
    throw error;
  }
};

function loadTs(file) {
  const sourcePath = path.join(__dirname, '..', file);
  const mod = new Module(sourcePath, null);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  mod._compile(ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
  }).outputText, sourcePath);
  return mod.exports;
}

const telemetry = loadTs('src/obd/liveTelemetry.ts');
telemetry.resetLiveTelemetry();

telemetry.recordLivePidReading({
  pid: '010C',
  name: 'RPM',
  value: 800,
  unit: 'rpm',
  timestamp: new Date().toISOString(),
  source: 'SIMULACAO',
});
assert.strictEqual(telemetry.getLivePidTrend('010C'), null);

for (let i = 0; i < 125; i += 1) {
  telemetry.recordLivePidReading({
    pid: '010C',
    name: 'RPM',
    value: i,
    unit: 'rpm',
    timestamp: new Date().toISOString(),
    source: 'REAL',
  });
}
let trend = telemetry.getLivePidTrend('010C');
assert.ok(trend);
assert.strictEqual(trend.samples, telemetry.LIVE_TELEMETRY_MAX_POINTS);
assert.strictEqual(trend.min, 5);
assert.strictEqual(trend.max, 124);
assert.strictEqual(trend.current, 124);
assert.strictEqual(trend.values.length, 30);
assert.ok(telemetry.formatSparkline(trend.values).length === 30);

let values = new Map([
  ['010D', 0],
  ['010C', 800],
  ['0105', 60],
]);
assert.strictEqual(telemetry.classifyVehicleCondition(values), 'IDLE_COLD');

values.set('0105', 85);
assert.strictEqual(telemetry.classifyVehicleCondition(values), 'IDLE_WARM');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 40], ['010C', 1800]]), 30), 'ACCELERATION');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 20], ['010C', 1800]]), 40), 'DECELERATION');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map([['010D', 60], ['010C', 2000]]), 61), 'CRUISE');
assert.strictEqual(telemetry.classifyVehicleCondition(new Map()), 'UNKNOWN');

telemetry.resetLiveTelemetry();
const stale = new Date(Date.now() - 30_000).toISOString();
telemetry.recordLivePidReading({ pid: '010D', name: 'Speed', value: 0, unit: 'km/h', timestamp: stale, source: 'REAL' });
telemetry.recordLivePidReading({ pid: '010C', name: 'RPM', value: 800, unit: 'rpm', timestamp: stale, source: 'REAL' });
telemetry.recordLivePidReading({ pid: '0105', name: 'Coolant', value: 85, unit: 'celsius', timestamp: stale, source: 'REAL' });
assert.strictEqual(telemetry.getVehicleConditionSnapshot().condition, 'UNKNOWN');
assert.strictEqual(telemetry.getLivePidCurrent('010C'), null, 'RPM antigo não pode ser tratado como telemetria atual');


console.log('Live telemetry: rolling window + context + simulation isolation: PASS');


Module._resolveFilename = originalResolveFilename;
if (originalTsExtension) Module._extensions['.ts'] = originalTsExtension;
else delete Module._extensions['.ts'];
