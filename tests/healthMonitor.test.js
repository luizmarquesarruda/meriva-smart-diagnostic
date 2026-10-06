'use strict';

const assert = require('assert');
const path = require('path');
const fs = require('fs');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const compiled = new Map();

function loadTs(tsPath) {
  tsPath = path.normalize(tsPath);
  if (compiled.has(tsPath)) return compiled.get(tsPath).exports;
  const source = fs.readFileSync(tsPath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiled.set(tsPath, mod);
  mod._compile(output, tsPath);
  return mod.exports;
}

const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
    if (fs.existsSync(resolved + '.json')) return JSON.parse(fs.readFileSync(resolved + '.json', 'utf8'));
  }
  return originalLoad.apply(this, arguments);
};

const monitorModule = loadTs(path.join(ROOT, 'src/obd/healthMonitor.ts'));

function monitor() {
  return new monitorModule.MerivaHealthMonitor();
}

function sample(pid, value) {
  return { pid, value, valid: true };
}

async function main() {
  let health = monitor();

  let result = health.evaluate([sample('0105', 81)], 'IDLE');
  assert.strictEqual(result.state, 'NORMAL');
  assert.ok(result.findings.some((item) => item.id === 'thermostat_transition'));

  health = monitor();
  for (let i = 0; i < 4; i++) {
    result = health.evaluate([sample('0105', 101)], 'MOTOR_AQUECIDO');
  }
  assert.strictEqual(result.state, 'ATENCAO');
  assert.ok(result.findings.some((item) => item.id === 'fan_stage1'));

  health = monitor();
  result = health.evaluate([sample('0105', null)], 'MOTOR_AQUECIDO');
  assert.strictEqual(result.state, 'SEM_DADOS');
  assert.ok(result.findings.some((item) => item.id === 'coolant_missing'));

  health = monitor();
  for (let i = 0; i < 5; i++) {
    result = health.evaluate([sample('0105', 90), sample('010C', 950)], 'IDLE');
  }
  assert.strictEqual(result.state, 'ATENCAO');
  assert.ok(result.findings.some((item) => item.id === 'idle_rpm_reference'));

  health = monitor();
  result = health.evaluate([sample('0105', 90), sample('010C', 950)], 'IDLE');
  assert.strictEqual(result.state, 'NORMAL');

  health = monitor();
  for (let i = 0; i < 3; i++) {
    result = health.evaluate([sample('0105', 90), sample('0142', 11.5)], 'MOTOR_AQUECIDO');
  }
  assert.strictEqual(result.state, 'ATENCAO');
  assert.ok(result.findings.some((item) => item.id === 'ecu_supply_reference'));

  health = monitor();
  result = health.evaluate([sample('0105', 90), sample('0114', 0.01)], 'IDLE');
  assert.strictEqual(result.state, 'ATENCAO');
  assert.ok(result.findings.some((item) => item.id === 'o2_signal_reference'));

  console.log('healthMonitor: 7 testes PASSARAM');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
