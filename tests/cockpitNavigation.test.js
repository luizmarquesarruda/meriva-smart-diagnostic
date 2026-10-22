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
const primaryTabs = read('src/ui/PrimaryTabBar.tsx');
assert.doesNotMatch(index, /!layout\.landscape\s*&&\s*\(/, 'navegação não deve desaparecer ao girar o aparelho');
assert.match(index, /<PrimaryTabBar active="cockpit" \/>/, 'cockpit deve mostrar a navegação principal compartilhada');
for (const [file, active] of [
  ['app/laboratorio.tsx', 'diagnostic'],
  ['app/dados.tsx', 'data'],
  ['app/viagens.tsx', 'trips'],
  ['app/mais.tsx', 'more'],
]) {
  assert.match(read(file), new RegExp('<PrimaryTabBar active="' + active + '" \\/>'), file + ' deve mostrar a navegação principal');
}
for (const route of ['href="/"', 'href="/laboratorio"', 'href="/dados"', 'href="/viagens"', 'href="/mais"']) {
  assert.ok(primaryTabs.includes(route), 'barra principal deve expor ' + route);
}
for (const label of ['Painel', 'Diagnóstico', 'Dados', 'Viagens', 'Mais']) {
  assert.ok(primaryTabs.includes('>' + label + '</Text>'), 'barra principal deve mostrar o rótulo ' + label);
}
assert.match(primaryTabs, /accessibilityRole="tab"/, 'itens de navegação devem expor semântica de aba');
assert.match(primaryTabs, /accessibilityState=\{\{ selected: active === 'cockpit' \}\}/, 'a aba atual deve ser anunciada por tecnologia assistiva');
assert.match(primaryTabs, /minHeight: 58/, 'itens da navegação devem manter alvo tátil alto e consistente');
assert.match(index, /dashboardAction:\{[^}]*minHeight:56/, 'ações principais devem ter altura tátil mínima de 56 dp');
assert.match(index, /accessibilityLabel="Abrir laboratório de diagnóstico OBD"/, 'ação de diagnóstico deve ter nome acessível explícito');
assert.match(index, /accessibilityLabel="Abrir dados em tempo real"/, 'ação de dados deve ter nome acessível explícito');
assert.match(index, /weatherCity:\{[^}]*fontSize:15/, 'cidade/clima deve estar em tamanho legível no retrato');
assert.match(index, /numberOfLines=\{layout\.landscape \? 1 : 2\}/, 'nome de cidade longo deve caber em duas linhas no retrato e uma na paisagem');
assert.match(index, /weatherCity:\{[^}]*lineHeight:18/, 'quebra de linha da cidade deve preservar a hierarquia vertical');
assert.match(index, /weatherTemperature:\{[^}]*fontSize:24/, 'temperatura do clima deve ter destaque visual');
assert.match(index, /weatherDescription:\{[^}]*fontSize:12/, 'condição meteorológica deve ser legível');
assert.match(index, /infoStrip:\{[^}]*minHeight:88/, 'cartão de informações online deve reservar área para os dados');
assert.match(index, /networkChip:\{[^}]*minHeight:64/, 'atalho da rede deve ter altura ampliada para melhorar a leitura');
assert.doesNotMatch(index, /screenFrame:\{[^}]*justifyContent:'space-between'/, 'layout não deve espalhar a rede e o cockpit com grandes lacunas');
assert.match(index, /layoutSpacer:\{flexGrow:1,minHeight:8/, 'a navegação deve permanecer abaixo do conteúdo sem espaçamentos artificiais entre cartões');
const networkIndicator = read('src/ui/NetworkStatusIndicator.tsx');
assert.match(networkIndicator, /label: \{ fontSize: 13/, 'geração Wi-Fi/4G/5G deve ter maior legibilidade no cockpit');
assert.match(networkIndicator, /AppIcon name=\{presentation\.icon\} size=\{20\}/, 'ícone da rede deve ficar visível sem dominar o cartão');
assert.match(index, /buttonText:\{[^}]*fontSize:11/, 'texto dos botões principais deve ficar legível');
assert.match(index, /networkChipLandscape:\{[^}]*minHeight:50,[^}]*maxWidth:92/, 'cartão de rede permanece compacto em paisagem');
assert.match(networkIndicator, /internetStatus: \{ fontSize: 10/, 'estado da internet deve usar tipografia legível em uma segunda linha');
assert.match(networkIndicator, /INTERNET OK/);
assert.match(networkIndicator, /SEM INTERNET/);
assert.ok(index.includes('href="/conectividade"'), 'cockpit deve expor conectividade 4G/5G');
assert.match(index, /NetworkStatusIndicator/, 'cockpit deve exibir o estado da rede por eventos');
assert.match(networkIndicator, /connectivity/, 'indicador de rede deve usar ícone da biblioteca compartilhada');
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