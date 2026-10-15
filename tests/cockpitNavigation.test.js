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
