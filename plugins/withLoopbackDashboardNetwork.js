const { withAndroidManifest, withDangerousMod } = require('@expo/config-plugins');
const fs = require('node:fs');
const path = require('node:path');

module.exports = function withLoopbackDashboardNetwork(config) {
  config = withAndroidManifest(config, (mod) => {
    const application = mod.modResults.manifest.application?.[0];
    if (!application) throw new Error('Android manifest has no application element');
    application.$['android:networkSecurityConfig'] = '@xml/meriva_network_security_config';
    application.$['android:usesCleartextTraffic'] = 'false';
    return mod;
  });

  config = withDangerousMod(config, ['android', async (mod) => {
    const xmlDir = path.join(mod.modRequest.platformProjectRoot, 'app', 'src', 'main', 'res', 'xml');
    fs.mkdirSync(xmlDir, { recursive: true });
    fs.writeFileSync(path.join(xmlDir, 'meriva_network_security_config.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
  <base-config cleartextTrafficPermitted="false" />
  <domain-config cleartextTrafficPermitted="true">
    <domain includeSubdomains="false">localhost</domain>
    <domain includeSubdomains="false">127.0.0.1</domain>
  </domain-config>
</network-security-config>
`, 'utf8');
    return mod;
  }]);

  return config;
};
