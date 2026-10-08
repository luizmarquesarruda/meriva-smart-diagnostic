const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert(source.includes('BLUETOOTH_CONNECT'));
assert(source.includes('BLUETOOTH_SCAN'));
assert(source.includes('requestForegroundPermissionsAsync'));
assert(source.includes('APP_PRIVATE'));
const storageSource = fs.readFileSync('src/meriva/exportAutoSaveTxt.ts', 'utf8') + fs.readFileSync('src/obd/exportBluetoothDiagnosticTxt.ts', 'utf8');
assert(storageSource.includes('StorageAccessFramework') || storageSource.includes('Storage Access Framework'));
assert(layout.includes('requestAllRequiredPermissions'));
assert(!layout.includes('requestBluetoothPermissions'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_CONNECT'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_SCAN'));
assert(appJson.expo.android.permissions.includes('ACCESS_FINE_LOCATION'));
assert(appJson.expo.android.permissions.includes('ACCESS_BACKGROUND_LOCATION'));
assert(permissionManager.includes('requestBackgroundLocationPermissionsOnly'));
assert(permissionManager.includes('requestBackgroundPermissionsAsync'));

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
