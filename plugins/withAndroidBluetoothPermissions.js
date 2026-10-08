const { withAndroidManifest } = require('@expo/config-plugins');

function findOrCreatePermission(manifest, name) {
  const permissions = manifest.manifest['uses-permission'] ?? [];
  let item = permissions.find((entry) => entry?.$?.['android:name'] === name);
  if (!item) {
    item = { $: { 'android:name': name } };
    permissions.push(item);
    manifest.manifest['uses-permission'] = permissions;
  }
  return item;
}

module.exports = function withAndroidBluetoothPermissions(config) {
  return withAndroidManifest(config, (configWithManifest) => {
    const manifest = configWithManifest.modResults;

    for (const permission of ['android.permission.BLUETOOTH', 'android.permission.BLUETOOTH_ADMIN']) {
      const item = findOrCreatePermission(manifest, permission);
      item.$['android:maxSdkVersion'] = '30';
    }

    const scan = findOrCreatePermission(manifest, 'android.permission.BLUETOOTH_SCAN');
    scan.$['android:usesPermissionFlags'] = 'neverForLocation';

    return configWithManifest;
  });
};
