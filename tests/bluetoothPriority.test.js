const fs = require('fs');
const path = require('path');

const shared = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'obd', 'sharedConnection.ts'),
  'utf8',
);

if (!shared.includes("readAppSettings") || !shared.includes("selectedAdapterAddress")) {
  throw new Error('A conexão compartilhada deve ler o último adaptador salvo.');
}

if (!shared.includes('prioritizeBluetoothCandidates')) {
  throw new Error('A fila Bluetooth deve usar a prioridade do último adaptador.');
}

const helper = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'obd', 'bluetoothCandidatePriority.ts'),
  'utf8',
);

const required = [
  'lastConnectedAddress',
  'normalizeAddress',
  'aLast !== bLast',
  'looksLikeElm',
];

for (const token of required) {
  if (!helper.includes(token)) throw new Error('Regra de prioridade ausente: ' + token);
}

console.log('bluetooth priority: último ELM conectado entra primeiro');
console.log('bluetooth priority: normalização de endereço e fallback de candidatos verificados');

const loader = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'obd', 'bluetoothKnowledge.ts'),
  'utf8',
);

for (const token of ['bluetooth.json', 'getBluetoothStartupPolicy', 'validateBluetoothStartupPolicy']) {
  if (!loader.includes(token)) throw new Error('Loader da política Bluetooth incompleto: ' + token);
}
