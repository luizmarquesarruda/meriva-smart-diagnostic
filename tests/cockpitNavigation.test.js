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
assert.doesNotMatch(index, /href="\/saude"/, 'Saúde continua como página secundária; o cockpit não duplica a página');
assert.doesNotMatch(index, /SAÚDE DO VEÍCULO/, 'o cockpit deve usar o espaço para informar a coleta em tempo real');
assert.ok(index.includes('href="/bluetooth"'), 'status da conexão no cabeçalho deve abrir o gerenciamento Bluetooth');
assert.doesNotMatch(more, /'\/bluetooth'/, 'Bluetooth deve ter um único ponto de entrada no chip de conexão');
for (const route of ['/dados', '/aprendizado', '/saude', '/armazenamento', '/configuracoes', '/testes-sensores']) {
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
assert.match(index, /TODOS OS RECURSOS/, 'a barra inferior deve ter o acesso Todos os Recursos');
assert.match(index, /bottomNavLandscape/, 'navegação principal não deve desaparecer em paisagem');
for (const label of ['PAINEL', 'DIAGNÓSTICO', 'VIAGENS', 'VEÍCULO', 'TODOS OS RECURSOS']) {
  assert.ok(index.includes('>' + label + '</Text>') || index.includes('>' + label + '<'), 'barra principal deve expor ' + label);
}
assert.ok(index.includes('size={layout.landscape ? 30 : 40}'), 'ícones da barra inferior devem ter o dobro do tamanho-base');
assert.match(index, /sessionCard/, 'o cockpit deve exibir coleta em tempo real no lugar do cartão de saúde duplicado');
console.log('Navegação principal distribuída em cinco acessos: OK');


const rootLayout = read('app/_layout.tsx');
assert.match(rootLayout, /screenOptions=\{\{[\s\S]*?headerShown:\s*false/, 'o Stack global não deve duplicar cabeçalhos desenhados pelas telas');
console.log('Cabeçalho global duplicado desativado: OK');
for (const [file, route] of [['app/laboratorio.tsx', '/'], ['app/armazenamento.tsx', '/mais'], ['app/configuracoes.tsx', '/mais']]) {
  const source = read(file);
  assert.ok(source.includes('href="' + route + '"'), file + ' deve fornecer retorno visível com o cabeçalho nativo oculto');
  assert.match(source, /accessibilityRole="button"/, file + ' deve rotular o controle de retorno para acessibilidade');
}
console.log('Rotas sem cabeçalho nativo preservam retorno visível: OK');
