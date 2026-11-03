'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const theme = fs.readFileSync(path.join(root, 'src/ui/theme.ts'), 'utf8');
assert.match(theme, /screen:\s*'#07111f'/);
assert.match(theme, /surface:\s*'#0e1b2d'/);
assert.match(theme, /SCREEN_TITLE_STYLE/);

function relativeLuminance(hex) {
  const normalized = hex.replace('#', '');
  const channels = normalized.length === 3
    ? normalized.split('').map((part) => parseInt(part + part, 16) / 255)
    : [0, 2, 4].map((index) => parseInt(normalized.slice(index, index + 2), 16) / 255);
  const linear = channels.map((channel) => channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}
function contrastRatio(foreground, background) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
function getColorToken(name) {
  const line = theme.split('\n').find((entry) => entry.trimStart().startsWith(name + ':'));
  assert.ok(line, 'token de cor ausente: ' + name);
  const match = line.match(/'(#[0-9a-fA-F]{3,8})'/);
  assert.ok(match, 'valor hexadecimal ausente para token: ' + name);
  return match[1];
}
const sharedBorder = getColorToken('border');
assert.ok(contrastRatio(sharedBorder, getColorToken('screen')) >= 3, 'borda deve ter contraste >= 3:1 no fundo principal');
assert.ok(contrastRatio(sharedBorder, getColorToken('surface')) >= 3, 'borda deve ter contraste >= 3:1 na superfície');
assert.ok(contrastRatio(sharedBorder, getColorToken('surfaceRaised')) >= 3, 'borda deve ter contraste >= 3:1 na superfície elevada');
assert.ok(contrastRatio(getColorToken('textSubtle'), getColorToken('screen')) >= 4.5, 'texto auxiliar deve ter contraste >= 4,5:1');

const screens = [
  'app/index.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx',
  'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx',
  'app/bluetooth.tsx', 'app/armazenamento.tsx', 'app/configuracoes.tsx',
  'app/laboratorio.tsx', 'app/testes-sensores.tsx', 'app/conectividade.tsx', 'app/manutencao.tsx',
];
const sharedPaletteLiterals = [
  '#07111f', '#0e1b2d', '#111c2e', '#091626', '#28415f',
  '#e5edf7', '#f8fafc', '#fff', '#ffffff', '#9fb4cf',
  '#7185a1', '#7db3ff', '#2563eb', '#4ade80', '#fbbf24', '#fb7185',
];
for (const file of screens) {
  const source = fs.readFileSync(path.join(root, file), 'utf8');
  assert.doesNotMatch(source, /border(?:Top|Bottom|Left|Right)?Color\s*:\s*['"]#[0-9a-fA-F]{3,8}['"]/i, file + ' deve usar tokens de borda do tema');
  assert.match(source, /from ['"]\.\.\/src\/ui\/theme['"]/, file + ' deve importar o tema comum');
  assert.match(source, /COLORS\.screen/, file + ' deve usar o fundo comum da tela');
  for (const literal of sharedPaletteLiterals) {
    assert.ok(
      !source.includes("'" + literal + "'") && !source.includes('"' + literal + '"'),
      file + ' deve consumir tokens do tema compartilhado, não duplicar ' + literal,
    );
  }
  if (file !== 'app/index.tsx') {
    assert.match(source, /SCREEN_TITLE_STYLE/, file + ' deve usar o título comum');
  }
}
const lab = fs.readFileSync(path.join(root, 'app/laboratorio.tsx'), 'utf8');
assert.doesNotMatch(lab, /#eef3fb|backgroundColor:\s*'#fff'|color:\s*'#1f2937'/i,
  'o laboratório não pode voltar à paleta clara incompatível com o app');
const app = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
assert.equal(app.expo.userInterfaceStyle, 'dark', 'barras/controles do sistema devem seguir o tema escuro');
const navBarPlugin = app.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-navigation-bar');
assert.ok(navBarPlugin, 'barra inferior Android deve estar configurada pelo plugin Expo');
assert.equal(navBarPlugin[1].backgroundColor, '#07111f', 'barra inferior deve usar o fundo escuro');
assert.equal(navBarPlugin[1].barStyle, 'light', 'botões nativos devem ter contraste claro no fundo escuro');
const cockpit = fs.readFileSync(path.join(root, 'app/index.tsx'), 'utf8');
assert.match(cockpit, /<StatusBar style="light" backgroundColor=\{COLORS\.screen\} \/>/,
  'status bar superior deve usar ícones claros sobre o fundo escuro');
const layout = fs.readFileSync(path.join(root, 'app/_layout.tsx'), 'utf8');
assert.match(layout, /headerStyle:\s*\{\s*backgroundColor:\s*COLORS\.screen/);
assert.match(layout, /headerTintColor:\s*COLORS\.accent/);
console.log('Shared screen theme and title contract: PASS');
