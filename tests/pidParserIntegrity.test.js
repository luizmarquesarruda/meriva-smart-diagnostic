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

const compactParsed = parser.parsePidResponse('010C', '410C1AF8');
assert.deepEqual(compactParsed.rawBytes, [0x41, 0x0C, 0x1A, 0xF8],
  'resposta compacta deve preservar os bytes brutos para auditoria');
assert.equal(parser.parsePidResponse('010C', '410C1AF8').value, 1726,
  'resposta compacta sem espaços deve continuar compatível');
assert.equal(parser.parsePidResponse('010C', '410C1AF8FF').status, 'VALOR NÃO INTERPRETADO',
  'resposta compacta com bytes excedentes deve ser rejeitada');
assert.equal(parser.parsePidResponse('010C', '41 0C 1A').status, 'VALOR NÃO INTERPRETADO',
  'payload truncado não pode virar leitura válida');
assert.equal(parser.parsePidResponse('010C', '41 0C 1A F8 FF').status, 'VALOR NÃO INTERPRETADO',
  'byte excedente no mesmo quadro deve ser rejeitado');
assert.equal(parser.parsePidResponse('010C', '48 6B 10 41 0C 1A F8 22').value, 1726,
  'envelope legado K-Line com checksum deve continuar aceito');
assert.equal(parser.parsePidResponse('010C', '486B10410C1AF822').value, 1726,
  'envelope K-Line compacto deve continuar aceito quando o ELM desativa espaços');
assert.equal(parser.parsePidResponse('010C', '48 6B 10 41 0C 1A F8 82').status, 'VALOR NÃO INTERPRETADO',
  'checksum aditivo incorreto deve ser rejeitado');
assert.equal(parser.parsePidResponse('010C', '486B10410C1AF82299').status, 'VALOR NÃO INTERPRETADO',
  'envelope K-Line compacto não pode ignorar bytes após o checksum');
assert.equal(parser.parsePidResponse('010C', '7E804410C1AF8').value, 1726,
  'resposta CAN compacta deve validar o ID e o DLC antes do payload');
assert.equal(parser.parsePidResponse('010C', '18DAF11004410C1AF8').value, 1726,
  'resposta CAN compacta com ID estendido deve ser aceita');
assert.equal(parser.parsePidResponse('010C', '7E806410C1AF8').status, 'VALOR NÃO INTERPRETADO',
  'DLC CAN divergente do tamanho do quadro não pode ser aceito');
assert.equal(parser.parsePidResponse('010C', 'DEADBEEF410C1AF8').status, 'VALOR NÃO INTERPRETADO',
  'prefixo hexadecimal arbitrário não pode ser tratado como cabeçalho CAN');
assert.equal(parser.parsePidResponse('010C', '18DAF110 04 41 0C 1A F8').value, 1726,
  'cabeçalho CAN espaçado com ID estendido deve ser aceito');
assert.equal(parser.parsePidResponse('010C', '7E8 06 41 0C 1A F8').status, 'VALOR NÃO INTERPRETADO',
  'DLC incorreto em cabeçalho CAN espaçado deve ser rejeitado');
assert.equal(parser.parsePidResponse('010C', 'DE AD BE EF 41 0C 1A F8').status, 'VALOR NÃO INTERPRETADO',
  'bytes arbitrários antes da resposta não podem ser confundidos com cabeçalho');
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
const sparkStatus = parser.parsePidResponse('0101', '41 01 80 13 21 00');
assert.equal(sparkStatus.status, 'RESPONDEU');
assert.match(sparkStatus.interpretation, /MIL=ON/);
assert.match(sparkStatus.interpretation, /MISFIRE/);
assert.match(sparkStatus.interpretation, /CATALISADOR/);
assert.match(sparkStatus.interpretation, /O2/);
assert.doesNotMatch(sparkStatus.interpretation, /EVAP/,
  'bit de EVAP não deve ser inferido quando o mapa diz que EVAP não foi suportado');

const dieselStatus = parser.parsePidResponse('0101', '41 01 00 19 29 00');
assert.match(dieselStatus.interpretation, /MOTOR=DIESEL\/CI/);
assert.match(dieselStatus.interpretation, /CATALISADOR_NMHC/);
assert.match(dieselStatus.interpretation, /PRESSAO_TURBO/);
assert.match(dieselStatus.interpretation, /SENSOR_GASES_ESCAPE/);
assert.doesNotMatch(dieselStatus.interpretation, /EVAP|CATALISADOR_AQUECIDO/,
  'byte C/D tem semântica diferente em motores diesel');

const completeSparkMonitors = parser.parsePidResponse('0101', '41 01 00 00 21 21');
assert.match(completeSparkMonitors.interpretation, /INCOMPLETOS=NENHUM/,
  'D=1 significa monitor concluído, não incompleto');
const incompleteSparkMonitors = parser.parsePidResponse('0101', '41 01 00 00 21 00');
assert.match(incompleteSparkMonitors.interpretation, /CATALISADOR/);
assert.match(incompleteSparkMonitors.interpretation, /O2/);

const unsupportedCommon = parser.parsePidResponse('0101', '41 01 00 10 00 FF');
assert.match(unsupportedCommon.interpretation, /INCOMPLETOS=NENHUM/,
  'bit de incompletude não informa monitor se o bit de suporte estiver desligado');

assert.equal(parser.parsePidResponse('010C', '41 0C 1A F8').value, 1726,
  'RPM Mode 01 deve aplicar (A*256+B)/4');
assert.equal(parser.parsePidResponse('0110', '41 10 03 E8').value, 10,
  'MAF deve aplicar (A*256+B)/100 g/s');
assert.equal(parser.parsePidResponse('0114', '41 14 6A 80').value, 0.53,
  'PID 0114 usa o byte A para tensão e exige dois bytes de payload');
const o2Trim = parser.parsePidResponse('0114', '41 14 6A 76');
assert.equal(o2Trim.value, 0.53, 'PID 0114 mantém a tensão baseada apenas no byte A');
assert.equal(o2Trim.interpretation, 'AJUSTE CURTO B1S1=-7.81%',
  'PID 0114 deve expor o ajuste de curto prazo do byte B separadamente');
assert.equal(
  parser.parsePidResponse('0114', '41 14 6A FF').interpretation,
  'AJUSTE CURTO B1S1=NÃO USADO (B=FF)',
  'byte B=FF significa que o sensor não é usado no cálculo do ajuste e não deve virar +99,22%',
);
assert.equal(parser.parsePidResponse('015E', '41 5E 00 C8').value, 10,
  'taxa de combustível deve aplicar (A*256+B)/20 L/h');

console.log('pidParserIntegrity.test.js: PASS — catálogo de PIDs, payloads exatos e limiares de autonomia');
