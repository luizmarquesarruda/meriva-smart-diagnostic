const assert = require('node:assert/strict');
const fs = require('node:fs');

const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
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
assert.match(index, /useMidLayout\(\)/);
assert.match(index, /layout\.landscape/);
assert.match(index, /resourceButtonLandscape/, 'o atalho de recursos deve reduzir altura em paisagem');
assert.match(index, /cockpitMetricCompact/, 'cards secundários devem ser compactados em paisagem');
assert.equal((index.match(/compact=\{layout\.landscape\}/g) || []).length, 3, 'os três indicadores secundários devem usar o modo compacto em paisagem');
assert.doesNotMatch(index, /ScrollView/);
assert.match(index, /content:\{flex:1,width:'100%'/);
assert.match(index, /maxContentWidth/);
assert.match(index, /const rpmReading/);
assert.match(index, /coolantValue/);
assert.match(index, /setInterval\(\s*\(\) => setActiveHeroMetric/, 'a rotação automática deve usar um timer de ciclo de vida');
assert.match(index, /10_000/);
assert.match(index, /VELOCIDADE GPS/);
assert.match(index, /POSIÇÃO DA BORBOLETA/);
assert.match(index, /VOLTAGEM DO SISTEMA/);
assert.match(index, /heroSwitchHint/);
assert.match(index, /item\.source !== 'REAL'/);
assert.match(index, /item\.pid === '0142'/);
assert.match(tripService, /telemetryCandidates = pollingPolicy\.polling\.rotatingTelemetryPids/);
assert.match(index, /item\.pid === '0111'/);
assert.match(index, /item\.pid === '010C'/);
assert.match(index, /setActiveHeroMetric\(\(current\) => \(current \+ 1\) % Math\.max\(1, heroMetrics\.length\)\)/);
assert.match(index, /safeActiveHeroMetric \+ 1\}\/\{heroMetrics\.length\}/, 'contador visual deve usar o mesmo total dinâmico');
assert.match(index, /href="[^"]*viagens"/);
const more = fs.readFileSync('app/mais.tsx', 'utf8');
assert.match(more, /'\/dados'/, 'Dados ao Vivo deve continuar acessível pelo menu Mais recursos');
assert.doesNotMatch(index, /href="\/dados"/, 'Dados não deve reaparecer como segundo atalho de primeiro nível');
assert.match(index, /resourceButton/, 'o cockpit deve ter um único acesso a Mais recursos');
assert.match(index, /actionGridLandscape/);
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
