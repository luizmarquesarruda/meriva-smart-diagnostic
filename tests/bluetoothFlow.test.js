'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const root = path.resolve(__dirname, '..');
const cache = new Map();
function loadTs(file) {
  const full = path.normalize(file);
  if (cache.has(full)) return cache.get(full).exports;
  const source = fs.readFileSync(full, 'utf8');
  const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true } }).outputText;
  const mod = new Module(full, null); mod.filename = full; mod.paths = Module._nodeModulePaths(path.dirname(full)); cache.set(full, mod); mod._compile(output, full); return mod.exports;
}
const originalLoad = Module._load;
Module._load = function(request, parent) {
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};
const flow = loadTs(path.join(root, 'src/obd/bluetoothFlow.ts'));
const elm = loadTs(path.join(root, 'src/obd/elm327.ts'));

function makeTransport(responses) {
  let opened = false; let last = '';
  return {
    async open(){ opened = true; },
    async close(){ opened = false; },
    async write(data){ if (!opened) throw new Error('closed'); last = data.trim().toUpperCase(); },
    async readUntilPrompt(){ if (!opened) throw new Error('closed'); return responses[last] ?? 'NO DATA'; },
  };
}
async function run() {
  let s = flow.BLUETOOTH_FLOW_STATES.OFF;
  s = flow.reduceBluetoothFlow(s, {type:'BLUETOOTH_ON'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.ON);
  s = flow.reduceBluetoothFlow(s, {type:'DEVICE_SELECTED'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.SELECTED);
  s = flow.reduceBluetoothFlow(s, {type:'DEVICE_CONNECTED'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.CONNECTED);
  s = flow.reduceBluetoothFlow(s, {type:'ELM_RESPONDING'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.ELM_RESPONDING);
  s = flow.reduceBluetoothFlow(s, {type:'ELM_INITIALIZED'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.ELM_INITIALIZED);
  s = flow.reduceBluetoothFlow(s, {type:'ECU_READY'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.ECU_READY);
  s = flow.reduceBluetoothFlow(s, {type:'DIAGNOSTIC_READY'}); assert.strictEqual(s, flow.BLUETOOTH_FLOW_STATES.READY);
  assert.strictEqual(flow.canQueryPids(s), true);
  assert.strictEqual(flow.canQueryPids(flow.BLUETOOTH_FLOW_STATES.OFF), false);
  const good = {'ATI':'ELM327 v1.5','ATZ':'ELM327 v1.5','ATE0':'OK','ATL0':'OK','ATS0':'OK','ATH1':'OK','ATSP0':'OK','0100':'41 00 BE 3E B8 13','010C':'41 0C 1A F8'};
  const session = new elm.Elm327Session(makeTransport(good));
  await session.initialize(); assert.strictEqual(session.isInitialized, true);
  await session.confirmEcu(); assert.strictEqual(session.isEcuReady, true);
  const pid = await session.queryPid('010C'); assert.strictEqual(pid.commandStatus, 'OK');
  const blocked = new elm.Elm327Session(makeTransport(good));
  await assert.rejects(() => blocked.queryPid('010C'), /DIAGNÓSTICO NÃO PRONTO/);
  const bad = new elm.Elm327Session(makeTransport({...good, '0100':'NO DATA'}));
  await bad.initialize();
  await assert.rejects(() => bad.confirmEcu(), /ECU NÃO RESPONDEU/);
  const noElm = new elm.Elm327Session(makeTransport({...good, 'ATI':'NO DATA'}));
  await assert.rejects(() => noElm.initialize(), /ELM327 NÃO RESPONDEU/);
  console.log('Bluetooth/ELM state tests: TODOS PASSARAM');
}
run().catch((e) => { console.error(e); process.exitCode = 1; });
