const fs = require('fs');
const path = require('path');

const json = fs.readFileSync(path.join(__dirname, '..', 'src', 'knowledge', 'ecu.json'), 'utf8');
const policy = JSON.parse(json);

if (policy.ecu.family !== 'Multec H-X14YFH') throw new Error('ECU alvo incorreta.');
if (policy.ecu.address !== '0x11') throw new Error('Endereço ECU observado incorreto.');
if (policy.ecu.baudRate !== 10400) throw new Error('Baud rate observado incorreto.');
if (policy.elm327.validation.requiredPid !== '010C') throw new Error('PID de validação incorreto.');
if (policy.elm327.validation.positiveResponsePrefix !== '41 0C') throw new Error('Resposta positiva incorreta.');
if (policy.protocolFallback.map((item) => item.elmProtocol).join(',') !== '5,3,4,6,7,8,9') {
  throw new Error('Ordem de fallback ECU incorreta.');
}
if (!policy.rules.canFallbackOnlyAfterKLineFailure) throw new Error('CAN deve permanecer fallback após K-Line.');
if (!policy.rules.rawTxRxMustBePreserved) throw new Error('TX/RX bruto deve ser preservado.');
if (!policy.rules.doNotGuessProprietaryCommands) throw new Error('Comandos proprietários não podem ser adivinhados.');
const manager = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'bluetoothManager.ts'), 'utf8');
if (!manager.includes('getEcuPolicy') || !manager.includes('validateEcuPolicy') || !manager.includes('session.initialize(ecuPolicy.elm327.initialization)')) {
  throw new Error('bluetoothManager deve carregar a política ECU JSON durante a inicialização.');
}
const session = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'elm327.ts'), 'utf8');
if (!session.includes('initialize(initializationCommands?: string[])') || !session.includes('...configuredInitialization')) {
  throw new Error('Elm327Session deve aceitar os comandos de inicialização fornecidos pela política ECU.');
}
if (!policy.elm327.initialization.includes('ATSP0')) throw new Error('ATSP0 deve vir da política ECU.');

console.log('ecu policy: alvo, protocolo observado e validação 010C conferidos');
console.log('ecu policy: fallback K-Line -> CAN conferido');
console.log('ecu policy: regras de evidência e segurança conferidas');
