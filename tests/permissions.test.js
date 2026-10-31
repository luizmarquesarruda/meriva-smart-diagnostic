const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const ts = require('typescript');
const policySource = fs.readFileSync('src/permissions/permissionPolicy.ts', 'utf8');
const settingsSource = fs.readFileSync('src/database/appSettings.ts', 'utf8');
const settingsScreen = fs.readFileSync('app/configuracoes.tsx', 'utf8');
const policyJs = ts.transpileModule(policySource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 } }).outputText;
const policyModule = { exports: {} };
new Function('exports', 'module', policyJs)(policyModule.exports, policyModule);
const { canStartObdStartup, canUseGps } = policyModule.exports;
const { applyLegacyBluetoothPermissionLimits } = require('../plugins/withBluetoothLegacyPermissionLimits');
const testManifest = { 'uses-permission': [
  { $: { 'android:name': 'android.permission.BLUETOOTH' } },
  { $: { 'android:name': 'android.permission.BLUETOOTH_ADMIN' } },
  { $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } },
  { $: { 'android:name': 'android.permission.BLUETOOTH_SCAN' } },
] };
applyLegacyBluetoothPermissionLimits(testManifest);
assert.equal(testManifest['uses-permission'][0].$['android:maxSdkVersion'], '30');
assert.equal(testManifest['uses-permission'][1].$['android:maxSdkVersion'], '30');
assert.equal(testManifest['uses-permission'][2].$['android:maxSdkVersion'], undefined);
assert.equal(testManifest['uses-permission'][3].$['android:maxSdkVersion'], undefined);
assert.equal(canStartObdStartup({ bluetooth: 'GRANTED', location: 'DENIED' }), true);
assert.equal(canStartObdStartup({ bluetooth: 'DENIED', location: 'GRANTED' }), false);
assert.equal(canUseGps({ location: 'DENIED' }), false);
assert.equal(canUseGps({ location: 'GRANTED' }), true);


assert(source.includes('BLUETOOTH_CONNECT'));
assert(source.includes('BLUETOOTH_SCAN'));
assert(source.includes('requestForegroundPermissionsAsync'));
assert(source.includes('APP_PRIVATE'));
const storageSource = fs.readFileSync('src/meriva/exportAutoSaveTxt.ts', 'utf8') + fs.readFileSync('src/obd/exportBluetoothDiagnosticTxt.ts', 'utf8');
assert(storageSource.includes('StorageAccessFramework') || storageSource.includes('Storage Access Framework'));
assert(layout.includes('requestBluetoothPermissionsOnly'));
assert(!layout.includes('requestAllRequiredPermissions'), 'a inicialização do app não deve pedir localização junto com Bluetooth');
assert(layout.includes('canStartObdStartup({ bluetooth })'), 'Bluetooth permanece necessário para conexão OBD real');
assert(!layout.includes("throw new Error('PERMISSÃO DE GPS/LOCALIZAÇÃO NÃO CONCEDIDA.')"), 'GPS negado não pode bloquear diagnóstico OBD');
assert(!layout.includes('canUseGps('), 'localização não participa do gate de inicialização OBD');
assert(settingsSource.includes('backgroundGpsEnabled: false'), 'rastreamento em segundo plano deve iniciar desativado até opt-in explícito');
assert(settingsSource.includes('backgroundGpsEnabled: parsed.backgroundGpsEnabled === true'), 'configurações antigas não devem ativar background GPS silenciosamente');
assert(settingsScreen.includes('requestLocationPermissionsOnly()'));
assert(settingsScreen.includes('requestBackgroundLocationPermissionsOnly()'));
assert(settingsScreen.includes('updateBackgroundGpsPreference(v)'));
assert(source.includes('getBackgroundLocationPermissionOnly'), 'a checagem de background no serviço deve ser somente leitura');
assert(appJson.expo.plugins.includes('./plugins/withBluetoothLegacyPermissionLimits'), 'plugin deve limitar permissões Bluetooth legadas no manifest');
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
