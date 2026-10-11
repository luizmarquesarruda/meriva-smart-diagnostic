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
console.log('PASS privacidade: VIN, MAC e nomes de dispositivo redigidos em exportações');
