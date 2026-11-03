'use strict';

const fs = require('node:fs');
const path = require('node:path');

function createBuildInfo(appJson, env = {}, now = new Date()) {
  if (!appJson || !appJson.expo || !appJson.expo.android) {
    throw new Error('app.json não contém os metadados Expo/Android esperados.');
  }
  const rawSha = typeof env.GITHUB_SHA === 'string' ? env.GITHUB_SHA.trim().toLowerCase() : '';
  const commitSha = /^[a-f0-9]{40}$/.test(rawSha) ? rawSha : 'LOCAL';
  const timestamp = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(timestamp.getTime())) throw new Error('Data de compilação inválida.');
  const runId = typeof env.GITHUB_RUN_ID === 'string' && /^\d+$/.test(env.GITHUB_RUN_ID)
    ? env.GITHUB_RUN_ID
    : 'LOCAL';

  return {
    schemaVersion: 1,
    appVersion: appJson.expo.version,
    androidVersionCode: appJson.expo.android.versionCode,
    commitSha,
    shortCommitSha: commitSha === 'LOCAL' ? 'LOCAL' : commitSha.slice(0, 7),
    builtAtUtc: timestamp.toISOString(),
    workflowRunId: runId,
  };
}

function writeBuildInfo(root, env = process.env, now = new Date()) {
  const appPath = path.join(root, 'app.json');
  const appJson = JSON.parse(fs.readFileSync(appPath, 'utf8'));
  const manifest = createBuildInfo(appJson, env, now);
  const currentExtra = appJson.expo.extra && typeof appJson.expo.extra === 'object'
    ? appJson.expo.extra
    : {};
  appJson.expo.extra = {
    ...currentExtra,
    buildInfo: {
      commitSha: manifest.commitSha,
      shortCommitSha: manifest.shortCommitSha,
      builtAtUtc: manifest.builtAtUtc,
      workflowRunId: manifest.workflowRunId,
    },
  };

  fs.writeFileSync(appPath, JSON.stringify(appJson, null, 2) + '\n', 'utf8');
  const outputDirectory = path.join(root, 'build');
  fs.mkdirSync(outputDirectory, { recursive: true });
  const manifestPath = path.join(outputDirectory, 'meriva-build-info.json');
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n', 'utf8');
  return { manifest, manifestPath };
}

if (require.main === module) {
  try {
    const result = writeBuildInfo(path.resolve(__dirname, '..'));
    process.stdout.write('Proveniência preparada: ' + result.manifest.shortCommitSha + ' / ' + result.manifest.workflowRunId + '\n');
  } catch (error) {
    process.stderr.write((error instanceof Error ? error.message : String(error)) + '\n');
    process.exitCode = 1;
  }
}

module.exports = { createBuildInfo, writeBuildInfo };
