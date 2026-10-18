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
assert.ok(iconModule.includes("color === '#e8b54b'"), 'gold accent should remain available for Meriva-themed highlights');

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
  ['app/bluetooth.tsx', ['AppIcon name="vehicle"', 'AppIcon name="bluetooth"']],
  ['app/saude.tsx', ['AppIcon name="diagnostics"']],
  ['app/veiculo.tsx', ['AppIcon name="bluetooth"']],
  ['app/dados.tsx', ['AppIcon name="sensors"']],
  ['app/aprendizado.tsx', ['AppIcon name="health"']],
];

for (const [file, requiredSnippets] of screens) {
  const source = read(file);
  assert.ok(source.includes("../src/ui/AppIcon"), `${file} must import the shared icon module`);
  for (const snippet of requiredSnippets) {
    assert.ok(source.includes(snippet), `${file} is missing icon usage: ${snippet}`);
  }
}

console.log('Modern Meriva icon catalogue: structural contracts passed.');
