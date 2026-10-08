'use strict';

const fs = require('fs');
const path = require('path');
const root = path.resolve(__dirname, '..');

const shared = fs.readFileSync(path.join(root, 'src', 'obd', 'sharedConnection.ts'), 'utf8');
const elm = fs.readFileSync(path.join(root, 'src', 'obd', 'elm327.ts'), 'utf8');
const autoTrip = fs.readFileSync(path.join(root, 'src', 'trip', 'autoTripService.ts'), 'utf8');

if (!shared.includes("ecuResponseState") || !shared.includes("'NO_RESPONSE'") || !shared.includes("'RECOVERING'")) {
  throw new Error('estado separado da ECU não encontrado');
}
if (!elm.includes("async recoverProtocol()") || !elm.includes("async keepAlive()")) {
  throw new Error('recuperação/keep-alive do ELM ausente');
}
if (!autoTrip.includes("ADAPTADOR OK / ECU SEM RESPOSTA")) {
  throw new Error('polling automático não pausa diante de perda de resposta da ECU');
}

console.log('ecuHealth.test.js: OK');
