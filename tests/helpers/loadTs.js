'use strict';

const fs = require('fs');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const cache = new Map();

function repoRoot() {
  return path.resolve(__dirname, '..', '..');
}

function resolveTsModule(request, parentFilename) {
  if (!request.startsWith('.')) return null;
  const base = path.resolve(path.dirname(parentFilename), request);
  const candidates = [
    base,
    base + '.ts',
    base + '.tsx',
    base + '.js',
    base + '.json',
    path.join(base, 'index.ts'),
    path.join(base, 'index.tsx'),
    path.join(base, 'index.js'),
    path.join(base, 'index.json'),
  ];
  return candidates.find((candidate) => fs.existsSync(candidate) && fs.statSync(candidate).isFile()) ?? null;
}

function loadTs(file, options = {}) {
  const sourcePath = path.isAbsolute(file) ? file : path.resolve(repoRoot(), file);
  if (cache.has(sourcePath)) return cache.get(sourcePath).exports;

  const source = fs.readFileSync(sourcePath, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;

  const mod = new Module(sourcePath, module.parent);
  mod.filename = sourcePath;
  mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
  cache.set(sourcePath, mod);

  const originalLoad = Module._load;
  Module._load = function(request, parent, isMain) {
    if (options.mocks && Object.prototype.hasOwnProperty.call(options.mocks, request)) {
      return options.mocks[request];
    }

    const parentFilename = parent?.filename;
    if (parentFilename) {
      const resolved = resolveTsModule(request, parentFilename);
      if (resolved?.endsWith('.json')) return require(resolved);
      if (resolved?.endsWith('.ts') || resolved?.endsWith('.tsx')) {
        return loadTs(resolved, options);
      }
    }

    return originalLoad(request, parent, isMain);
  };

  try {
    mod._compile(output, sourcePath);
    return mod.exports;
  } finally {
    Module._load = originalLoad;
  }
}

function clearTsCache() {
  cache.clear();
}

module.exports = { loadTs, clearTsCache };
