const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
const more = read('app/mais.tsx');
for (const route of ['/mais', '/laboratorio', '/viagens', '/veiculo']) {
  assert.ok(index.includes('href="' + route + '"'), 'navegação principal deve expor ' + route);
}
assert.doesNotMatch(index, /href="\/dados"/, 'dados ao vivo devem ficar no menu Mais recursos, sem atalho duplicado no cockpit');
assert.doesNotMatch(index, /href="\/saude"/, 'Saúde deve ter entrada única em Mais recursos; o card do painel é informativo');
for (const route of ['/dados', '/aprendizado', '/saude', '/bluetooth', '/armazenamento', '/configuracoes', '/testes-sensores']) {
  assert.ok(more.includes("'" + route + "'"), 'Mais recursos deve preservar acesso a ' + route);
}
assert.doesNotMatch(more, /'\/(viagens|veiculo)'/, 'Viagens e Veículo pertencem à navegação principal, sem duplicação em Mais recursos');
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
console.log('Cockpit e telas secundárias: OK');
assert.match(index, /TODOS OS RECURSOS/, 'cockpit deve manter o acesso secundário ao menu de recursos');
assert.match(index, /bottomNavLandscape/, 'navegação principal não deve desaparecer em paisagem');
for (const label of ['PAINEL', 'DIAGNÓSTICO', 'VIAGENS', 'VEÍCULO']) {
  assert.ok(index.includes('>' + label + '</Text>') || index.includes('>' + label + '<'), 'barra principal deve expor ' + label);
}
console.log('Navegação principal sem rotas duplicadas: OK');


const rootLayout = read('app/_layout.tsx');
assert.match(rootLayout, /screenOptions=\{\{[\s\S]*?headerShown:\s*false/, 'o Stack global não deve duplicar cabeçalhos desenhados pelas telas');
console.log('Cabeçalho global duplicado desativado: OK');
