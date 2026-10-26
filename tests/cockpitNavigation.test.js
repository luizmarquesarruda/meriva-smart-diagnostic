const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
const more = read('app/mais.tsx');
const settingsScreen = read('app/configuracoes.tsx');
const previewComponent = read('src/ui/FlootLayoutPreview.tsx');
const laboratory = read('app/laboratorio.tsx');
assert.match(laboratory, /AGUARDANDO CONEXÃO ELM327/, 'tela OBD não deve chamar Bluetooth pronto quando a ECU ainda não está conectada');
assert.match(laboratory, /getSharedObdConnection\(\) \? 'ECU CONECTADA \/ DIAGNÓSTICO DISPONÍVEL' : 'AGUARDANDO CONEXÃO ELM327'/, 'estado inicial deve refletir a conexão real');
assert.match(laboratory, /disabledButton/, 'botão de desconexão precisa ter estilo visual explícito quando desabilitado');
assert.match(laboratory, /ELM327 DESCONECTADO/, 'botão desabilitado deve comunicar que não existe sessão ativa');
assert.match(laboratory, /paddingBottom: 132/, 'conteúdo rolável deve reservar espaço para a navegação inferior fixa');
// RG-15: six primary icon-only destinations; secondary modules stay in Mais Recursos.
const bottomNavStart = index.indexOf('<View style={[styles.bottomNav,');
assert.ok(bottomNavStart >= 0, 'cockpit deve manter a navegação principal');
const bottomNavEnd = index.indexOf('</View>', bottomNavStart);
assert.ok(bottomNavEnd > bottomNavStart, 'navegação principal deve ter contêiner completo');
const bottomNav = index.slice(bottomNavStart, bottomNavEnd);
for (const route of ['/bluetooth', '/saude', '/viagens', '/laboratorio', '/configuracoes']) {
  assert.ok(bottomNav.includes('href="' + route + '"'), 'navegação principal deve expor ' + route);
}
assert.ok(index.includes('href="/conectividade"'), 'cockpit deve expor o detalhe da rede');
assert.ok(more.includes("'/dados'"), 'Dados/Telemetria deve continuar acessível em Mais Recursos');
assert.match(more, /DADOS E TELEMETRIA/, 'atalho secundário deve identificar Dados/Telemetria');
assert.ok(settingsScreen.includes('href="/mais"'), 'Configurações deve manter acesso a Mais Recursos');
assert.match(settingsScreen, /accessibilityLabel="Abrir mais recursos"/, 'o acesso a Mais Recursos deve ter rótulo acessível');
assert.ok(bottomNav.includes('href="/saude"') && bottomNav.includes('accessibilityLabel="Diagnóstico"'), 'Diagnóstico deve ser destino primário acessível');
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
assert.equal(bottomNav.includes('<Text'), false, 'navegação principal deve usar somente ícones, sem legendas visíveis');
for (const label of ['Painel, tela atual', 'Conexões Bluetooth e ECU', 'Diagnóstico', 'Viagem', 'Laboratório', 'Configurações']) {
  assert.ok(bottomNav.includes('accessibilityLabel="' + label + '"'), 'destino deve manter rótulo acessível: ' + label);
}
assert.ok(index.includes('bottomNavItem:{') && index.includes('minHeight:60'), 'alvos da navegação principal devem ter pelo menos 60 dp');
assert.doesNotMatch(index, /actionGrid|dashboardAction/, 'não repetir Diagnóstico, Dados e Viagens em uma segunda fileira');
assert.match(index, /styles\.sessionCard/, 'cockpit deve ter cartão acionável de conexão/ECU');
assert.match(index, /accessibilityLabel="Abrir configurações de conexão do veículo"/, 'cartão de conexão precisa de nome acessível');
assert.match(index, /ECU DESCONECTADA/, 'não usar OFFLINE genérico para representar a ECU');
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
assert.match(index, /networkChipLandscape:\{[^}]*minHeight:50,[^}]*maxWidth:92/, 'cartão de rede permanece compacto em paisagem');
assert.match(networkIndicator, /internetStatus: \{ fontSize: 10/, 'estado da internet deve usar tipografia legível em uma segunda linha');
assert.match(networkIndicator, /INTERNET OK/);
assert.match(networkIndicator, /SEM INTERNET/);
assert.ok(index.includes('href="/conectividade"'), 'cockpit deve expor conectividade 4G/5G');
assert.match(index, /NetworkStatusIndicator/, 'cockpit deve exibir o estado da rede por eventos');
assert.ok(index.includes('href="/conectividade"'), 'estado de internet deve abrir a tela detalhada de conectividade');
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

assert.equal(fs.existsSync(path.join(ROOT, 'app/floot-layout.tsx')), false, 'prévia Floot não deve ser registrada como rota Expo de produção');
assert.ok(previewComponent.includes('All vehicle readings remain N/D'), 'componente de prévia deve manter a ausência explícita de dados simulados');
assert.ok(previewComponent.includes('ECU DESCONECTADA'), 'prévia não deve declarar ECU conectada');
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