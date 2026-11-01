'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const sourcePath = path.resolve(__dirname, '../src/storage/cleanupPolicy.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019 },
}).outputText;
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const policy = mod.exports;
const now = Date.UTC(2026, 10, 1);
assert.deepEqual(policy.CLEANUP_DIRECTORIES, ['LOGS', 'LEITURAS']);
assert.equal(policy.getCleanupCutoffMs('LOGS', now), now - 7 * 86400000);
assert.equal(policy.getCleanupCutoffMs('LEITURAS', now), now - 30 * 86400000);
assert.equal(policy.isCleanupDirectory('CONFIG'), false);
assert.equal(policy.isCleanupDirectory('BACKUP'), false);
assert.equal(policy.isExpiredCleanupFile('LOGS', now - 8 * 86400000, now), true);
assert.equal(policy.isExpiredCleanupFile('LEITURAS', now - 8 * 86400000, now), false);
assert.equal(policy.isExpiredCleanupFile('LOGS', Number.NaN, now), false);
assert.deepEqual(policy.sortCleanupCandidates([{ modifiedAt: 3 }, { modifiedAt: 1 }, { modifiedAt: 2 }]).map(x => x.modifiedAt), [1, 2, 3]);
console.log('cleanupPolicy.test.js: PASS');
