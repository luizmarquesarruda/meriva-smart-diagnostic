'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(__dirname, '..', file), 'utf8'));
const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const pkg = readJson('package.json');
const lock = readJson('package-lock.json');

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

console.log('easUpdateConfig.test.js: OK');
