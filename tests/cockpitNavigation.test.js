const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
const layout = read('app/_layout.tsx');
for (const route of ['/dados', '/saude', '/mais']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
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
assert.match(layout, /headerLeft:\s*\(\)\s*=>/, 'telas secundárias devem usar um botão superior comum');
assert.match(layout, /accessibilityLabel="Página inicial"/, 'o botão superior deve ter um rótulo acessível');
assert.match(layout, /router\.replace\(['"]\/['"]\)/, 'o botão superior deve substituir a rota pela inicial');
assert.match(layout, /headerBackVisible:\s*false/, 'o retorno padrão deve ser à página inicial, sem duplicar a seta voltar');
assert.match(layout, /name="bluetooth"/, 'Bluetooth deve usar o Stack comum e cabeçalho padrão');
assert.match(layout, /headerStyle:\s*\{\s*backgroundColor:\s*cockpitTheme\.background\s*\}/, 'a barra superior deve usar o fundo do cockpit');
assert.match(layout, /headerTitle:\s*''/, 'o título da rota não deve duplicar o título do conteúdo');
assert.match(layout, /name="index" options=\{\{ headerShown: false \}\}/, 'o cockpit inicial deve continuar sem cabeçalho secundário');
const secondaryNavigationFiles = [
  'app/mais.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/veiculo.tsx',
  'app/viagens.tsx', 'app/aprendizado.tsx', 'app/bluetooth.tsx',
  'app/armazenamento.tsx', 'app/configuracoes.tsx', 'app/laboratorio.tsx',
  'app/testes-sensores.tsx',
];
for (const file of secondaryNavigationFiles) {
  const source = read(file);
  assert.doesNotMatch(source, /<Link\s+href=["']\/["']/, file + ' não deve duplicar o botão global de página inicial');
  assert.match(source, /CockpitScreenHeader/, file + ' deve usar o cabeçalho compartilhado do cockpit');
  assert.match(source, /cockpitTheme/, file + ' deve usar os tokens visuais compartilhados');
  assert.match(source, /edges=\{\[["']bottom["'],["']left["'],["']right["']\]\}/, file + ' deve deixar a Safe Area superior para o Stack');
}
assert.match(read('src/ui/CockpitScreenHeader.tsx'), /accessibilityRole="header"/);
assert.match(read('src/ui/cockpitTheme.ts'), /background: '#07111f'/);
const dashboard = read('app/index.tsx');
assert.match(dashboard, /accessibilityLabel="Bluetooth e conexão OBD"/, 'botão Bluetooth deve continuar acessível sem legenda visual');
assert.match(dashboard, /accessibilityLabel="Mais recursos"/, 'botão Mais Recursos deve continuar acessível sem legenda visual');
assert.match(dashboard, /bottomNavIcon:\s*\{fontSize:\s*22\}/, 'botões inferiores devem usar ícones maiores');
assert.doesNotMatch(dashboard, /bottomNavText|bottomNavActiveText/, 'a barra inferior não deve renderizar legendas visíveis');
console.log('Cockpit e telas secundárias: OK');