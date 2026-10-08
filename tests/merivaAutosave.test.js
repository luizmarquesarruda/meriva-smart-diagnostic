/**
 * Testes do sistema de autosave — Node puro, sem dependências novas.
 *
 * Uso: node tests/merivaAutosave.test.js
 *
 * Estratégia:
 * - Os módulos reais de src/ são transpilados em memória com o `typescript`
 *   que já existe nas devDependencies do projeto.
 * - Apenas as bordas nativas (expo-file-system, react-native) são substituídas
 *   por um sistema de arquivos em memória — o código testado é o código real.
 * - O que NÃO é coberto aqui: hardware real (Bluetooth/ELM327/ECU) — NÃO VALIDADO.
 */
'use strict';

const path = require('path');
const fs = require('fs');
const assert = require('assert');
const Module = require('module');
const ts = require('typescript');

// ---------- raiz do projeto ----------
function findRepoRoot(startDir) {
  let dir = startDir;
  for (;;) {
    if (fs.existsSync(path.join(dir, 'package.json'))) return dir;
    const parent = path.dirname(dir);
    if (parent === dir) throw new Error('raiz do projeto não encontrada');
    dir = parent;
  }
}
const ROOT = findRepoRoot(__dirname);

// ---------- carregador de módulos TS (em memória) ----------
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
    },
  }).outputText;
  const mod = new Module(tsPath, null);
  mod.filename = tsPath;
  mod.paths = Module._nodeModulePaths(path.dirname(tsPath));
  compiled.set(tsPath, mod); // registra antes de compilar (importação circular)
  mod._compile(output, tsPath);
  return mod.exports;
}

// ---------- FS em memória ----------
// Objeto único e estável: os módulos transpilados capturam o resultado de
// require('expo-file-system') na carga; o reset apenas limpa o conteúdo.
let files = new Map();
let dirs = new Set(['/doc']);
const currentFS = createMemoryFS();

function resetFS() {
  files.clear();
  dirs.clear();
  dirs.add('/doc');
  return currentFS;
}

function parentDir(p) {
  const i = p.lastIndexOf('/');
  return i <= 0 ? '/' : p.substring(0, i);
}

function createMemoryFS() {
  const enc = { UTF8: 'utf8' };
  const fakeFS = {
    documentDirectory: '/doc',
    EncodingType: enc,
    async getInfoAsync(p) {
      if (files.has(p)) {
        return {
          exists: true,
          isDirectory: false,
          size: Buffer.byteLength(files.get(p), 'utf8'),
          uri: p,
          modificationTime: Date.now() / 1000,
        };
      }
      if (dirs.has(p)) return { exists: true, isDirectory: true, size: 0, uri: p };
      return { exists: false, isDirectory: false, size: 0, uri: p };
    },
    async makeDirectoryAsync(p) {
      const parts = p.split('/').filter(Boolean);
      let acc = '';
      for (const part of parts) {
        acc += '/' + part;
        dirs.add(acc);
      }
    },
    async readAsStringAsync(p) {
      if (!files.has(p)) throw new Error('ARQUIVO NAO EXISTE: ' + p);
      return files.get(p);
    },
    async writeAsStringAsync(p, content) {
      const parent = parentDir(p);
      if (parent && !dirs.has(parent)) await fakeFS.makeDirectoryAsync(parent);
      files.set(p, String(content));
    },
    async copyAsync(options) {
      const { from, to } = options;
      if (files.has(from)) {
        const parent = parentDir(to);
        if (parent && !dirs.has(parent)) await fakeFS.makeDirectoryAsync(parent);
        files.set(to, files.get(from));
        return;
      }
      if (dirs.has(from)) {
        await fakeFS.makeDirectoryAsync(to);
        for (const [p, c] of Array.from(files.entries())) {
          if (p.startsWith(from + '/')) files.set(to + p.substring(from.length), c);
        }
        return;
      }
      throw new Error('ORIGEM NAO EXISTE: ' + from);
    },
    async moveAsync(options) {
      await fakeFS.copyAsync(options);
      await fakeFS.deleteAsync(options.from, {});
    },
    async deleteAsync(p) {
      files.delete(p);
      dirs.delete(p);
    },
    async readDirectoryAsync(p) {
      if (!dirs.has(p)) throw new Error('DIRETORIO NAO EXISTE: ' + p);
      const names = new Set();
      for (const fp of files.keys()) {
        if (fp.startsWith(p + '/')) names.add(fp.substring(p.length + 1).split('/')[0]);
      }
      for (const dp of dirs) {
        if (dp.startsWith(p + '/')) names.add(dp.substring(p.length + 1).split('/')[0]);
      }
      return Array.from(names);
    },
    StorageAccessFramework: {
      async requestDirectoryPermissionsAsync() {
        return { granted: false, directoryUri: '' };
      },
      async createFileAsync() {
        throw new Error('SAF NAO SUPORTADO NOS TESTES');
      },
    },
  };
  return fakeFS;
}

// ---------- stub react-native ----------
const fakeRN = {
  AppState: { addEventListener: () => ({ remove() {} }) },
  Platform: { OS: 'android' },
  NativeModules: {},
};

// ---------- stub de resolução de módulos ----------
const originalLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'expo-file-system') return currentFS;
  if (request === 'react-native') return fakeRN;
  if (parent && parent.filename && (request.startsWith('./') || request.startsWith('../'))) {
    const resolved = path.resolve(path.dirname(parent.filename), request);
    if (fs.existsSync(resolved + '.ts')) return loadTs(resolved + '.ts');
  }
  return originalLoad.apply(this, arguments);
};

// ---------- sujeitos de teste ----------
const BASE = '/doc/MERIVA_SMART';
const CONFIG_DIR = `${BASE}/CONFIG`;

function manager() {
  return loadTs(path.join(ROOT, 'src/meriva/autosaveManager.ts'));
}
function wait(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

const TESTS = [];
function test(name, fn) {
  TESTS.push({ name, fn });
}

test('1. estado vazio -> salvar -> restaurar', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  let state = await m.initAutoSave(BASE);
  assert.strictEqual(state.vehicle, null);
  m.updateAutoSaveState((s) => {
    s.settings.teste = 42;
  });
  const ok = await m.saveNow('critical');
  assert.ok(ok, 'saveNow deve retornar true');
  assert.ok(files.has(`${CONFIG_DIR}/autosave.json`), 'autosave.json deve existir');
  const envelope = JSON.parse(files.get(`${CONFIG_DIR}/autosave.json`));
  assert.strictEqual(envelope.schemaVersion, 1);
  assert.strictEqual(envelope.dataType, 'APP_STATE');
  m.disposeAutoSave();
  state = await m.initAutoSave(BASE);
  assert.strictEqual(state.settings.teste, 42, 'estado deve ser restaurado');
});

test('2. salvar -> modificar -> salvar -> restaura última versão', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => {
    s.settings.fase = 1;
  });
  await m.saveNow('critical');
  m.updateAutoSaveState((s) => {
    s.settings.fase = 2;
  });
  await m.saveNow('critical');
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  assert.strictEqual(m.getAutoSaveState().settings.fase, 2);
});

test('3. arquivo principal corrompido -> restaura previous.json', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'anterior';
  });
  await m.saveNow('critical');
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'ultima';
  });
  await m.saveNow('critical'); // main = ultima, previous = anterior
  files.set(`${CONFIG_DIR}/autosave.json`, '{ISTO É JSON CORROMPIDO');
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  assert.strictEqual(m.getAutoSaveState().settings.fase, 'anterior', 'deve cair no previous.json');
  assert.ok(files.has(`${CONFIG_DIR}/autosave.json`), 'arquivo corrompido não deve ser apagado no load');
});

test('4. schema antigo -> migrar', async () => {
  const migrations = loadTs(path.join(ROOT, 'src/meriva/autosaveMigrations.ts'));
  const m = manager();
  m.disposeAutoSave();
  migrations.AUTOSAVE_MIGRATIONS[0] = (payload) => ({ ...payload, settings: { migrado: true } });
  resetFS();
  await m.initAutoSave(BASE);
  m.disposeAutoSave();
  files.set(
    `${CONFIG_DIR}/autosave.json`,
    JSON.stringify({
      schemaVersion: 0,
      savedAt: new Date().toISOString(),
      dataType: 'APP_STATE',
      source: 'teste',
      payload: {
        vehicle: null,
        obd: { connected: false },
        lastReadings: [],
        dtcs: [],
        driveCycles: [],
      },
    }),
  );
  await m.initAutoSave(BASE);
  assert.strictEqual(m.getAutoSaveState().settings.migrado, true, 'payload v0 deve ser migrado');
  delete migrations.AUTOSAVE_MIGRATIONS[0];
});

test('5. schema futuro -> não destruir, usar fallback', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'valida';
  });
  await m.saveNow('critical');
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'penultima';
  });
  await m.saveNow('critical'); // main = penultima, previous = valida
  const future = JSON.stringify({
    schemaVersion: 99,
    savedAt: new Date().toISOString(),
    dataType: 'APP_STATE',
    source: 'futuro',
    payload: {},
  });
  files.set(`${CONFIG_DIR}/autosave.json`, future);
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  assert.strictEqual(m.getAutoSaveState().settings.fase, 'valida', 'deve restaurar previous.json');
  assert.strictEqual(
    JSON.parse(files.get(`${CONFIG_DIR}/autosave.json`)).schemaVersion,
    99,
    'arquivo futuro não pode ser destruído',
  );
});

test('6. SIMULACAO não contamina learning nem banco de PIDs', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const learning = loadTs(path.join(ROOT, 'src/database/learningProfile.ts'));
  const pidBank = loadTs(path.join(ROOT, 'src/database/pidBank.ts'));
  const integration = loadTs(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'));
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  await learning.createLearningProfile(BASE, new Date().toISOString());
  await integration.registerObdQuery(
    BASE,
    {
      tx: '010C',
      rx: '41 0C 1A F8',
      elapsedMs: 12,
      commandStatus: 'OK',
      parsed: parser.parsePidResponse('010C', '41 0C 1A F8'),
    },
    'SIMULACAO',
  );
  const profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.realSamples, 0, 'simulação não pode alimentar aprendizado');
  const bank = await pidBank.readPidConfirmations(BASE);
  assert.strictEqual(bank.length, 0, 'simulação não pode entrar no banco de PIDs');
  m.disposeAutoSave();
});

test('7. CARSCANNER_SEED nunca vira histórico real', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const learning = loadTs(path.join(ROOT, 'src/database/learningProfile.ts'));
  const driveCycles = loadTs(path.join(ROOT, 'src/data/driveCycles.ts'));
  const formatter = loadTs(path.join(ROOT, 'src/meriva/autosaveTxtFormatter.ts'));
  await learning.createLearningProfile(BASE, new Date().toISOString());
  m.updateAutoSaveState((s) => {
    s.driveCycles = driveCycles.INITIAL_DRIVE_CYCLES.slice();
  });
  await m.saveNow('critical');
  const profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.realSamples, 0, 'seed não pode alimentar aprendizado');
  const txt = formatter.formatAutoSaveTxt(m.getAutoSaveState(), {
    appVersion: '1.0.0',
    exportedAt: '2026-10-01 13:00:00',
  });
  assert.ok(txt.includes('fonte=CARSCANNER_SEED'), 'seed deve permanecer identificado como referência');
  assert.ok(!txt.includes('fonte=REAL_OBD'), 'nenhum ciclo seed pode aparecer como REAL');
  m.disposeAutoSave();
});

test('8. REAL + RESPONDEU entra no learning e no banco', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const learning = loadTs(path.join(ROOT, 'src/database/learningProfile.ts'));
  const pidBank = loadTs(path.join(ROOT, 'src/database/pidBank.ts'));
  const integration = loadTs(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'));
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  await learning.createLearningProfile(BASE, new Date().toISOString());

  const query = (raw) => ({
    tx: '010C',
    rx: raw,
    elapsedMs: 12,
    commandStatus: 'OK',
    parsed: parser.parsePidResponse('010C', raw),
  });
  await integration.registerObdQuery(BASE, query('41 0C 1A F8'), 'REAL');
  await integration.registerObdQuery(BASE, query('41 0C 0F A0'), 'REAL');

  const profile = await learning.readLearningProfile(BASE);
  assert.strictEqual(profile.globalSampleCounts.realSamples, 2, 'duas amostras reais');
  const bank = await pidBank.readPidConfirmations(BASE);
  assert.strictEqual(bank.length, 1, 'um PID confirmado');
  assert.strictEqual(bank[0].occurrences, 2, 'ocorrências acumuladas');
  assert.ok(bank[0].firstSeen, 'firstSeen preservado');
  m.disposeAutoSave();
});

test('9. DTC real persiste no módulo existente e no autosave', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const dtcManager = loadTs(path.join(ROOT, 'src/database/dtcManager.ts'));
  await dtcManager.recordDtc(BASE, {
    code: 'P0420',
    status: 'CURRENT',
    firstSeen: '2026-10-01T13:00:00Z',
    lastSeen: '2026-10-01T13:00:00Z',
    occurrences: 1,
    source: 'REAL_OBD',
    historical: false,
  });
  const dtcs = await dtcManager.readDtcs(BASE);
  assert.strictEqual(dtcs[0].code, 'P0420');
  m.updateAutoSaveState((s) => {
    s.dtcs = dtcs;
  });
  await m.saveNow('critical');
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  assert.strictEqual(m.getAutoSaveState().dtcs[0].code, 'P0420', 'DTC deve ser restaurado');
  assert.ok(files.has(`${BASE}/DTC/dtc_records.txt`), 'registro no módulo existente preservado');
});

test('10. exportação TXT legível, sem inventar valores', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const formatter = loadTs(path.join(ROOT, 'src/meriva/autosaveTxtFormatter.ts'));
  const opts = { appVersion: '1.0.0', exportedAt: '2026-10-01 13:00:00' };
  const empty = formatter.formatAutoSaveTxt(m.getAutoSaveState(), opts);
  for (const section of ['[VEHICLE]', '[OBD]', '[LAST READINGS]', '[DTC]', '[HISTORY]', '[LEARNING]', '[SETTINGS]']) {
    assert.ok(empty.includes(section), `seção ausente: ${section}`);
  }
  assert.ok(empty.includes('Modelo: N/D'), 'dados ausentes devem ser N/D');
  assert.ok(empty.includes('Protocolo: N/D'), 'protocolo ausente deve ser N/D');
  assert.ok(empty.includes('Schema: 1'));
  m.updateAutoSaveState((s) => {
    s.obd = { connected: true, protocol: 'ISO 14230-4 KWP', ecuAddress: '11', adapterName: 'OBDII' };
  });
  const filled = formatter.formatAutoSaveTxt(m.getAutoSaveState(), opts);
  assert.ok(filled.includes('ISO 14230-4 KWP'));
  assert.ok(filled.includes('ECU: 11'));
  m.disposeAutoSave();
});

test('11. quota calcula tamanho real dos diretórios', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const quota = loadTs(path.join(ROOT, 'src/storage/quotaManager.ts'));
  await currentFS.writeAsStringAsync(`${BASE}/LOGS/a.csv`, 'x'.repeat(1024 * 1024));
  await currentFS.writeAsStringAsync(`${BASE}/LOGS/sub/b.csv`, 'y'.repeat(512 * 1024));
  const usage = await quota.getStorageUsage(BASE);
  assert.ok(Math.abs(usage.usedMb - 1.5) < 0.01, `uso real esperado 1.5MB, obtido ${usage.usedMb}`);
  assert.strictEqual(usage.limitMb, 2048);
  const breakdown = await quota.getStorageBreakdown(BASE);
  assert.strictEqual(breakdown.LOGS, 1.5);
  m.disposeAutoSave();
});

test('12. debounce agrupa gravações', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'a';
  });
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'b';
  });
  m.updateAutoSaveState((s) => {
    s.settings.fase = 'c';
  });
  assert.strictEqual(files.has(`${CONFIG_DIR}/autosave.json`), false, 'debounce não deve salvar imediatamente');
  await wait(1800); // DEBOUNCE_MS (1500) + folga
  assert.ok(files.has(`${CONFIG_DIR}/autosave.json`), 'autosave deve ocorrer após o debounce');
  const envelope = JSON.parse(files.get(`${CONFIG_DIR}/autosave.json`));
  assert.strictEqual(envelope.payload.settings.fase, 'c', 'só a última alteração deve ser gravada');
  m.disposeAutoSave();
});

test('13. autosave mantém um único TXT histórico e limita a 200 snapshots', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);

  for (let i = 1; i <= 205; i += 1) {
    m.updateAutoSaveState((s) => {
      s.settings.sequence = i;
    });
    await m.saveNow('critical');
  }

  const historyPath = `${CONFIG_DIR}/meriva_smart_autosave_history.txt`;
  assert.ok(files.has(historyPath), 'histórico TXT deve ser criado automaticamente');
  const history = files.get(historyPath);
  const entries = history.split('=== SALVAMENTO_BEGIN ===').slice(1);
  assert.strictEqual(entries.length, 200, 'histórico deve manter exatamente os 200 mais recentes');
  assert.ok(history.includes('NÚMERO: 205'), 'último salvamento deve permanecer');
  assert.ok(!/NÚMERO: 5\n/.test(history), 'salvamentos antigos devem ser removidos');
  assert.strictEqual((history.match(/meriva smart diagnostic/gi) || []).length, 201, 'um cabeçalho + 200 snapshots');
  m.disposeAutoSave();
});

test('15. Saved At é persistido e histórico crítico é coalescido', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => { s.settings.fase = 'critico'; });
  m.scheduleCriticalSave(20);
  m.scheduleCriticalSave(20);
  await wait(60);
  const envelope = JSON.parse(files.get(`${CONFIG_DIR}/autosave.json`));
  assert.ok(envelope.savedAt, 'envelope deve ter savedAt');
  assert.strictEqual(envelope.payload.metadata.savedAt, envelope.savedAt, 'payload e envelope devem compartilhar savedAt');
  const history = files.get(`${CONFIG_DIR}/meriva_smart_autosave_history.txt`);
  assert.strictEqual((history.match(/=== SALVAMENTO_BEGIN ===/g) || []).length, 1, 'eventos críticos próximos devem gerar um snapshot');
  m.disposeAutoSave();
});

test('17. estado desconectado preserva ECU e separa último protocolo', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => {
    s.obd = {
      connected: true,
      protocol: 'ISO 14230-4 KWP FAST',
      lastKnownProtocol: 'ISO 14230-4 KWP FAST',
      ecuAddress: '0x11',
      ecuValidatedAt: '2026-10-08T10:00:00Z',
      ecuValidationSource: 'OBD_RESPONSE',
    };
  });
  await m.saveNow('critical');
  m.updateAutoSaveState((s) => {
    s.obd = { ...s.obd, connected: false, protocol: undefined, lastKnownProtocol: s.obd.protocol ?? s.obd.lastKnownProtocol };
  });
  await m.saveNow('critical');
  m.disposeAutoSave();
  await m.initAutoSave(BASE);
  const restored = m.getAutoSaveState().obd;
  assert.strictEqual(restored.connected, false);
  assert.strictEqual(restored.protocol, undefined);
  assert.strictEqual(restored.lastKnownProtocol, 'ISO 14230-4 KWP FAST');
  assert.strictEqual(restored.ecuValidatedAt, '2026-10-08T10:00:00Z');
  assert.strictEqual(restored.ecuValidationSource, 'OBD_RESPONSE');
  m.disposeAutoSave();
});

test('18. polling automático atualiza lastReadings sem contaminar learning', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  const integration = loadTs(path.join(ROOT, 'src/meriva/autosaveIntegration.ts'));
  const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'));
  const autoTripSource = fs.readFileSync(path.join(ROOT, 'src/trip/autoTripService.ts'), 'utf8');
  assert.match(autoTripSource, /recordAutomaticObdQuery\(fuelLevelResult/);
  assert.match(autoTripSource, /recordAutomaticObdQuery\(fuelResult/);
  assert.match(autoTripSource, /recordAutomaticObdQuery\(speedResult/);
  assert.match(autoTripSource, /recordAutomaticObdQuery\(telemetryResult/);

  integration.recordAutomaticObdQuery({
    tx: '010C',
    rx: '41 0C 0F A0',
    elapsedMs: 12,
    commandStatus: 'OK',
    parsed: parser.parsePidResponse('010C', '41 0C 0F A0'),
  }, 'REAL');

  const reading = m.getAutoSaveState().lastReadings.find((item) => item.pid === '010C');
  assert.ok(reading, 'polling automático deve atualizar lastReadings');
  assert.strictEqual(reading.value, 1000, '010C deve refletir a amostra automática mais recente');
  assert.strictEqual(reading.source, 'REAL');

  integration.recordAutomaticObdQuery({
    tx: '010C',
    rx: '41 0C 13 88',
    elapsedMs: 12,
    commandStatus: 'OK',
    parsed: parser.parsePidResponse('010C', '41 0C 13 88'),
  }, 'REAL');
  const latest = m.getAutoSaveState().lastReadings.find((item) => item.pid === '010C');
  assert.strictEqual(latest.value, 1250, 'nova amostra deve substituir a anterior por PID');
  assert.strictEqual(m.getAutoSaveState().settings.simulationQueries, 0, 'polling real não pode virar simulação');
  m.disposeAutoSave();
});

test('16. salvamento redundante não cria novo snapshot histórico', async () => {
  const m = manager();
  m.disposeAutoSave();
  resetFS();
  await m.initAutoSave(BASE);
  m.updateAutoSaveState((s) => { s.settings.fase = 'uma-vez'; });
  await m.saveNow('critical');
  const first = files.get(`${CONFIG_DIR}/meriva_smart_autosave_history.txt`);
  await m.saveNow('critical');
  const second = files.get(`${CONFIG_DIR}/meriva_smart_autosave_history.txt`);
  assert.strictEqual(second, first, 'snapshot idêntico não deve duplicar o histórico');
  m.disposeAutoSave();
});

test('14. persistência local de Bluetooth/ECU não conflita com o autosave', async () => {
  const state = manager();
  state.disposeAutoSave();
  resetFS();
  await state.initAutoSave(BASE);
  state.updateAutoSaveState((s) => {
    s.obd = {
      connected: true,
      adapterName: 'OBDII',
      protocol: 'ISO 14230-4 KWP FAST',
      ecuAddress: '0x11',
      ecuValidatedAt: '2026-10-07T22:25:06.831Z',
      ecuValidationSource: 'VEHICLE_PROFILE',
      lastConnectedAt: '2026-10-07T22:25:06.831Z',
    };
  });
  await state.saveNow('critical');
  state.disposeAutoSave();
  await state.initAutoSave(BASE);
  const restored = state.getAutoSaveState().obd;
  assert.strictEqual(restored.adapterName, 'OBDII');
  assert.strictEqual(restored.ecuAddress, '0x11');
  assert.strictEqual(restored.ecuValidationSource, 'VEHICLE_PROFILE');
  state.disposeAutoSave();
});

// ---------- executor ----------
async function main() {
  let failed = 0;
  for (const { name, fn } of TESTS) {
    try {
      await fn();
      console.log(`PASS  ${name}`);
    } catch (cause) {
      failed++;
      console.error(`FAIL  ${name}`);
      console.error(`      ${cause && cause.message ? cause.message : cause}`);
    }
  }
  console.log(
    failed === 0
      ? `\n${TESTS.length} testes: TODOS PASSARAM`
      : `\n${TESTS.length} testes: ${failed} FALHARAM`,
  );
  process.exitCode = failed === 0 ? 0 : 1;
}

main();