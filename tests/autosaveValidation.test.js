'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const Module = require('node:module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');
const sourcePath = path.join(ROOT, 'src/meriva/autosaveValidation.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const output = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
    esModuleInterop: true,
  },
}).outputText;

const moduleRecord = {
  exports: {},
  filename: sourcePath,
  paths: Module._nodeModulePaths(path.dirname(sourcePath)),
};
const localRequire = (request) => {
  if (request === './autosaveState') {
    return { createEmptyMerivaState: () => ({ metadata: {} }) };
  }
  return require(require.resolve(request, { paths: [path.dirname(sourcePath)] }));
};
const compiled = new Function('exports', 'require', 'module', '__filename', '__dirname', output);
compiled(moduleRecord.exports, localRequire, moduleRecord, sourcePath, path.dirname(sourcePath));

const { shouldFeedLearning } = moduleRecord.exports;

assert.equal(shouldFeedLearning('REAL', 'RESPONDEU', 12.5), true);
assert.equal(shouldFeedLearning('SIMULACAO', 'RESPONDEU', 12.5), false);
assert.equal(shouldFeedLearning('REAL', 'TIMEOUT', 12.5), false);
assert.equal(shouldFeedLearning('REAL', 'RESPONDEU', null), false);
assert.equal(shouldFeedLearning('REAL', 'RESPONDEU', Number.NaN), false);
assert.equal(shouldFeedLearning('REAL', 'RESPONDEU', Number.POSITIVE_INFINITY), false);
assert.equal(shouldFeedLearning('REAL', 'RESPONDEU', Number.NEGATIVE_INFINITY), false);

console.log('autosaveValidation.test.js: PASS');
