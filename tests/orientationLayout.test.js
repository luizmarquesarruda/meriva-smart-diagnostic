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
assert.match(index, /screenFrameLandscape:\{paddingLeft:56/, 'paisagem deve reservar uma raia lateral para navegação');
assert.match(index, /topSectionLandscape:\{[^}]*flexDirection:'row'/, 'cabeçalho e clima devem compartilhar a faixa superior em paisagem');
assert.match(index, /mainContentLandscape:\{[^}]*flexDirection:'row'/, 'cockpit e sessão devem dividir a largura em paisagem');
assert.match(index, /sessionCardLandscape:\{width:166/, 'sessão deve usar coluna compacta em telas baixas');
assert.match(index, /bottomNavLandscape:\{position:'absolute',left:0,top:0,bottom:20,width:50,flexDirection:'column'/, 'navegação deve virar uma raia vertical compacta');
assert.match(index, /quadrantCardLandscape:\{minHeight:58,paddingVertical:4/, 'quadrantes devem reduzir espaçamento vertical em paisagem');
assert.match(index, /quadrantValueLandscape:\{fontSize:21,lineHeight:23/, 'valores devem reduzir na paisagem');
assert.match(index, /quadrantHintLandscape:\{fontSize:6/, 'dicas devem usar uma linha na paisagem');
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
assert.match(index, /danger:\{color:'#fb7185'\}/, 'alerta térmico deve mudar a cor sem encolher o valor principal');
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

console.log('Rotação livre e proteção responsiva: OK');
