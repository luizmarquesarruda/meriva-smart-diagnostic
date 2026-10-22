const assert = require('assert');
const fs = require('fs');

const ts = require('typescript');
const source = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
const policySource = fs.readFileSync('src/permissions/permissionPolicy.ts', 'utf8');
const policyJs = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const policyModule = { exports: {} };
new Function('exports', 'module', policyJs)(policyModule.exports, policyModule);
const { canStartObdStartup, canUseGps } = policyModule.exports;
assert.equal(canStartObdStartup({ bluetooth: 'GRANTED', location: 'DENIED' }), true, 'GPS negado não pode bloquear o diagnóstico OBD');
assert.equal(canStartObdStartup({ bluetooth: 'DENIED', location: 'GRANTED' }), false, 'Bluetooth negado deve bloquear o início do OBD');
assert.equal(canUseGps({ location: 'DENIED' }), false, 'GPS deve permanecer indisponível sem permissão');
assert.equal(canUseGps({ location: 'GRANTED' }), true, 'GPS só fica disponível com permissão concedida');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert(source.includes('BLUETOOTH_CONNECT'));
assert(source.includes('BLUETOOTH_SCAN'));
assert(source.includes('requestForegroundPermissionsAsync'));
assert(source.includes('APP_PRIVATE'));
const storageSource = fs.readFileSync('src/meriva/exportAutoSaveTxt.ts', 'utf8') + fs.readFileSync('src/obd/exportBluetoothDiagnosticTxt.ts', 'utf8');
assert(storageSource.includes('StorageAccessFramework') || storageSource.includes('Storage Access Framework'));
assert(layout.includes('requestAllRequiredPermissions'));
assert(layout.includes('canStartObdStartup'));
assert(layout.includes('canUseGps'));
assert(!layout.includes('requestBluetoothPermissions'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_CONNECT'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_SCAN'));
assert(appJson.expo.android.permissions.includes('ACCESS_FINE_LOCATION'));
assert(appJson.expo.android.permissions.includes('ACCESS_BACKGROUND_LOCATION'));
assert(source.includes('requestBackgroundLocationPermissionsOnly'));
assert(source.includes('requestBackgroundPermissionsAsync'));

console.log('permissionManager: OK');


const permissionManager = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
assert(permissionManager.includes('export async function requestBluetoothPermissionsOnly'));
const bluetoothManager = fs.readFileSync('src/obd/bluetoothManager.ts', 'utf8');
assert(bluetoothManager.includes('requestBluetoothPermissionsOnly'));
assert(!bluetoothManager.includes('PermissionsAndroid.requestMultiple'), 'bluetoothManager não deve duplicar a implementação de permissões');

const permissionSource = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
assert(permissionSource.includes('export async function requestAllRequiredPermissions'));
assert(permissionSource.includes('export async function requestLocationPermissionsOnly'));
assert(!permissionSource.includes('audit.bluetooth = await requestBluetoothPermissionsOnly'));
