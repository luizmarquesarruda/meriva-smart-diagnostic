'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseVersion, versionCodeFor, nextVersion, validateMetadata, bumpProjectVersion } = require('../scripts/version-control.cjs');
assert.deepEqual(parseVersion('1.0.1'), { major: 1, minor: 0, patch: 1 });
assert.equal(versionCodeFor('1.0.1'), 10001);
assert.equal(nextVersion('1.0.1', 'patch'), '1.0.2');
assert.equal(nextVersion('1.0.99', 'patch'), '1.1.0');
assert.equal(nextVersion('1.99.99', 'patch'), '2.0.0');
assert.equal(nextVersion('1.98.5', 'minor'), '1.99.0');
assert.equal(nextVersion('1.5.8', 'major'), '2.0.0');
assert.throws(() => parseVersion('v1.0.1'), /Versão inválida/);
assert.throws(() => parseVersion('1.100.0'), /MINOR e PATCH/);
assert.throws(() => nextVersion('1.0.1', 'release'), /Tipo inválido/);
function fixture(version, code) {
  const v = version || '1.0.1';
  return {
    packageJson: { version: v },
    lockJson: { version: v, packages: { '': { version: v } } },
    appJson: { expo: { version: v, android: { versionCode: code === undefined ? 10001 : code } } },
  };
}
assert.deepEqual(validateMetadata(fixture()), []);
assert.match(validateMetadata(fixture('1.0.2', 10001)).join(' '), /android\.versionCode divergente/);
assert.match(validateMetadata({ ...fixture(), appJson: { expo: { version: '1.0.0', android: { versionCode: 10001 } } } }).join(' '), /app\.json expo\.version diverge/);
assert.match(validateMetadata({ ...fixture(), lockJson: { version: '1.0.0', packages: { '': { version: '1.0.0' } } } }).join(' '), /package-lock\.json version diverge/);
const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'meriva-version-test-'));
try {
  const initial = fixture('1.0.1', 10001);
  fs.writeFileSync(path.join(tempRoot, 'package.json'), JSON.stringify(initial.packageJson));
  fs.writeFileSync(path.join(tempRoot, 'package-lock.json'), JSON.stringify(initial.lockJson));
  fs.writeFileSync(path.join(tempRoot, 'app.json'), JSON.stringify(initial.appJson));

  assert.deepEqual(bumpProjectVersion(tempRoot, 'patch'), { version: '1.0.2', androidVersionCode: 10002 });
  const bumped = {
    packageJson: JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8')),
    lockJson: JSON.parse(fs.readFileSync(path.join(tempRoot, 'package-lock.json'), 'utf8')),
    appJson: JSON.parse(fs.readFileSync(path.join(tempRoot, 'app.json'), 'utf8')),
  };
  assert.deepEqual(validateMetadata(bumped), []);
  assert.equal(bumped.packageJson.version, '1.0.2');
  assert.equal(bumped.lockJson.packages[''].version, '1.0.2');
  assert.equal(bumped.appJson.expo.version, '1.0.2');
  assert.equal(bumped.appJson.expo.android.versionCode, 10002);

  bumped.appJson.expo.version = '9.9.9';
  fs.writeFileSync(path.join(tempRoot, 'app.json'), JSON.stringify(bumped.appJson));
  assert.throws(() => bumpProjectVersion(tempRoot, 'patch'), /versão inconsistente/);
  assert.equal(JSON.parse(fs.readFileSync(path.join(tempRoot, 'package.json'), 'utf8')).version, '1.0.2');
} finally {
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

console.log('Versionamento SemVer e android.versionCode: OK');
