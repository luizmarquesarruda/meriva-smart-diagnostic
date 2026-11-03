'use strict';
const assert = require('node:assert/strict');
const { parseVersion, versionCodeFor, nextVersion, validateMetadata } = require('../scripts/version-control.cjs');
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
console.log('Versionamento SemVer e android.versionCode: OK');
