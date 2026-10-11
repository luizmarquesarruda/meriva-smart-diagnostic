'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const ts = require('typescript');
const Module = require('module');

const sourcePath = path.join(__dirname, '..', 'src', 'storage', 'privacyRedaction.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const { redactSensitiveIdentifiers } = mod.exports;
const vin = '1HGCM82633A004352';
const mac = '12:34:56:78:9A:BC';
const exported = redactSensitiveIdentifiers(
  `VIN: ${vin}\nMAC: ${mac}\nAdaptador: Luiz OBD\nDEVICE: Meu celular\nModelo: Meriva Maxx\n`,
);
assert(!exported.includes(vin), 'VIN não deve sair em texto exportado');
assert(!exported.includes(mac), 'endereço Bluetooth não deve sair em texto exportado');
assert(!exported.includes('Luiz OBD'), 'nome personalizado do adaptador não deve sair');
assert(!exported.includes('Meu celular'), 'nome do dispositivo não deve sair');
assert(exported.includes('Meriva Maxx'), 'dados técnicos não sensíveis devem ser preservados');

const legacyTxt = redactSensitiveIdentifiers(
  'VIN: 1HGCM82633A004352\\nIdentificação ECU: SERIAL-123-PRIVATE\\nNome ECU: ECU de Luiz\\nAdaptador: Luiz OBD\\nselectedAdapterAddress: A1:B2:C3:D4:E5:F6\\nModelo: Meriva Maxx\\n',
);
for (const privateValue of ['1HGCM82633A004352', 'SERIAL-123-PRIVATE', 'ECU de Luiz', 'Luiz OBD', 'A1:B2:C3:D4:E5:F6']) {
  assert(!legacyTxt.includes(privateValue), 'legacy TXT não deve exportar identificador: ' + privateValue);
}
assert(legacyTxt.includes('Modelo: Meriva Maxx'));



const structuredTrace = redactSensitiveIdentifiers(
  JSON.stringify({
    deviceName: 'Adaptador com nome pessoal',
    selectedAdapterAddress: 'A1:B2:C3:D4:E5:F6',
    adapterName: 'OBD particular',
    adapterAddress: 'A1:B2:C3:D4:E5:F6',
  }),
);
assert(!structuredTrace.includes('Adaptador com nome pessoal'), 'deviceName estruturado deve ser redigido');
assert(!structuredTrace.includes('OBD particular'), 'adapterName estruturado deve ser redigido');
assert(!structuredTrace.includes('A1:B2:C3:D4:E5:F6'), 'endereços em campos estruturados devem ser redigidos');
const formatter = fs.readFileSync(path.join(__dirname, '..', 'src', 'meriva', 'autosaveTxtFormatter.ts'), 'utf8');
for (const forbidden of [
  'or(state.vehicle?.vin)',
  'or(state.obd?.adapterName)',
  'or(state.obd?.ecuIdentification)',
  'or(state.obd?.ecuName)',
]) {
  assert(!formatter.includes(forbidden), `autosave TXT não deve imprimir identificadores brutos: ${forbidden}`);
}
assert(formatter.includes('VIN: [OMITIDO POR PRIVACIDADE]'));
assert(formatter.includes('Adaptador: [NOME OMITIDO POR PRIVACIDADE]'));
assert(formatter.includes('VIN: [OMITIDO POR PRIVACIDADE]'));
assert(formatter.includes('!/(vin|mac|address|device.?name|adapter.?name|serial|ecu.?identification)/i.test(key)'), 'settings de identificação devem ser omitidas do TXT');

const bluetoothManager = fs.readFileSync(path.join(__dirname, '..', 'src', 'obd', 'bluetoothManager.ts'), 'utf8');
assert(bluetoothManager.includes('sanitizeDiagnosticDetails(details)'), 'trace não deve armazenar nomes/endereço sem redação');

console.log('PASS privacidade: identificadores ocultados em exportação e trace TXT');
