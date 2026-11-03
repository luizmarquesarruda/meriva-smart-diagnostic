'use strict';
const fs = require('node:fs');
const path = require('node:path');
const VERSION_PATTERN = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/;
const ANDROID_VERSION_CODE_MAX = 2100000000;
function parseVersion(version) {
  if (typeof version !== 'string') throw new Error('A versão precisa ser uma string MAJOR.MINOR.PATCH.');
  const match = VERSION_PATTERN.exec(version);
  if (!match) throw new Error('Versão inválida: use MAJOR.MINOR.PATCH estável, sem prefixo v ou sufixos.');
  const major = Number(match[1]), minor = Number(match[2]), patch = Number(match[3]);
  if (minor > 99 || patch > 99) throw new Error('MINOR e PATCH devem estar entre 0 e 99 para manter versionCode monotônico.');
  return { major, minor, patch };
}
function versionCodeFor(version) {
  const p = parseVersion(version);
  const code = p.major * 10000 + p.minor * 100 + p.patch;
  if (!Number.isSafeInteger(code) || code < 1 || code > ANDROID_VERSION_CODE_MAX) throw new Error('A versão excede o intervalo permitido para android.versionCode.');
  return code;
}
function nextVersion(currentVersion, kind) {
  const p = parseVersion(currentVersion);
  if (kind === 'patch') {
    if (p.patch < 99) return p.major + '.' + p.minor + '.' + (p.patch + 1);
    if (p.minor < 99) return p.major + '.' + (p.minor + 1) + '.0';
    return (p.major + 1) + '.0.0';
  }
  if (kind === 'minor') return p.minor < 99 ? p.major + '.' + (p.minor + 1) + '.0' : (p.major + 1) + '.0.0';
  if (kind === 'major') return (p.major + 1) + '.0.0';
  throw new Error('Tipo inválido. Use patch, minor ou major.');
}
function validateMetadata(metadata) {
  const pkg = metadata.packageJson, lock = metadata.lockJson, app = metadata.appJson, errors = [];
  let expected;
  try { expected = versionCodeFor(pkg.version); } catch (e) { errors.push(e.message); }
  if (lock.version !== pkg.version) errors.push('package-lock.json version diverge de package.json.');
  if (!lock.packages || !lock.packages[''] || lock.packages[''].version !== pkg.version) errors.push('package-lock.json packages[""].version diverge de package.json.');
  if (!app.expo || app.expo.version !== pkg.version) errors.push('app.json expo.version diverge de package.json.');
  const android = app.expo && app.expo.android;
  if (!android || !Number.isInteger(android.versionCode)) errors.push('app.json expo.android.versionCode precisa ser inteiro.');
  else if (expected !== undefined && android.versionCode !== expected) errors.push('android.versionCode divergente: esperado ' + expected + ', recebido ' + android.versionCode + '.');
  return errors;
}
function readMetadata(root) {
  const read = (name) => JSON.parse(fs.readFileSync(path.join(root, name), 'utf8'));
  return { packageJson: read('package.json'), lockJson: read('package-lock.json'), appJson: read('app.json') };
}
function writeJsonAtomic(filePath, value) {
  const temp = filePath + '.' + process.pid + '.tmp';
  fs.writeFileSync(temp, JSON.stringify(value, null, 2) + '\n', 'utf8');
  fs.renameSync(temp, filePath);
}
function bumpProjectVersion(root, kind) {
  const data = readMetadata(root), errors = validateMetadata(data);
  if (errors.length) throw new Error('Não é seguro incrementar uma versão inconsistente:\n- ' + errors.join('\n- '));
  const next = nextVersion(data.packageJson.version, kind), code = versionCodeFor(next);
  data.packageJson.version = next;
  data.lockJson.version = next;
  data.lockJson.packages[''].version = next;
  data.appJson.expo.version = next;
  data.appJson.expo.android.versionCode = code;
  writeJsonAtomic(path.join(root, 'package.json'), data.packageJson);
  writeJsonAtomic(path.join(root, 'package-lock.json'), data.lockJson);
  writeJsonAtomic(path.join(root, 'app.json'), data.appJson);
  return { version: next, androidVersionCode: code };
}
function run(argv, root) {
  const args = argv || process.argv.slice(2), projectRoot = root || path.resolve(__dirname, '..');
  if (args[0] === 'check') {
    const data = readMetadata(projectRoot), errors = validateMetadata(data);
    if (errors.length) throw new Error('Controle de versão reprovado:\n- ' + errors.join('\n- '));
    console.log('Controle de versão aprovado: v' + data.packageJson.version + ' (Android versionCode ' + data.appJson.expo.android.versionCode + ').');
    return;
  }
  if (args[0] === 'bump') {
    const result = bumpProjectVersion(projectRoot, args[1]);
    console.log('Versão atualizada para v' + result.version + '; Android versionCode ' + result.androidVersionCode + '.');
    return;
  }
  throw new Error('Uso: node scripts/version-control.cjs check | bump patch|minor|major');
}
if (require.main === module) {
  try { run(); } catch (error) { console.error(error.message); process.exitCode = 1; }
}
module.exports = { parseVersion, versionCodeFor, nextVersion, validateMetadata, bumpProjectVersion };
