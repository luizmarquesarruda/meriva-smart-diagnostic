'use strict';

const assert = require('assert');
const path = require('path');
const Module = require('module');
const ts = require('typescript');

const ROOT = path.resolve(__dirname, '..');

function loadTs(relativePath) {
  const filename = path.join(ROOT, relativePath);
  const source = require('fs').readFileSync(filename, 'utf8');
  const output = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2019,
      esModuleInterop: true,
      resolveJsonModule: true,
    },
  }).outputText;
  const mod = new Module(filename, module);
  mod.filename = filename;
  mod.paths = Module._nodeModulePaths(path.dirname(filename));
  mod._compile(output, filename);
  return mod.exports;
}

function main() {
  const { applyFormula, decodeFormula, requireFiniteFormulaResult, validateFormulaSpec } = loadTs('src/obd/formulaEngine.ts');

  assert.throws(() => applyFormula('RPM', [0x1A, 256]), /Byte OBD inválido/,
    'byte acima de FF deve ser rejeitado');
  assert.throws(() => applyFormula('RPM', [0x1A, -1]), /Byte OBD inválido/,
    'byte negativo deve ser rejeitado');
  assert.throws(() => applyFormula('RPM', [0x1A, 1.5]), /Byte OBD inválido/,
    'byte fracionário deve ser rejeitado');
  assert.throws(() => validateFormulaSpec('BROKEN', { operation: 'u8_div', divisor: 0 }), /Divisor inválido/,
    'zero divisor must be rejected instead of creating Infinity');
  assert.throws(() => validateFormulaSpec('BROKEN', { operation: 'u8_scale', scale: Number.POSITIVE_INFINITY }), /Escala inválida/,
    'non-finite catalog coefficients must be rejected');
  assert.throws(() => requireFiniteFormulaResult('BROKEN', Number.POSITIVE_INFINITY), /Fórmula BROKEN produziu valor não finito/,
    'a non-finite intermediate/result must be rejected');

  // SAE J1979 boundary values must not be rejected because of rounded ranges.
  const maxFuelTrim = decodeFormula('FUEL_TRIM', '0106', [0xFF]);
  assert.strictEqual(maxFuelTrim.value, 99.21875);
  assert.strictEqual(maxFuelTrim.valid, true, 'PID 0106 max byte value is valid');

  const maxLongTrim = decodeFormula('FUEL_TRIM', '0107', [0xFF]);
  assert.strictEqual(maxLongTrim.value, 99.21875);
  assert.strictEqual(maxLongTrim.valid, true, 'PID 0107 max byte value is valid');

  const maxEgrError = decodeFormula('FUEL_TRIM', '012D', [0xFF]);
  assert.strictEqual(maxEgrError.value, 99.21875);
  assert.strictEqual(maxEgrError.valid, true, 'PID 012D max byte value is valid');

  const maxInjectionTiming = decodeFormula('INJECTION_TIMING', '015D', [0xFF, 0xFF]);
  assert.strictEqual(maxInjectionTiming.value, 301.9921875);
  assert.strictEqual(maxInjectionTiming.valid, true, 'PID 015D maximum 16-bit value is valid');

  const labScreen = require('fs').readFileSync(path.join(ROOT, 'app/laboratorio.tsx'), 'utf8');
  assert.ok(labScreen.includes('INTEGRIDADE DO DECODIFICADOR'), 'laboratório deve exibir a seção de integridade das fórmulas');
  assert.ok(labScreen.includes('decodeFormula(item.formula, item.pid, item.bytes)'), 'a tela deve reutilizar o motor oficial, sem duplicar fórmulas');
  assert.ok(labScreen.includes('Não são leituras do veículo'), 'os casos de fronteira devem ser identificados como exemplos matemáticos');

  console.log('PID formula boundary tests passed');
}

main();
