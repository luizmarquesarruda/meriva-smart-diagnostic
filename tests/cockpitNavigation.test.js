const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
const more = read('app/mais.tsx');
const laboratory = read('app/laboratorio.tsx');
for (const route of ['/dados', '/mais']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
assert.doesNotMatch(index, /href="\/saude"/, 'saúde detalhada não deve duplicar o cartão na página inicial');
assert.match(more, /'\/saude'/, 'a central de saúde deve continuar acessível em Mais Recursos');
for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
// A settings reload on screen focus must not restart the OBD effect merely
// because readAppSettings returned a fresh object; navigation remains visible
// in both orientations.
assert.doesNotMatch(index, /\}, \[isHydrated, settings\]\);/, 'objeto settings inteiro não pode reiniciar o efeito de conexão');
assert.match(index, /settings\?\.elmMaxConnectionAttempts/, 'efeito deve reagir às opções OBD efetivamente alteradas');
assert.match(index, /bottomNavLandscape/, 'navegação inferior deve continuar disponível em paisagem');
assert.doesNotMatch(index, /!layout\.landscape\s*&&\s*\(/, 'navegação não deve desaparecer ao girar o aparelho');
assert.doesNotMatch(index, /<Text style=\{styles\.bottomNavText\}>/, 'navegação inferior do cockpit deve ser icon-only');
assert.match(index, /bottomNavItem:\{[^}]*minHeight:48/, 'alvo inferior deve ter ao menos 48 dp');
assert.match(index, /accessibilityLabel="Mais recursos"/, 'botão sem legenda visual precisa de nome acessível');
assert.ok(index.includes('href="/conectividade"'), 'cockpit deve expor conectividade 4G/5G');
assert.match(index, /NetworkStatusIndicator/, 'cockpit deve exibir o estado da rede por eventos');
assert.match(index, /AppIcon name="connectivity"/, 'atalho de conectividade deve usar a biblioteca compartilhada');
assert.match(more, /CONECTIVIDADE 4G\/5G/, 'Mais Recursos deve expor a página de conectividade');
const connectivity = read('app/conectividade.tsx');
assert.match(connectivity, /NetInfo\.refresh\(\)/, 'a tela de conectividade deve permitir atualizar o estado sob comando');
assert.match(connectivity, /accessibilityLabel="Atualizar estado da rede"/, 'a ação de atualização deve ter nome acessível');
assert.match(connectivity, /minHeight:48/, 'o botão de atualização deve respeitar alvo mínimo de 48 dp');
assert.match(more, /AppIcon name=\{icon as AppIconName\}/, 'recursos devem usar a biblioteca de ícones compartilhada');
const bluetooth = read('app/bluetooth.tsx');
assert.doesNotMatch(bluetooth, /<Text style=\{styles\.bottomText\}>|<Text style=\{styles\.bottomActiveText\}>/, 'navegação Bluetooth deve ser icon-only');
assert.match(bluetooth, /minHeight:\s*48/, 'botões inferiores Bluetooth devem ter alvo de 48 dp');
assert.match(bluetooth, /accessibilityLabel="Bluetooth, tela atual"/, 'estado atual precisa de rótulo acessível');

const dataScreen = read('app/dados.tsx');
assert.match(dataScreen, /buildTelemetryChart/, 'tela Dados deve usar o modelo de gráfico testável');
assert.match(dataScreen, /getLiveSeries/, 'gráfico ao vivo deve reutilizar a janela de telemetria existente');
assert.match(dataScreen, /source === 'REAL_OBD'/, 'histórico deve excluir viagens simuladas e seeds');
assert.match(dataScreen, /item\.source === 'REAL'/, 'últimas leituras devem excluir origem de simulação');
assert.match(dataScreen, /telemetrySamples/, 'histórico deve reutilizar amostras persistidas por viagem');
assert.match(dataScreen, /VIAGENS SALVAS/, 'tela deve oferecer modo interativo de histórico');
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);
assert.match(more, /CONSULTA MANUAL DE PID/);
assert.match(more, /\/laboratorio/);
assert.match(laboratory, /CONSULTA MANUAL/);
assert.match(laboratory, /PIDs REGISTRADOS \/ DESCOBERTOS/);
assert.match(laboratory, /state\.pidDiscovery\?\.supportedPids/);
assert.match(laboratory, /setSupportedPids\(existing\.supportedPids\)/);
assert.match(laboratory, /PID inválido/);
assert.match(laboratory, /setPid\(value\)/);
console.log('Cockpit e telas secundárias: OK');