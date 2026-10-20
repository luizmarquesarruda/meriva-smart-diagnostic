const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
for (const route of ['/dados', '/mais']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
assert.match(read('app/mais.tsx'), /['\"]\/saude['\"]/ , 'central de saúde deve permanecer acessível em Mais Recursos');
assert.doesNotMatch(index, /SAÚDE DO VEÍCULO/, 'cockpit não deve duplicar o cartão de saúde');
for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
assert.match(read('app/dados.tsx'), /getLivePidTrend/);
assert.match(read('app/dados.tsx'), /formatSparkline/);
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);

const navMatch = index.match(/<View\s+style=\{\[styles\.bottomNav,[\s\S]*?<\/View>/);
assert.ok(navMatch, 'a navegação principal deve existir no rodapé');
const nav = navMatch[0];
assert.match(nav, /accessibilityRole="tablist"/);
for (const [href, label] of [
  ['/', 'Início'],
  ['/laboratorio', 'Diagnóstico'],
  ['/dados', 'Dados em tempo real'],
  ['/viagens', 'Viagens'],
  ['/mais', 'Mais recursos'],
]) {
  assert.ok(nav.includes('href="' + href + '"') && nav.includes('accessibilityLabel="' + label + '"'),
    'atalho inferior deve existir e manter nome acessível: ' + label);
}
assert.doesNotMatch(nav, /bottomNavText/);
assert.match(index, /bottomNavItem:\{[^}]*minHeight:54/);
assert.match(index, /accessibilityLabel="Navegação principal"/);

console.log('Cockpit e navegação inferior: OK');