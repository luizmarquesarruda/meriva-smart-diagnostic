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