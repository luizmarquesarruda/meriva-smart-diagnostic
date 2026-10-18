const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');
const manifest = JSON.parse(read('package.json'));
const lock = JSON.parse(read('package-lock.json'));
const iconModule = read('src/ui/AppIcon.tsx');

assert.equal(
  manifest.dependencies['lucide-react-native'],
  '0.468.0',
  'Lucide React Native must stay pinned for reproducible installs',
);
assert.equal(
  lock.packages[''].dependencies['lucide-react-native'],
  manifest.dependencies['lucide-react-native'],
  'package-lock root must match package.json',
);
assert.equal(
  lock.packages['node_modules/lucide-react-native'].version,
  manifest.dependencies['lucide-react-native'],
  'package-lock must contain the pinned icon package',
);
assert.ok(iconModule.includes("from 'lucide-react-native'"));
assert.ok(iconModule.includes("type AppIconBadgeTone"), 'badge colors should use named semantic tones');
assert.ok(iconModule.includes("success: { borderColor: '#28613e'"), 'healthy status should use a dedicated success palette');
assert.ok(iconModule.includes("danger: { borderColor: '#713043'"), 'fault status should use a dedicated danger palette');

const requiredIconMappings = [
  'vehicle: Car',
  'diagnostics: Wrench',
  'sensors: Activity',
  'learning: Brain',
  'health: ShieldCheck',
  'bluetooth: Bluetooth',
  'trips: Route',
  'temperature: Thermometer',
  'resources: LayoutGrid',
];
for (const mapping of requiredIconMappings) {
  assert.ok(iconModule.includes(mapping), `icon catalogue is missing ${mapping}`);
}

const screens = [
  ['app/index.tsx', ['AppIconBadge name="vehicle"', 'AppIcon name="diagnostics"', 'AppIcon name="trips"', 'AppIcon name="temperature"']],
  ['app/mais.tsx', ['AppIconBadge', "['sensors', 'TESTES DE SENSORES'", "['charts', 'DADOS AO VIVO'", "['health', 'SAÚDE'"]],
  ['app/bluetooth.tsx', ['AppIcon name="vehicle"', 'AppIcon name="bluetooth"', 'AppIcon name="connection"', 'AppIcon name="cpu"', 'AppIcon name="activity"', 'styles.labelRow']],
  ['app/saude.tsx', ['AppIcon name="diagnostics"', 'name="bluetooth"', 'name="activity"', 'name="alert"', 'name="learning"', 'sectionHeader']],
  ['app/veiculo.tsx', ['AppIcon name="bluetooth"']],
  ['app/dados.tsx', ['AppIcon name="sensors"', 'name="charts"', 'name="radio"', 'Metric icon="dashboard"', 'Metric icon="trips"', 'Metric icon="fuel"', 'Metric icon="battery"', 'metricHeader', 'sectionHeader']],
  ['app/aprendizado.tsx', ['AppIcon name="health"', 'AppIconBadge name="learning"']],
  ['app/laboratorio.tsx', ['AppIconBadge name="diagnostics"', 'name="bluetooth"', 'name="radio"', "backgroundColor: '#07111f'"]],
  ['app/configuracoes.tsx', ['AppIconBadge name="settings"', 'PAINEL • CONEXÃO • ARMAZENAMENTO', 'name="fuel"', 'name="dashboard"', 'name="bluetooth"', 'name="database"', 'sectionHeader']],
  ['app/armazenamento.tsx', ['AppIconBadge name="history"', 'HISTÓRICO E DADOS']],
  ['app/viagens.tsx', ['AppIconBadge name="trips"', 'RELATÓRIO DE VIAGENS', 'Metric icon="trips"', 'Metric icon="dashboard"', 'Metric icon="fuel"', "AppIcon name=\"forward\""]],
];

const cockpit = read('app/index.tsx');
assert.ok(cockpit.includes('selectedHeroMetric.icon'), 'primary indicator should show its contextual icon');
assert.ok(cockpit.includes('DADOS AO VIVO') && cockpit.includes('TESTES DE SENSORES'), 'cockpit should expose high-frequency shortcuts');
assert.ok(cockpit.includes('accessibilityLabel="Abrir saúde do veículo e revisar evidências"'), 'health summary should be a clear, accessible action');

const resources = read('app/mais.tsx');
assert.ok(resources.includes("width: '48%'") && resources.includes('tileTopRow'), 'resource page should use responsive icon tiles');

const tripReports = read('app/viagens.tsx');
assert.ok(!tripReports.includes('#55d6be') && !tripReports.includes('#176e70'), 'trip reports should use the shared blue/amber visual palette');

for (const [file, requiredSnippets] of screens) {
  const source = read(file);
  assert.ok(source.includes("../src/ui/AppIcon"), `${file} must import the shared icon module`);
  for (const snippet of requiredSnippets) {
    assert.ok(source.includes(snippet), `${file} is missing icon usage: ${snippet}`);
  }
}

console.log('Modern Meriva icon catalogue: structural contracts passed.');
