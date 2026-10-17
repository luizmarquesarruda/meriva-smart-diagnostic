'use strict';
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');
const files = new Map();
const dirs = new Set(['/doc']);
function parent(p) { const i = p.lastIndexOf('/'); return i <= 0 ? '/' : p.slice(0, i); }
const fakeFS = {
  documentDirectory: '/doc',
  EncodingType: { UTF8: 'utf8' },
  async makeDirectoryAsync(p) { dirs.add(p); },
  async getInfoAsync(p) { return files.has(p) ? { exists: true, isDirectory: false, size: Buffer.byteLength(files.get(p)) } : { exists: dirs.has(p), isDirectory: dirs.has(p), size: 0 }; },
  async readAsStringAsync(p) { if (!files.has(p)) throw new Error('missing'); return files.get(p); },
  async writeAsStringAsync(p, value) { dirs.add(parent(p)); files.set(p, value); },
  async copyAsync({ from, to }) { if (!files.has(from)) throw new Error('missing source'); files.set(to, files.get(from)); },
  async deleteAsync(p) { files.delete(p); },
  async moveAsync({ from, to }) { if (!files.has(from)) throw new Error('missing source'); files.set(to, files.get(from)); files.delete(from); },
};
const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'linkEventStore.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;
const originalLoad = Module._load;
Module._load = function(request, parentModule, isMain) {
  if (request === 'expo-file-system') return fakeFS;
  return originalLoad.call(this, request, parentModule, isMain);
};
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);
Module._load = originalLoad;

(async () => {
  await Promise.all(Array.from({ length: 12 }, (_, i) => mod.exports.appendLinkEvent('/doc/MERIVA', {
    timestamp: new Date(1700000000000 + i).toISOString(),
    sessionId: 'session-1',
    state: i % 2 ? 'ECU_RESPONDING' : 'ADAPTER_NO_ECU_RESPONSE',
    cause: i % 2 ? 'PID_RESPONSE' : 'TIMEOUT',
    consecutiveFailures: i % 2 ? 0 : 1,
    latencyMs: 120 + i,
    pid: '010C',
  })));
  await mod.exports.appendAppEvent('/doc/MERIVA', {
    timestamp: new Date().toISOString(), eventType: 'SESSION_START', detail: { protocol: 'KWP FAST' },
  });
  const links = JSON.parse(files.get('/doc/MERIVA/LOGS/link_events.json'));
  const apps = JSON.parse(files.get('/doc/MERIVA/LOGS/app_events.json'));
  assert.strictEqual(links.schemaVersion, 1);
  assert.strictEqual(links.events.length, 12, 'concurrent appends must not lose link events');
  assert.strictEqual(links.events[0].pid, '010C');
  assert.strictEqual(links.events[11].latencyMs, 131);
  assert.strictEqual(apps.events[0].eventType, 'SESSION_START');
  console.log('linkEventStore: serialized event writes passed');
})().catch((error) => { console.error(error); process.exitCode = 1; });
