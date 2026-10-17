const { execSync } = require('child_process');

function gitValue(command) {
  try {
    const value = execSync(command, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    return value || 'UNKNOWN';
  } catch {
    return 'UNKNOWN';
  }
}

module.exports = ({ config }) => {
  const gitSha = process.env.GIT_SHA || process.env.GITHUB_SHA || gitValue('git rev-parse HEAD');
  const branch = process.env.GIT_BRANCH || process.env.GITHUB_REF_NAME || gitValue('git branch --show-current');
  const buildDate = process.env.BUILD_DATE || new Date().toISOString();
  const requestedVersionCode = Number(process.env.ANDROID_VERSION_CODE || config.android?.versionCode || 1);
  const versionCode = Number.isSafeInteger(requestedVersionCode) && requestedVersionCode > 0
    ? requestedVersionCode
    : 1;

  return {
    ...config,
    android: {
      ...config.android,
      versionCode,
    },
    extra: {
      ...config.extra,
      buildInfo: {
        gitSha: gitSha === 'UNKNOWN' ? gitSha : gitSha.slice(0, 12),
        branch,
        buildDate,
        versionCode,
      },
    },
  };
};
