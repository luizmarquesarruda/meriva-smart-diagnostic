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
assert.match(layout, /name="bluetooth" options=\{\{ title: 'BLUETOOTH \/ ECU' \}\}/, 'Bluetooth também deve exibir o cabeçalho padrão');
assert.match(layout, /name="index" options=\{\{ headerShown: false \}\}/, 'o cockpit inicial deve continuar sem cabeçalho secundário');
const secondaryNavigationFiles = [
  'app/mais.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/veiculo.tsx',
  'app/viagens.tsx', 'app/aprendizado.tsx', 'app/bluetooth.tsx',
  'app/armazenamento.tsx', 'app/configuracoes.tsx', 'app/laboratorio.tsx',
  'app/testes-sensores.tsx',
];
for (const file of secondaryNavigationFiles) {
  assert.doesNotMatch(read(file), /<Link\s+href=["']\/["']/, file + ' não deve duplicar o botão global de página inicial');
}
console.log('Cockpit e telas secundárias: OK');