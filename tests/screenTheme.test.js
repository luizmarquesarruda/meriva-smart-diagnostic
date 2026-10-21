'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'src/ui/theme.ts'), 'utf8');
assert.match(theme, /screen:\s*'#07111f'/);
assert.match(theme, /surface:\s*'#0e1b2d'/);
assert.match(theme, /SCREEN_TITLE_STYLE/);

const screens = [
  'app/index.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx',
  'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx',
  'app/bluetooth.tsx', 'app/armazenamento.tsx', 'app/configuracoes.tsx',
  'app/laboratorio.tsx', 'app/testes-sensores.tsx', 'app/conectividade.tsx',
];
for (const file of screens) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.match(source, /from ['"]\.\.\/src\/ui\/theme['"]/, file + ' deve importar o tema comum');
  assert.match(source, /COLORS\.screen/, file + ' deve usar o fundo comum da tela');
  if (file !== 'app/index.tsx') {
    assert.match(source, /SCREEN_TITLE_STYLE/, file + ' deve usar o título comum');
  }
}
const lab = fs.readFileSync(path.join(root, 'app/laboratorio.tsx'), 'utf8');
assert.doesNotMatch(lab, /#eef3fb|backgroundColor:\s*'#fff'|color:\s*'#1f2937'/i,
  'o laboratório não pode voltar à paleta clara incompatível com o app');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert.equal(app.expo.userInterfaceStyle, 'dark', 'barras/controles do sistema devem seguir o tema escuro');
const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
assert.match(layout, /headerStyle:\s*\{\s*backgroundColor:\s*COLORS\.screen/);
assert.match(layout, /headerTintColor:\s*COLORS\.accent/);
console.log('Shared screen theme and title contract: PASS');
