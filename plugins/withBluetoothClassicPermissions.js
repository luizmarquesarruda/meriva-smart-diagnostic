const { withAndroidManifest } = require('@expo/config-plugins');

module.exports = function withBluetoothClassicPermissions(config) {
  return withAndroidManifest(config, (mod) => {
    const manifest = mod.modResults.manifest;
    manifest['uses-feature'] = manifest['uses-feature'] || [];
    if (!manifest['uses-feature'].some((item) => item.$?.['android:name'] === 'android.hardware.bluetooth')) {
      manifest['uses-feature'].push({
        $: { 'android:name': 'android.hardware.bluetooth', 'android:required': 'false' },
      });
    }
    manifest['uses-permission'] = manifest['uses-permission'] || [];
    const permissions = manifest['uses-permission'];
    const ensure = (name, maxSdk) => {
      let item = permissions.find((p) => p.$?.['android:name'] === name);
      if (!item) { item = { $: { 'android:name': name } }; permissions.push(item); }
      if (maxSdk) item.$['android:maxSdkVersion'] = String(maxSdk);
    };
    ensure('android.permission.BLUETOOTH', 30);
    ensure('android.permission.BLUETOOTH_ADMIN', 30);
    ensure('android.permission.BLUETOOTH_CONNECT');
    ensure('android.permission.BLUETOOTH_SCAN');
    ensure('android.permission.ACCESS_FINE_LOCATION', 30);
    ensure('android.permission.ACCESS_COARSE_LOCATION', 30);
    return mod;
  });
};
