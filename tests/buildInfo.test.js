'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createBuildInfo, writeBuildInfo } = require('../scripts/write-build-info.cjs');

const appJson = {
  expo: {
    version: '1.0.1',
    android: { versionCode: 10001 },
    extra: { existingSetting: 'preserve' },
  },
};
const sha = 'a'.repeat(40);
const now = new Date('2026-11-03T14:30:00.000Z');
const info = createBuildInfo(appJson, { GITHUB_SHA: sha, GITHUB_RUN_ID: '41649532460' }, now);
assert.equal(info.schemaVersion, 1);
assert.equal(info.appVersion, '1.0.1');
assert.equal(info.androidVersionCode, 10001);
assert.equal(info.commitSha, sha);
assert.equal(info.shortCommitSha, 'aaaaaaa');
assert.equal(info.builtAtUtc, '2026-11-03T14:30:00.000Z');
assert.equal(info.workflowRunId, '41649532460');

const local = createBuildInfo(appJson, {}, now);
assert.equal(local.commitSha, 'LOCAL');
assert.equal(local.shortCommitSha, 'LOCAL');
assert.equal(local.workflowRunId, 'LOCAL');
assert.throws(() => createBuildInfo({ expo: { version: '1.0.1' } }, {}, now), /metadados Expo\/Android/);
assert.throws(() => createBuildInfo(appJson, {}, 'data inválida'), /Data de compilação inválida/);

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'meriva-build-info-'));
try {
  fs.writeFileSync(path.join(root, 'app.json'), JSON.stringify(appJson));
  const written = writeBuildInfo(root, { GITHUB_SHA: sha, GITHUB_RUN_ID: '99' }, now);
  const updatedApp = JSON.parse(fs.readFileSync(path.join(root, 'app.json'), 'utf8'));
  const manifest = JSON.parse(fs.readFileSync(written.manifestPath, 'utf8'));
  assert.equal(updatedApp.expo.extra.existingSetting, 'preserve');
  assert.equal(updatedApp.expo.extra.buildInfo.shortCommitSha, 'aaaaaaa');
  assert.equal(updatedApp.expo.extra.buildInfo.builtAtUtc, '2026-11-03T14:30:00.000Z');
  assert.deepEqual(manifest, written.manifest);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}

console.log('APK build provenance tests: PASS');
