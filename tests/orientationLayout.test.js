const assert = require('node:assert/strict');
const fs = require('node:fs');

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const index = fs.readFileSync('app/index.tsx', 'utf8');
const cockpitTelemetry = fs.readFileSync('src/obd/cockpitTelemetry.ts', 'utf8');
const pollingPolicy = JSON.parse(fs.readFileSync('src/knowledge/polling_policy.json', 'utf8'));
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const midLayout = fs.readFileSync('src/ui/midLayout.ts', 'utf8');
const tripService = fs.readFileSync('src/trip/autoTripService.ts', 'utf8');
const healthScreen = fs.readFileSync('app/saude.tsx', 'utf8');
const laboratoryScreen = fs.readFileSync('app/laboratorio.tsx', 'utf8');
const storageScreen = fs.readFileSync('app/armazenamento.tsx', 'utf8');
const tripScreen = fs.readFileSync('app/viagens.tsx', 'utf8');
const maintenanceScreen = fs.readFileSync('app/manutencao.tsx', 'utf8');
const settingsScreen = fs.readFileSync('app/configuracoes.tsx', 'utf8');
const dataScreen = fs.readFileSync('app/dados.tsx', 'utf8');
const bluetoothScreen = fs.readFileSync('app/bluetooth.tsx', 'utf8');
const moreScreen = fs.readFileSync('app/mais.tsx', 'utf8');
const configurationScreen = fs.readFileSync('app/configuracoes.tsx', 'utf8');
const screenFiles = [
  'app/mais.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/veiculo.tsx',
  'app/viagens.tsx', 'app/aprendizado.tsx', 'app/bluetooth.tsx',
  'app/armazenamento.tsx', 'app/configuracoes.tsx', 'app/laboratorio.tsx', 'app/manutencao.tsx',
];

// Expo's default orientation means no orientation lock; do not introduce a native portrait/landscape lock.
assert.equal(appJson.expo.orientation, 'default');
assert.equal(packageJson.dependencies['expo-screen-orientation'], '~7.0.5');
assert.match(layout, /import \* as ScreenOrientation from 'expo-screen-orientation'/);
assert.match(layout, /ScreenOrientation\.unlockAsync\(\)/, 'a inicialização deve remover travas de orientação e permitir retrato/paisagem');
assert.match(layout, /addOrientationChangeListener/);
assert.match(layout, /subscription\.remove\(\)/, 'listener de orientação deve ser removido no cleanup');
assert.match(index, /useMidLayout\(\)/);
assert.match(index, /layout\.landscape/);
assert.match(index, /screenFrameLandscape:\{paddingRight:56/, 'paisagem deve reservar espaço na direita para a navegação lateral');
assert.match(index, /topSectionLandscape:\{[^}]*flexDirection:'row'/, 'cabeçalho e clima devem compartilhar a faixa superior em paisagem');
assert.match(index, /mainContentLandscape:\{[^}]*flexDirection:'row'/, 'cockpit e sessão devem dividir a largura em paisagem');
assert.match(index, /sessionCardLandscape:\{width:166/, 'sessão deve usar coluna compacta em telas baixas');
assert.match(index, /bottomNavLandscape:\{position:'absolute',right:0,top:0,bottom:20,width:50,flexDirection:'column'/, 'navegação deve virar uma raia vertical na direita');
assert.match(index, /quadrantCardLandscape:\{minHeight:54,paddingVertical:4/, 'quadrantes devem reduzir altura e espaçamento vertical em paisagem');
assert.match(index, /quadrantGrid:\{width:'100%',flexDirection:'row',flexWrap:'wrap',justifyContent:'space-between',gap:8\}/, 'quadrantes devem manter uma grade responsiva com quebra de linha');
assert.match(index, /quadrantGridLandscape:\{gap:5\}/, 'a grade deve reduzir o espaçamento entre quadrantes em paisagem');
assert.match(index, /styles\.quadrantGrid, layout\.landscape && styles\.quadrantGridLandscape/, 'a grade deve aplicar o estilo específico de paisagem');
assert.match(index, /styles\.quadrantCard,\s*layout\.landscape && styles\.quadrantCardLandscape/, 'cada quadrante deve aplicar o estilo específico de paisagem mesmo com JSX multilinha');
assert.match(index, /numberOfLines=\{layout\.landscape \? 1 : 2\}/, 'rótulos e dicas devem limitar linhas em paisagem para evitar clipping');
assert.match(index, /quadrantValueLandscape:\{fontSize:21,lineHeight:22/, 'valores devem reduzir na paisagem com altura compacta de 22 dp');
assert.match(index, /quadrantHintLandscape:\{fontSize:8,lineHeight:9/, 'dicas devem manter tamanho legível em uma linha na paisagem');
assert.match(index, /quadrantHeaderLandscape:\{marginBottom:4/, 'cabeçalho do carrossel deve diminuir em paisagem');
assert.match(index, /quadrantValueRowLandscape:\{marginTop:2,gap:3/, 'respiro do valor deve ser reduzido em paisagem');
assert.match(index, /quadrantInstructionLandscape:\{fontSize:8,lineHeight:10,letterSpacing:0,marginTop:3/, 'instrução do carrossel deve continuar legível em paisagem');
assert.match(index, /cockpitMetricCompact:\{paddingVertical:3,paddingHorizontal:3/, 'consumo/autonomia/pressão devem continuar visíveis em cartões compactos');
assert.match(index, /metricLabelCompact:\{fontSize:8,letterSpacing:0,lineHeight:10/, 'rótulos das métricas auxiliares não devem cair para tipografia quase ilegível');
assert.match(index, /quadrantLabelLandscape:\{fontSize:8,lineHeight:9/, 'rótulos dos quadrantes mantêm tamanho legível em paisagem');
assert.match(index, /metricValueCompact:\{fontSize:11,marginTop:1/, 'valores auxiliares devem caber sem gastar altura excessiva');

assert.match(index, /layoutSpacerLandscape:\{flexGrow:0,minHeight:0,height:4/, 'espaçador não deve consumir a altura útil na paisagem');

assert.doesNotMatch(index, /ScrollView/);
assert.match(index, /content:\{flex:1,width:'100%'/);
assert.match(index, /maxContentWidth/);
assert.match(index, /buildCockpitPidMetrics\(connectedSupportedPids, liveReadings\)/, 'cockpit deve consumir leituras reais e PIDs suportados pela ECU');
assert.match(index, /quadrantDefinitions/, 'o painel deve reservar quadrantes para os quatro indicadores principais');
assert.match(index, /setInterval\(\s*\(\) => \{\s*setActiveQuadrantPage/, 'a paginação automática dos quadrantes deve usar um timer com cleanup');
assert.match(index, /10_000/);
assert.doesNotMatch(index, /VELOCIDADE GPS/, 'GPS não deve ocupar um dos indicadores OBD rotativos principais');
assert.equal(pollingPolicy.cockpit.maxDisplayedPids, 20, 'o cockpit deve suportar até vinte indicadores');
assert.equal(pollingPolicy.cockpit.pidOrder.length, 20, 'a política deve configurar vinte PIDs candidatos');
assert.equal(new Set(pollingPolicy.cockpit.pidOrder).size, 20, 'a lista de PIDs do cockpit não deve conter duplicados');
for (const label of ['TEMPERATURA DO MOTOR', 'VOLTAGEM DO SISTEMA', 'POSIÇÃO DA BORBOLETA', 'ROTAÇÃO DO MOTOR']) {
  assert.ok(cockpitTelemetry.includes("'" + label + "'"), 'definição do cockpit ausente: ' + label);
}
assert.match(index, /const orderedAdditionalMetrics: CockpitPidMetric\[\] = abnormalMetrics\.length > 0/,
  'os alertas adicionais devem ser priorizados dentro do carrossel');
assert.match(index, /const visibleHeroMetrics: CockpitPidMetric\[\] = \[\.\.\.primaryMetrics, \.\.\.orderedAdditionalMetrics\]/,
  'os quatro indicadores principais permanecem na primeira página');
assert.match(index, /Página anterior dos PIDs/);
assert.match(index, /Próxima página dos PIDs/);
assert.match(index, /const heroMetrics: CockpitPidMetric\[\]/, 'lista de indicadores deve ser dinâmica');
assert.doesNotMatch(index, /SAÚDE DO VEÍCULO|ABRIR CENTRAL DE SAÚDE/, 'não duplicar a central de saúde na página inicial');
assert.match(index, /danger:\{color:COLORS\.danger\}/, 'alerta térmico deve usar o token de perigo sem encolher o valor principal');
assert.doesNotMatch(index, /DTC/, 'o cockpit não deve resumir DTC; essa informação pertence à tela Saúde');
assert.ok(cockpitTelemetry.includes("'0111': 'POSIÇÃO DA BORBOLETA'"));
assert.ok(cockpitTelemetry.includes("'0142': 'VOLTAGEM DO SISTEMA'"));
assert.match(index, /quadrantInstruction/);
assert.match(index, /item\.source !== 'REAL'/);
for (const marker of ["'0142': 'VOLTAGEM DO SISTEMA'", "'0111': 'POSIÇÃO DA BORBOLETA'", "'010C': 'ROTAÇÃO DO MOTOR'"]) {
  assert.ok(cockpitTelemetry.includes(marker), 'definição de telemetria ausente: ' + marker);
}
assert.match(tripService, /telemetryCandidates = pollingPolicy\.polling\.rotatingTelemetryPids/);
assert.match(index, /abnormalMetrics\.length > 0/, 'alertas devem ser priorizados na rotação');
assert.match(index, /abnormalMetrics\.includes\(metric\)/, 'anomalias devem ser priorizadas na ordem das páginas');
assert.match(index, /locationLabelsKey/);
assert.match(index, /setLocationLabelIndex/);
assert.match(index, /currentQuadrantPage \+ 1\}\/\{quadrantPageCount\}/, 'contador visual deve seguir a página atual dos quadrantes');
assert.match(index, /href="[^"]*viagens"/);
assert.match(index, /href="[^"]*dados"/);
assert.match(index, /sessionCard/);
assert.match(index, /bottomNavItem/);
assert.match(index, /getCurrentAutonomyRangeKm/);
assert.doesNotMatch(index, /actionGrid|dashboardAction/, 'navegação única não deve duplicar destinos');
assert.match(index, /react-native-safe-area-context/);
assert.match(layout, /SafeAreaProvider/);
assert.match(midLayout, /size\.width > size\.height/);
assert.doesNotMatch(index, /screenOrientation|OrientationLock\.(PORTRAIT|LANDSCAPE)/);

assert.equal((healthScreen.match(/AMOSTRAS COM TIMESTAMP DUPLICADO BLOQUEADAS/g) || []).length, 1, 'Central de Saúde não deve duplicar o contador de timestamps');
assert.equal((healthScreen.match(/AMOSTRAS OBD ATUAIS ACEITAS/g) || []).length, 1, 'Central de Saúde deve exibir uma única linha de amostras aceitas');
assert.equal((healthScreen.match(/blockedStaleDtcs > 0/g) || []).length, 1, 'Central de Saúde deve exibir uma única linha de DTCs antigos');
assert.match(healthScreen, /liveObdStatus\.bluetoothConnected/);
assert.match(healthScreen, /liveObdStatus\.ecuConnected/);
assert.doesNotMatch(healthScreen, /state\.obd\.connected|state\.obd\.ecuValidatedAt/, 'estado atual da conexão não pode vir de campos persistidos');
assert.doesNotMatch(laboratoryScreen, /tripPanel|tripMetric|tripGrid|tripLabel|tripValue|tripHelp|VIAGEM AUTOMÁTICA|DISTÂNCIA GPS|AUTONOMIA ESTIMADA/, 'Laboratório não deve manter painel de viagem repetido nem estilos órfãos');
assert.doesNotMatch(laboratoryScreen, /DIAGNÓSTICO DA IA LOCAL|runLocalDiagnostic|styles\.aiPanel|styles\.hypothesis/, 'Laboratório não deve repetir o motor de hipóteses já apresentado na Central de Saúde');
assert.match(laboratoryScreen, /href=\"\/saude\"/, 'Laboratório deve oferecer atalho para a Central de Saúde canônica');
assert.match(healthScreen, /runLocalDiagnostic/);
assert.match(healthScreen, /HIPÓTESES LOCAIS/, 'Central de Saúde continua apresentando as hipóteses locais');
assert.match(laboratoryScreen, /paddingBottom: 30/, 'Laboratório deve usar margem final normal, sem reservar uma barra inexistente');
assert.doesNotMatch(storageScreen, /VIAGENS SALVAS/, 'armazenamento não deve duplicar a lista da tela Viagens');
assert.match(storageScreen, /href=\"\/viagens\"/, 'armazenamento deve encaminhar para o relatório canônico de viagens');
assert.match(index, /SMART OBD DIAGNOSTIC/, 'cockpit deve usar o nome genérico definido para o aplicativo');
assert.match(tripScreen, /SMART OBD DIAGNOSTIC/, 'telas de relatórios devem manter a mesma marca visual do cockpit');
assert.doesNotMatch(tripScreen, /MERIVA SMART DIAGNOSTIC/, 'uma tela secundária não pode exibir uma marca divergente do cabeçalho do app');
assert.ok(tripScreen.includes('ABRIR ARMAZENAMENTO E EXPORTAÇÃO'), 'atalho de Viagens deve usar o nome canônico da tela de arquivos');
assert.ok(!tripScreen.includes('ABRIR HISTÓRICO E EXPORTAÇÃO'), 'atalho antigo não deve sugerir que Armazenamento ainda contém a lista de viagens');
assert.ok(configurationScreen.includes('href="/veiculo"'), 'configurações deve encaminhar ao perfil canônico do veículo');
assert.ok(!configurationScreen.includes('profile.engine') && !configurationScreen.includes('profile.tankCapacityL') && !configurationScreen.includes('profile.reserveCapacityL'), 'configurações não deve repetir motor, tanque e reserva já mostrados no perfil do veículo');
assert.match(moreScreen, /title: 'ARQUIVOS E EXPORTAÇÃO'/, 'categoria Mais deve descrever armazenamento/exportação, sem duplicar a lista de viagens');
for (const file of screenFiles) {
  const source = fs.readFileSync(file, 'utf8');
  assert.ok(/useMidLayout\(\)/.test(source) || /useWindowDimensions\(\)/.test(source) && /getMidLayout\(windowSize\)/.test(source), file + ' deve usar o layout responsivo centralizado');
  assert.match(source, /paddingHorizontal:layout\.horizontalPadding|paddingHorizontal:\s*layout\.horizontalPadding/, file + ' deve aplicar padding responsivo');
  assert.match(source, /maxWidth:layout\.maxContentWidth|maxWidth:\s*layout\.maxContentWidth/, file + ' deve limitar o conteúdo responsivamente');
  assert.match(source, /react-native-safe-area-context/, file + ' deve usar Safe Area moderna');
  assert.match(source, /<SafeAreaView/, file + ' deve ter SafeAreaView');
  assert.doesNotMatch(source, /import\s*\{[^}]*SafeAreaView[^}]*\}\s*from ['"]react-native['"]/, file + ' não deve usar SafeAreaView legado');
  assert.doesNotMatch(source, /SafeAreaView[^\n]*style=\{styles\.container\}\s*>/, file + ' deve declarar edges explicitamente quando usa o componente');
}
assert.match(midLayout, /export function useMidLayout\(\)/);
assert.match(layout, /screenOptions=\{\{\s*headerShown: false/, 'as rotas usam cabeçalho interno único sem barra nativa duplicada');
assert.match(laboratoryScreen, /VOLTAR AO COCKPIT/, 'Laboratório precisa oferecer retorno visível após ocultar cabeçalho nativo');
assert.match(storageScreen, /VOLTAR AOS RECURSOS/, 'Armazenamento precisa oferecer retorno visível após ocultar cabeçalho nativo');
assert.match(settingsScreen, /VOLTAR AOS RECURSOS/, 'Configurações precisa oferecer retorno visível após ocultar cabeçalho nativo');
assert.match(tripScreen, /tripListLandscape:\s*\{\s*flexDirection:\s*'row',\s*flexWrap:\s*'wrap'/, 'histórico de viagens deve usar grade em paisagem');
assert.match(maintenanceScreen, /taskGridLandscape:\s*\{\s*flexDirection:\s*'row',\s*flexWrap:\s*'wrap'/, 'tarefas de manutenção devem usar duas colunas em paisagem');
assert.match(settingsScreen, /settingsGridLandscape:\s*\{\s*flexDirection:\s*'row',\s*flexWrap:\s*'wrap'/, 'configurações devem reorganizar cartões em paisagem');
assert.match(tripScreen, /layout\.compact\?12:16/, 'Viagens deve consumir o breakpoint compacto');
assert.match(maintenanceScreen, /layout\.compact \? 12 : 14/, 'Manutenção deve consumir o breakpoint compacto');
assert.match(settingsScreen, /layout\.compact \? 12 : 16/, 'Configurações deve consumir o breakpoint compacto');
assert.match(tripScreen, /Math\.min\(valueSize-4,38\)/, 'valor principal do relatório deve usar o tamanho responsivo central');
for (const [name, source] of [['Manutenção', maintenanceScreen], ['Configurações', settingsScreen], ['Dados', dataScreen], ['Bluetooth', bluetoothScreen], ['Laboratório', laboratoryScreen]]) {
  assert.match(source, /minHeight:\s*48/, name + ' deve preservar áreas mínimas de toque');
}

console.log('Rotação livre e proteção responsiva: OK');
