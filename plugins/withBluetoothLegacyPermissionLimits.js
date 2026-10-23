const { withAndroidManifest } = require('@expo/config-plugins');

const LEGACY_BLUETOOTH_PERMISSIONS = new Set([
  'android.permission.BLUETOOTH',
  'android.permission.BLUETOOTH_ADMIN',
]);

/** Apply the Android 11-and-earlier cap to legacy Bluetooth declarations. */
function applyLegacyBluetoothPermissionLimits(manifest) {
  const declarations = manifest['uses-permission'] || [];
  for (const declaration of declarations) {
    const name = declaration && declaration.$ && declaration.$['android:name'];
    if (LEGACY_BLUETOOTH_PERMISSIONS.has(name)) {
      declaration.$['android:maxSdkVersion'] = '30';
    }
  }
  return manifest;
}

function withBluetoothLegacyPermissionLimits(config) {
  return withAndroidManifest(config, (modConfig) => {
    applyLegacyBluetoothPermissionLimits(modConfig.modResults.manifest);
    return modConfig;
  });
}

module.exports = withBluetoothLegacyPermissionLimits;
module.exports.applyLegacyBluetoothPermissionLimits = applyLegacyBluetoothPermissionLimits;
