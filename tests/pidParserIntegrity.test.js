'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadTs(file, overrides = {}) {
  const source = fs.readFileSync(file, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
    },
  }).outputText;
  const mod = new Module(file, null);
  mod.filename = file;
  mod.paths = Module._nodeModulePaths(path.dirname(file));
  const originalLoad = Module._load;
  Module._load = function (request, parent, isMain) {
    if (parent && parent.filename === file && Object.prototype.hasOwnProperty.call(overrides, request)) {
      return overrides[request];
    }
    return originalLoad.apply(this, arguments);
  };
  try {
    mod._compile(output, file);
  } finally {
    Module._load = originalLoad;
  }
  return mod.exports;
}

const formulaEngine = loadTs(path.join(ROOT, 'src/obd/formulaEngine.ts'));
const pidDefinition = loadTs(path.join(ROOT, 'src/obd/pidDefinition.ts'), {
  './formulaEngine': formulaEngine,
});
const parser = loadTs(path.join(ROOT, 'src/obd/parser.ts'), {
  './pidDefinition': pidDefinition,
  './formulaEngine': formulaEngine,
  './dtcParser': { parseDtcResponseForService: () => [] },
});
const catalog = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/knowledge/pids.json'), 'utf8'));

for (const definition of catalog.pids) {
  const payload = Array(definition.bytes).fill('00').join(' ');
  const response = `41 ${definition.pid.slice(-2)} ${payload}`;
  const parsed = parser.parsePidResponse(definition.pid, response);
  assert.equal(parsed.status, 'RESPONDEU',
    `PID ${definition.pid} deve aceitar exatamente ${definition.bytes} byte(s): ${response}; ${parsed.errorMessage ?? ''}`);
  assert.equal(parsed.rawBytes.length, definition.bytes + 2,
    `PID ${definition.pid} deve preservar serviço/PID e payload no log bruto`);
  assert.ok(Number.isFinite(parsed.value), `PID ${definition.pid} deve produzir valor finito`);
}

assert.equal(parser.parsePidResponse('010C', '41 0C 1A').status, 'VALOR NÃO INTERPRETADO',
  'payload truncado não pode virar leitura válida');
assert.equal(parser.parsePidResponse('010C', '41 0C 1A F8 FF').status, 'VALOR NÃO INTERPRETADO',
  'byte excedente no mesmo quadro deve ser rejeitado');
assert.equal(parser.parsePidResponse('010C', '48 6B 10 41 0C 1A F8 82').value, 1726,
  'envelope legado K-Line com checksum deve continuar aceito');
assert.equal(parser.parsePidResponse('010C', '7E8 04 41 0C 1A F8').status, 'RESPONDEU',
  'cabeçalho CAN/ELM antes da resposta não pode contaminar os bytes do PID');
assert.equal(parser.parsePidResponse('010C', 'SEARCHING...\r\n41 0C 1A F8\r\n>').status, 'RESPONDEU',
  'mensagens de estado do adaptador não podem alterar o payload válido');

const fuelConsumption = loadTs(path.join(ROOT, 'src/obd/fuelConsumption.ts'));
const tripRecorder = loadTs(path.join(ROOT, 'src/trip/tripRecorder.ts'), {
  '../obd/fuelConsumption': fuelConsumption,
});
const { getReliableTripConsumptionKml } = tripRecorder;
assert.equal(getReliableTripConsumptionKml(0.05, 0.01, 1), null,
  'distância e combustível insuficientes não devem produzir consumo');
assert.equal(getReliableTripConsumptionKml(0.2, 0.049, 2), null,
  'combustível abaixo de 0,05 L não deve alimentar a autonomia');
assert.equal(getReliableTripConsumptionKml(0.2, 0.05, 1), null,
  'uma única amostra válida não confirma consumo');
assert.equal(getReliableTripConsumptionKml(0.09, 0.05, 2), null,
  'distância abaixo de 0,1 km não confirma consumo');
assert.equal(getReliableTripConsumptionKml(0.2, 0.05, 2), 4,
  'consumo passa a ser válido somente após os limiares mínimos');
assert.equal(getReliableTripConsumptionKml(Number.NaN, 0.05, 2), null,
  'distância inválida não pode produzir consumo');
assert.equal(getReliableTripConsumptionKml(0.2, Number.POSITIVE_INFINITY, 2), null,
  'combustível não finito não pode produzir consumo');

const formulaVectors = [
  ['U8', [42], 42],
  ['U16', [1, 2], 258],
  ['RPM', [0x1A, 0xF8], 1726],
  ['TEMP_C', [0x69], 65],
  ['PERCENT_255', [255], 100],
  ['FUEL_TRIM', [255], 99.21875],
  ['MAF_GS', [3, 232], 10],
  ['TIMING_DEG', [128], 0],
  ['VOLTS_1000', [0x34, 0xB0], 13.488],
  ['O2_VOLTS', [0x6A, 0x80], 0.53],
  ['DISTANCE_KM', [0x12, 0x34], 4660],
  ['FUEL_RATE_LH', [0, 200], 10],
  ['ETHANOL_PERCENT', [255], 100],
  ['U8_X3', [42], 126],
  ['U16_SCALE_255', [0, 255], 100],
  ['U16_X10', [1, 2], 2580],
  ['INJECTION_TIMING', [0x69, 0x80], 1],
  ['TORQUE_PERCENT', [125], 0],
  ['U16_DIV_32768', [0x80, 0], 1],
  ['U32', [1, 2, 3, 4], 16909060],
];
for (const [formulaId, bytes, expected] of formulaVectors) {
  const actual = formulaEngine.applyFormula(formulaId, bytes);
  assert.ok(Math.abs(actual - expected) < 1e-9,
    `fórmula ${formulaId}: esperado ${expected}, recebido ${actual}`);
}
assert.equal(parser.parsePidResponse('010C', '41 0C 1A F8').value, 1726,
  'RPM Mode 01 deve aplicar (A*256+B)/4');
assert.equal(parser.parsePidResponse('0110', '41 10 03 E8').value, 10,
  'MAF deve aplicar (A*256+B)/100 g/s');
assert.equal(parser.parsePidResponse('0114', '41 14 6A 80').value, 0.53,
  'PID 0114 usa o byte A para tensão e exige dois bytes de payload');
assert.equal(parser.parsePidResponse('015E', '41 5E 00 C8').value, 10,
  'taxa de combustível deve aplicar (A*256+B)/20 L/h');

console.log('pidParserIntegrity.test.js: PASS — catálogo de PIDs, payloads exatos e limiares de autonomia');
