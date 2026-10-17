const fs = require('fs');
const path = require('path');
const {
  createRunOncePlugin,
  withAndroidManifest,
  withDangerousMod,
  withMainApplication,
} = require('@expo/config-plugins');

const PLUGIN_NAME = 'with-obd-foreground-service';
const SERVICE_SIMPLE_NAME = 'ObdForegroundService';
const PERMISSIONS = [
  'android.permission.FOREGROUND_SERVICE',
  'android.permission.FOREGROUND_SERVICE_CONNECTED_DEVICE',
];

function requireAndroidPackage(config) {
  const packageName = config.android && config.android.package;
  if (!packageName || !/^[A-Za-z][A-Za-z0-9_]*(\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)) {
    throw new Error('[withObdForegroundService] app.json must define a valid expo.android.package.');
  }
  return packageName;
}

function withObdManifest(config) {
  return withAndroidManifest(config, (modConfig) => {
    const packageName = requireAndroidPackage(modConfig);
    const manifest = modConfig.modResults.manifest;

    manifest['uses-permission'] = manifest['uses-permission'] || [];
    for (const permission of PERMISSIONS) {
      const exists = manifest['uses-permission'].some((item) => item.$ && item.$['android:name'] === permission);
      if (!exists) manifest['uses-permission'].push({ $: { 'android:name': permission } });
    }

    const application = manifest.application && manifest.application[0];
    if (!application) {
      throw new Error('[withObdForegroundService] AndroidManifest has no application element.');
    }
    application.service = application.service || [];

    const serviceName = packageName + '.obd.' + SERVICE_SIMPLE_NAME;
    let service = application.service.find((item) =>
      item.$ && (item.$['android:name'] === serviceName || item.$['android:name'] === '.obd.' + SERVICE_SIMPLE_NAME),
    );
    if (!service) {
      service = { $: { 'android:name': serviceName } };
      application.service.push(service);
    }

    service.$ = {
      ...service.$,
      'android:name': serviceName,
      'android:enabled': 'true',
      'android:exported': 'false',
      'android:stopWithTask': 'false',
      'android:foregroundServiceType': 'connectedDevice',
    };
    return modConfig;
  });
}

function withNativePackageRegistration(config) {
  return withMainApplication(config, (modConfig) => {
    const packageName = requireAndroidPackage(modConfig);
    let contents = modConfig.modResults.contents;
    const importLine = 'import ' + packageName + '.obd.ObdForegroundServicePackage';

    if (!contents.includes(importLine)) {
      const packageDeclaration = /^package\s+[A-Za-z0-9_.]+\s*$/m;
      if (!packageDeclaration.test(contents)) {
        throw new Error('[withObdForegroundService] Could not locate Kotlin package declaration in MainApplication.');
      }
      contents = contents.replace(packageDeclaration, (line) => line + '\n\n' + importLine);
    }

    if (!contents.includes('ObdForegroundServicePackage()')) {
      const directReturn = /return PackageList\(this\)\.packages(?!\.apply)/;
      const applyReturn = /return PackageList\(this\)\.packages\.apply\s*\{/;
      if (directReturn.test(contents)) {
        contents = contents.replace(
          directReturn,
          'return PackageList(this).packages.apply {\n              add(ObdForegroundServicePackage())\n            }',
        );
      } else if (applyReturn.test(contents)) {
        contents = contents.replace(applyReturn, (match) => match + '\n              add(ObdForegroundServicePackage())');
      } else {
        throw new Error('[withObdForegroundService] Unsupported MainApplication package-list shape; native module was not registered.');
      }
    }

    modConfig.modResults.contents = contents;
    return modConfig;
  });
}

function withJavaSources(config) {
  return withDangerousMod(config, [
    'android',
    async (modConfig) => {
      const packageName = requireAndroidPackage(modConfig);
      const projectRoot = modConfig.modRequest.projectRoot;
      const generatedJavaDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'java',
        ...packageName.split('.'),
        'obd',
      );
      const templateDir = path.join(__dirname, 'obdForegroundServiceTemplates');
      const javaFiles = [
        'ObdForegroundService.java',
        'ObdForegroundServiceModule.java',
        'ObdForegroundServicePackage.java',
      ];

      fs.mkdirSync(generatedJavaDir, { recursive: true });
      for (const fileName of javaFiles) {
        const templatePath = path.join(templateDir, fileName);
        if (!fs.existsSync(templatePath)) {
          throw new Error('[withObdForegroundService] Missing Java template: ' + templatePath);
        }
        const source = fs.readFileSync(templatePath, 'utf8').replace(/__APP_PACKAGE__/g, packageName);
        fs.writeFileSync(path.join(generatedJavaDir, fileName), source, 'utf8');
      }
      return modConfig;
    },
  ]);
}

function withObdForegroundService(config) {
  config = withObdManifest(config);
  config = withNativePackageRegistration(config);
  config = withJavaSources(config);
  return config;
}

module.exports = createRunOncePlugin(withObdForegroundService, PLUGIN_NAME, '1.0.0');
