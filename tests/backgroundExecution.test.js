const assert = require('assert');
const fs = require('fs');

const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
const appJson = JSON.parse(fs.readFileSync('app.json', 'utf8'));
const gps = fs.readFileSync('src/gps/gpsTracker.ts', 'utf8');
const task = fs.readFileSync('src/gps/backgroundLocationTask.ts', 'utf8');
const monitoring = fs.readFileSync('src/gps/backgroundMonitoring.ts', 'utf8');
const shared = fs.readFileSync('src/obd/sharedConnection.ts', 'utf8');
const layout = fs.readFileSync('app/_layout.tsx', 'utf8');
const keepAwakePackage = require('../package.json').dependencies['expo-keep-awake'];
const permissions = fs.readFileSync('src/permissions/permissionManager.ts', 'utf8');
const lock = JSON.parse(fs.readFileSync('package-lock.json', 'utf8'));

assert.strictEqual(packageJson.dependencies['expo-task-manager'], '~11.8.2');
assert.strictEqual(lock.packages[''].dependencies['expo-task-manager'], '~11.8.2');
assert.strictEqual(lock.packages['node_modules/expo-task-manager'].version, '11.8.2');
assert.strictEqual(keepAwakePackage, '~13.0.2');
assert.strictEqual(lock.packages[''].dependencies['expo-keep-awake'], '~13.0.2');
assert.strictEqual(lock.packages['node_modules/expo-keep-awake'].version, '13.0.2');
assert(layout.includes("import { useKeepAwake } from 'expo-keep-awake'"));
assert(layout.includes("useKeepAwake('meriva-smart-diagnostic-active')"));
assert.strictEqual(lock.packages['node_modules/unimodules-app-loader'].version, '4.6.0');

assert(appJson.expo.android.permissions.includes('ACCESS_BACKGROUND_LOCATION'));
const locationPlugin = appJson.expo.plugins.find((plugin) => Array.isArray(plugin) && plugin[0] === 'expo-location');
assert(locationPlugin, 'expo-location deve estar configurado como config plugin');
assert.strictEqual(locationPlugin[1].isAndroidBackgroundLocationEnabled, true);
assert.strictEqual(locationPlugin[1].isAndroidForegroundServiceEnabled, true);

assert(task.includes('TaskManager.defineTask(BACKGROUND_LOCATION_TASK_NAME'));
assert(task.includes('gpsTracker.handleLocation(location)'));
assert(gps.includes("BACKGROUND_LOCATION_TASK_NAME = 'meriva-smart-background-location'"));
assert(gps.includes('startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME'));
assert(gps.includes('foregroundService:'));
assert(gps.includes('this.subscription?.remove();'));
assert(gps.includes('this.subscription = null;'));
assert(gps.includes('notificationTitle: \'MERIVA SMART — Diagnóstico OBD\''));
assert(gps.includes('handleLocation(location: Location.LocationObject)'));
assert(gps.includes('stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK_NAME)'));
assert(!gps.includes('if (!this.backgroundTaskRunning) return;'), 'stop deve consultar o TaskManager mesmo após recriação do JS');
assert(gps.includes('watchPositionAsync('));

assert(permissions.includes('requestBackgroundLocationPermissionsOnly'));
assert(permissions.includes('requestBackgroundPermissionsAsync'));
assert(monitoring.includes('startBackgroundMonitoring'));
assert(monitoring.includes('stopBackgroundMonitoring'));
assert(shared.includes('startBackgroundMonitoring()'));
assert(shared.includes('stopBackgroundMonitoring()'));
assert(layout.includes("import '../src/gps/backgroundLocationTask';"));

console.log('background execution: Android FGS + TaskManager + lifecycle: OK');
