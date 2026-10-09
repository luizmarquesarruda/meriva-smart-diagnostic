const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
for (const route of ['/dados', '/saude', '/mais', '/arrefecimento']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx', 'app/arrefecimento.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
assert.match(read('app/dados.tsx'), /getLivePidTrend/);
assert.match(read('app/dados.tsx'), /formatSparkline/);
assert.match(read('app/arrefecimento.tsx'), /getLivePidTrend\('0105'\)/);
assert.match(read('app/arrefecimento.tsx'), /TEMPERATURA DO LÍQUIDO DE ARREFECIMENTO/);
assert.doesNotMatch(read('app/index.tsx'), /initializeCarScannerSeed/, 'cockpit não deve importar histórico seed do Car Scanner');
assert.match(read('app/armazenamento.tsx'), /filter\(\(cycle\) => cycle\.source === 'REAL_OBD'\)/, 'histórico deve listar apenas viagens reais da ECU');
assert.doesNotMatch(read('app/armazenamento.tsx'), /REF\./, 'histórico não deve exibir badge de viagem importada');
assert.doesNotMatch(read('app/aprendizado.tsx'), /BASE SEED|PESO DO SEED/, 'tela de aprendizado não deve expor métricas do histórico seed');
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);
console.log('Cockpit e telas secundárias: OK');