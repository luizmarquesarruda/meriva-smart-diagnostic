const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
assert.ok(index.includes('/saude'), 'cockpit deve preservar o atalho para saúde');
assert.ok(index.includes('href="/mais"'), 'Mais recursos deve continuar acessível pelo cabeçalho');
const bottomNav = read('src/ui/BottomNavigation.tsx');
for (const route of ['/', '/laboratorio', '/testes-sensores', '/armazenamento']) assert.ok(bottomNav.includes(route), 'navegação inferior deve expor ' + route);
const dataScreen = read('app/dados.tsx');
assert.match(dataScreen, /item\.source === 'REAL'/, 'lista de últimas leituras deve excluir simulações');
assert.match(dataScreen, /item\.status === 'RESPONDEU'/, 'leituras sem resposta não devem aparecer como reais');
assert.match(dataScreen, /Number\.isFinite\(item\.value\)/, 'leituras exibidas devem ser finitas');
assert.match(index, /ASSISTENTE DE ECONOMIA/, 'cockpit deve conter o assistente de economia');
assert.doesNotMatch(index, />SAÚDE DO VEÍCULO<\/Text>/, 'painel grande de saúde não deve estar duplicado no cockpit');
assert.match(read('src/obd/fuelCoach.ts'), /referenceMinimumTrips/, 'assistente deve exigir referência pessoal');
assert.match(read('src/obd/fuelCoach.ts'), /referenceSpeedDifferenceRatio/, 'referência deve limitar diferenças de velocidade');
const tripService = read('src/trip/autoTripService.ts');
assert.match(tripService, /instantaneousConsumptionTimestampMs/, 'consumo deve preservar timestamp original da taxa');
assert.match(tripService, /connected: true,\s*active: false,\s*instantaneousConsumptionKml: null,\s*instantaneousConsumptionSource: null,\s*instantaneousConsumptionTimestampMs: null,\s*instantaneousFuelType: null,\s*instantaneousSpeedKmh: null,\s*error: finalizationError/,
  'perda de resposta da ECU deve invalidar imediatamente amostras do coach');
assert.match(tripService, /instantaneousSpeedKmh: tripVehicleSpeedKmh/, 'coach deve usar a velocidade que gerou o km/L');
assert.match(tripService, /instantaneousFuelType: instantaneousConsumptionKml != null \? estimateFuelType : null/,
  'o tipo associado ao cálculo não pode mudar por alteração posterior da configuração');
assert.match(tripService, /const estimateFuelType = this\.recorderFuelType \?\? this\.fuelType/,
  'fórmula de combustível deve permanecer fixa dentro da viagem');
assert.match(read('src/trip/tripRecorder.ts'), /fuelType: this\.fuelType/, 'viagem deve guardar o combustível usado');

// Contrato ergonômico: os quatro destinos mantêm largura uniforme,
// área de toque ampliada e rótulos que não empurram o layout em portrait/landscape.
assert.match(bottomNav, /item:\s*\{[^}]*flex:\s*1,\s*minWidth:\s*0,\s*minHeight:\s*88/, 'destinos devem dividir a largura igualmente e ter alvo de toque ampliado');
assert.match(bottomNav, /bar:\s*\{[^}]*gap:\s*4/, 'destinos devem ter separação visual');
assert.match(bottomNav, /icon:\s*\{[^}]*fontSize:\s*22/, 'ícones de navegação devem ter tamanho legível');
assert.match(bottomNav, /label:\s*\{[^}]*fontSize:\s*10/, 'rótulos de navegação devem ter tamanho legível');
assert.match(bottomNav, /accessibilityRole="button"/, 'destinos precisam continuar expostos como botões acessíveis');
assert.match(bottomNav, /accessibilityState=\{\{ selected \}\}/, 'estado do destino selecionado deve continuar exposto à acessibilidade');

for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx', 'app/testes-sensores.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
assert.match(read('app/dados.tsx'), /getLivePidTrend/);
assert.match(read('app/dados.tsx'), /formatSparkline/);
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);
assert.ok(read('app/armazenamento.tsx').includes('GERAR DIAGNÓSTICO TXT'));
assert.ok(read('app/armazenamento.tsx').includes('GERAR VIAGENS TXT'));
console.log('Cockpit e telas secundárias: OK');
