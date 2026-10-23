const assert = require('node:assert/strict');
const fs = require('node:fs');

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const index = fs.readFileSync('app/index.tsx', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const midLayout = fs.readFileSync('src/ui/midLayout.ts', 'utf8');
const tripService = fs.readFileSync('src/trip/autoTripService.ts', 'utf8');
const screenFiles = [
  'app/mais.tsx', 'app/dados.tsx', 'app/saude.tsx', 'app/veiculo.tsx',
  'app/viagens.tsx', 'app/aprendizado.tsx', 'app/bluetooth.tsx',
  'app/armazenamento.tsx', 'app/configuracoes.tsx', 'app/laboratorio.tsx',
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
assert.doesNotMatch(index, /ScrollView/);
assert.match(index, /content:\{flex:1,width:'100%'/);
assert.match(index, /maxContentWidth/);
assert.match(index, /const rpmReading/);
assert.match(index, /coolantValue/);
assert.match(index, /setInterval\(\s*\(\) => \{\s*setActiveHeroMetric/, 'a rotação automática deve usar um timer de ciclo de vida');
assert.match(index, /10_000/);
assert.doesNotMatch(index, /VELOCIDADE GPS/, 'GPS não deve ocupar um dos quatro indicadores rotativos principais');
assert.match(index, /label: 'TEMPERATURA DO MOTOR'/);
assert.match(index, /label: 'VOLTAGEM DO SISTEMA'/);
assert.match(index, /label: 'POSIÇÃO DA BORBOLETA'/);
assert.match(index, /label: 'ROTAÇÃO DO MOTOR'/);
const heroStart = index.indexOf('const heroMetrics = [');
const heroEnd = index.indexOf('];', heroStart);
assert.ok(heroStart >= 0 && heroEnd > heroStart, 'lista de indicadores rotativos deve existir');
const heroBlock = index.slice(heroStart, heroEnd);
assert.equal((heroBlock.match(/\{ label:/g) || []).length, 4, 'cockpit deve manter quatro indicadores rotativos');
assert.doesNotMatch(index, /SAÚDE DO VEÍCULO|ABRIR CENTRAL DE SAÚDE/, 'não duplicar a central de saúde na página inicial');
assert.match(index, /danger:\{color:'#fb7185'\}/, 'alerta térmico deve mudar a cor sem encolher o valor principal');
assert.match(index, /!connectionStatus\.ecuConnected \? 'N\/D'/, 'não declarar ausência de DTC como normal sem ECU conectada');
assert.match(index, /POSIÇÃO DA BORBOLETA/);
assert.match(index, /VOLTAGEM DO SISTEMA/);
assert.match(index, /heroSwitchHint/);
assert.match(index, /item\.source !== 'REAL'/);
assert.match(index, /item\.pid === '0142'/);
assert.match(tripService, /telemetryCandidates = pollingPolicy\.polling\.rotatingTelemetryPids/);
assert.match(index, /item\.pid === '0111'/);
assert.match(index, /item\.pid === '010C'/);
assert.match(index, /priorityHeroMetricIndex != null[\s\S]*?: \(current \+ 1\) % Math\.max\(1, heroMetrics\.length\)/, 'a anomalia térmica deve prevalecer, mantendo a rotação quando normal');
assert.match(index, /priorityHeroMetricIndex = coolantValue != null && coolantValue >= 110/);
assert.match(index, /Indicador prioritário devido à temperatura alta/);
assert.match(index, /locationLabelsKey/);
assert.match(index, /setLocationLabelIndex/);
assert.match(index, /activeHeroMetric \+ 1\}\/\{heroMetrics\.length\}/, 'contador visual deve usar o mesmo total dinâmico');
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
