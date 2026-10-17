'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Module = require('module');

const ROOT = path.resolve(__dirname, '..');
const read = (relativePath) => fs.readFileSync(path.join(ROOT, relativePath), 'utf8');

async function main() {
  const app = JSON.parse(read('app.json'));
  const pluginPath = path.join(ROOT, 'plugins', 'withObdForegroundService.js');
  const pluginSource = read('plugins/withObdForegroundService.js');
  const serviceSource = read('plugins/obdForegroundServiceTemplates/ObdForegroundService.java');
  const bridgeSource = read('plugins/obdForegroundServiceTemplates/ObdForegroundServiceModule.java');
  const packageSource = read('plugins/obdForegroundServiceTemplates/ObdForegroundServicePackage.java');
  const wrapperSource = read('src/obd/nativeObdForegroundService.ts');
  const connectionSource = read('src/obd/sharedConnection.ts');

  assert.ok(
    app.expo.plugins.some((entry) =>
      entry === './plugins/withObdForegroundService'
      || (Array.isArray(entry) && entry[0] === './plugins/withObdForegroundService')),
    'app.json must register the config plugin',
  );
  assert.match(pluginSource, /withAndroidManifest/);
  assert.match(pluginSource, /withMainApplication/);
  assert.match(pluginSource, /withDangerousMod/);
  assert.match(pluginSource, /FOREGROUND_SERVICE_CONNECTED_DEVICE/);
  assert.match(pluginSource, /foregroundServiceType.*connectedDevice/);

  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meriva-obd-plugin-'));
  const transformState = {};
  const fakeConfigPlugins = {
    createRunOncePlugin: (plugin) => plugin,
    withAndroidManifest(config, action) {
      const modConfig = {
        ...config,
        modResults: {
          manifest: {
            manifest: {
              'uses-permission': [
                { $: { 'android:name': 'android.permission.BLUETOOTH_CONNECT' } },
                { $: { 'android:name': 'android.permission.POST_NOTIFICATIONS' } },
              ],
              application: [{ $: { 'android:label': 'Meriva' } }],
            },
          },
        },
      };
      action(modConfig);
      transformState.manifest = modConfig.modResults.manifest;
      return config;
    },
    withMainApplication(config, action) {
      const modConfig = {
        ...config,
        modResults: {
          contents: [
            'package com.meriva.smartdiagnostic',
            '',
            'import com.facebook.react.PackageList',
            'class MainApplication {',
            '  fun getPackages() {',
            '    return PackageList(this).packages',
            '  }',
            '}',
            '',
          ].join('\n'),
        },
      };
      action(modConfig);
      transformState.mainApplication = modConfig.modResults.contents;
      return config;
    },
    withDangerousMod(config, [platform, action]) {
      assert.strictEqual(platform, 'android');
      transformState.dangerousAction = action;
      return config;
    },
  };

  const originalLoad = Module._load;
  let plugin;
  try {
    Module._load = function(request, parentModule, isMain) {
      if (request === '@expo/config-plugins') return fakeConfigPlugins;
      return originalLoad.call(this, request, parentModule, isMain);
    };
    delete require.cache[pluginPath];
    plugin = require(pluginPath);
  } finally {
    Module._load = originalLoad;
  }

  const config = {
    android: { package: 'com.meriva.smartdiagnostic' },
    modRequest: { projectRoot: tempRoot },
  };
  plugin(config);

  const permissions = transformState.manifest.manifest['uses-permission']
    .map((item) => item.$['android:name']);
  assert.strictEqual(
    permissions.filter((item) => item === 'android.permission.BLUETOOTH_CONNECT').length,
    1,
    'plugin must not duplicate existing bluetooth permissions',
  );
  assert.ok(permissions.includes('android.permission.FOREGROUND_SERVICE'));
  assert.ok(permissions.includes('android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE'));
  assert.ok(permissions.includes('android.permission.POST_NOTIFICATIONS'));
  assert.ok(permissions.includes('android.permission.WAKE_LOCK'));
  assert.strictEqual(
    permissions.filter((item) => item === 'android.permission.POST_NOTIFICATIONS').length,
    1,
    'plugin must not duplicate POST_NOTIFICATIONS from app.json',
  );

  const service = transformState.manifest.manifest.application[0].service;
  assert.strictEqual(service.length, 1);
  assert.strictEqual(service[0].$['android:name'], 'com.meriva.smartdiagnostic.obd.ObdForegroundService');
  assert.strictEqual(service[0].$['android:exported'], 'false');
  assert.strictEqual(service[0].$['android:foregroundServiceType'], 'connectedDevice');

  assert.match(transformState.mainApplication, /import com\.meriva\.smartdiagnostic\.obd\.ObdForegroundServicePackage/);
  assert.match(transformState.mainApplication, /add\(ObdForegroundServicePackage\(\)\)/);

  await transformState.dangerousAction(config);
  const javaDir = path.join(tempRoot, 'android', 'app', 'src', 'main', 'java', 'com', 'meriva', 'smartdiagnostic', 'obd');
  for (const file of ['ObdForegroundService.java', 'ObdForegroundServiceModule.java', 'ObdForegroundServicePackage.java']) {
    const generated = fs.readFileSync(path.join(javaDir, file), 'utf8');
    assert.ok(generated.startsWith('package com.meriva.smartdiagnostic.obd;'), file + ' must use generated app package');
    assert.doesNotMatch(generated, /__APP_PACKAGE__/);
  }

  assert.match(serviceSource, /extends Service/);
  assert.match(serviceSource, /startForeground/);
  assert.match(serviceSource, /FOREGROUND_SERVICE_TYPE_CONNECTED_DEVICE/);
  assert.match(serviceSource, /NotificationChannel/);
  assert.match(serviceSource, /PARTIAL_WAKE_LOCK/);
  assert.match(serviceSource, /acquireCpuWakeLock\(\)/);
  assert.match(serviceSource, /releaseCpuWakeLock\(\)/);
  assert.match(serviceSource, /cpuWakeLock\.acquire\(\)/);
  assert.match(serviceSource, /cpuWakeLock\.release\(\)/);
  assert.match(bridgeSource, /getName\(\)[\s\S]*ObdForegroundService/);
  assert.match(bridgeSource, /startForegroundService/);
  assert.match(packageSource, /new ObdForegroundServiceModule/);
  assert.match(wrapperSource, /NativeModules\.ObdForegroundService/);
  assert.match(wrapperSource, /NATIVE_MODULE_MISSING/);
  assert.match(connectionSource, /startNativeObdForegroundService/);
  assert.match(connectionSource, /stopNativeObdForegroundService/);

  // Safety boundary: this service is not a second ELM327 transport owner.
  assert.doesNotMatch(serviceSource + bridgeSource, /BluetoothSocket|createRfcommSocket|010C|ATSP|sendCommand|queryPid/i);

  fs.rmSync(tempRoot, { recursive: true, force: true });
  console.log('obdForegroundServicePlugin: manifest, Kotlin registration, Java generation and single-socket boundary passed');
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
