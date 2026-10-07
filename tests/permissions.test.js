const assert = require('assert');
const fs = require('fs');

const source = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));

assert(source.includes('BLUETOOTH_CONNECT'));
assert(source.includes('BLUETOOTH_SCAN'));
assert(source.includes('requestForegroundPermissionsAsync'));
assert(source.includes('APP_PRIVATE'));
assert(source.includes('Storage Access Framework') || source.includes('Storage Access Framework'));
assert(layout.includes('requestAllRequiredPermissions'));
assert(!layout.includes('requestBluetoothPermissions'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_CONNECT'));
assert(appJson.expo.android.permissions.includes('BLUETOOTH_SCAN'));
assert(appJson.expo.android.permissions.includes('ACCESS_FINE_LOCATION'));

console.log('permissionManager: OK');
