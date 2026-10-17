'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');
const app = JSON.parse(read('app.json'));
const plugin = read('plugins/withObdForegroundService.js');
const service = read('plugins/obdForegroundServiceTemplates/ObdForegroundService.java');
const bridge = read('plugins/obdForegroundServiceTemplates/ObdForegroundServiceModule.java');
const pkg = read('plugins/obdForegroundServiceTemplates/ObdForegroundServicePackage.java');
const wrapper = read('src/obd/nativeObdForegroundService.ts');
const connection = read('src/obd/sharedConnection.ts');

function main() {
  assert.ok(
    app.expo.plugins.some((entry) =>
      entry === './plugins/withObdForegroundService'
      || (Array.isArray(entry) && entry[0] === './plugins/withObdForegroundService')),
    'app.json must register the config plugin',
  );
  assert.match(plugin, /withAndroidManifest/);
  assert.match(plugin, /withMainApplication/);
  assert.match(plugin, /withDangerousMod/);
  assert.match(plugin, /FOREGROUND_SERVICE_CONNECTED_DEVICE/);
  assert.match(plugin, /foregroundServiceType.*connectedDevice/);
  assert.match(plugin, /ObdForegroundServicePackage\(\)/);
  assert.match(plugin, /__APP_PACKAGE__/);
  assert.match(plugin, /Could not locate Kotlin package declaration/);

  assert.match(service, /extends Service/);
  assert.match(service, /ACTION_START/);
  assert.match(service, /ACTION_STOP/);
  assert.match(service, /startForeground/);
  assert.match(service, /FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE/);
  assert.match(service, /NotificationChannel/);
  assert.match(service, /START_NOT_STICKY/);
  assert.match(bridge, /getName\(\)[\s\S]*ObdForegroundService/);
  assert.match(bridge, /startForegroundService/);
  assert.match(pkg, /new ObdForegroundServiceModule/);

  assert.match(wrapper, /NativeModules\.ObdForegroundService/);
  assert.match(wrapper, /NATIVE_MODULE_MISSING/);
  assert.match(connection, /startNativeObdForegroundService/);
  assert.match(connection, /stopNativeObdForegroundService/);

  // Safety boundary: the foreground service keeps a visible lifecycle lease.
  // It must not create a second Bluetooth socket or issue vehicle commands.
  assert.doesNotMatch(service + bridge, /BluetoothSocket|createRfcommSocket|010C|ATSP|sendCommand|queryPid/i);
  console.log('obdForegroundServicePlugin: CNG registration, Android service lifecycle and single-socket boundary passed');
}

main();
