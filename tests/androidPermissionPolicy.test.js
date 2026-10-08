const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const app = JSON.parse(fs.readFileSync(path.join(ROOT, 'app.json'), 'utf8'));
assert.deepStrictEqual(app.expo.plugins, ['./plugins/withAndroidBluetoothPermissions']);

const plugin = fs.readFileSync(path.join(ROOT, 'plugins', 'withAndroidBluetoothPermissions.js'), 'utf8');
assert(plugin.includes('android.permission.BLUETOOTH'));
assert(plugin.includes('android:maxSdkVersion'));
assert(plugin.includes("'30'"));
assert(plugin.includes('android.permission.BLUETOOTH_SCAN'));
assert(plugin.includes('android:usesPermissionFlags'));
assert(plugin.includes('neverForLocation'));
assert(!plugin.includes('BLUETOOTH_ADVERTISE'));

console.log('androidPermissionPolicy.test.js: PASS');
