'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');
const workflow = fs.readFileSync(path.join(__dirname, '..', '.github/workflows/ci.yml'), 'utf8');

const projectId = '013db816-eec1-4406-8952-d6c0731cf461';
assert.equal(app.slug, 'meriva');
assert.equal(app.owner, 'luizarruda');
assert.equal(app.extra.eas.projectId, projectId);
assert.equal(app.updates.url, `https://u.expo.dev/${projectId}`);
assert.deepEqual(app.runtimeVersion, { policy: 'appVersion' });
assert.equal(app.updates.enabled, true);
assert.equal(app.updates.checkAutomatically, 'ON_LOAD');
assert.equal(app.updates.requestHeaders['expo-channel-name'], 'production');

assert.equal(pkg.dependencies['expo-updates'], '~0.25.27');
assert.equal(lock.packages[''].dependencies['expo-updates'], '~0.25.27');
assert.equal(lock.packages['node_modules/expo-updates'].version, '0.25.27');
assert.equal(eas.build.preview.channel, 'production');
assert.equal(eas.build.production.channel, 'production');
assert.equal(eas.build.preview.distribution, 'internal');
assert.equal(eas.build.preview.android.buildType, 'apk');
assert.equal(eas.build.production.distribution, 'internal');
assert.equal(eas.build.production.android.buildType, 'apk');

// Fail closed: OTA publication must only run on main after both validation and APK build,
// and must require an explicit repository variable opt-in plus a secret token.
assert.match(workflow, /publish-ota:[\s\S]*?needs:\s*\[validate, android-build\]/);
assert.match(workflow, /if:\s*github\.event_name == 'push' && github\.ref == 'refs\/heads\/main' && vars\.EAS_UPDATE_ENABLED == 'true'/);
assert.match(workflow, /EXPO_TOKEN:\s*\$\{\{ secrets\.EXPO_TOKEN \}\}/);
assert.match(workflow, /eas-cli@latest update --channel production --platform android/);
assert.match(workflow, /native_changed=true/);
assert.match(workflow, /app_code_changed=true/);

console.log('easUpdateConfig.test.js: OK');
