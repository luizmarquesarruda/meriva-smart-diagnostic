'use strict';

const assert = require('assert');
const ts = require('typescript');
const fs = require('fs');
const path = require('path');
const Module = require('module');

const sourcePath = path.join(__dirname, '..', 'src', 'obd', 'fuelConsumption.ts');
const output = ts.transpileModule(fs.readFileSync(sourcePath, 'utf8'), {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2019,
  },
}).outputText;

const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(output, sourcePath);

const { integrateFuelRateLph, FuelRateIntegrator, estimateFuelRateLph, calculateInstantaneousConsumptionKml, resolveFuelEstimateProperties } = mod.exports;
const fuelModel = require('../src/knowledge/fuel_consumption_model.json');

function assertApprox(actual, expected, epsilon = 1e-12) {
  assert.ok(Math.abs(actual - expected) <= epsilon, `expected ${actual} ≈ ${expected}`);
}

assert.strictEqual(integrateFuelRateLph(null, { fuelRateLph: 12, timestampMs: 1000 }), 0);
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 12, timestampMs: 1000 },
    { fuelRateLph: 12, timestampMs: 3700 },
  ),
  0.009,
);
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 10, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 11000 },
  ),
  0.04166666666666667,
);
assert.strictEqual(
  integrateFuelRateLph(
    { fuelRateLph: 10, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 32001 },
  ),
  0,
);
assert.strictEqual(integrateFuelRateLph(
  { fuelRateLph: 10, timestampMs: 1000 }, { fuelRateLph: 90, timestampMs: 2000 },
), 0, 'taxa L/h acima do limite não deve ser integrada');
assertApprox(
  integrateFuelRateLph(
    { fuelRateLph: 0, timestampMs: 1000 },
    { fuelRateLph: 20, timestampMs: 2000 },
  ),
  0.002777777777777778,
);

const integrator = new FuelRateIntegrator();
assert.deepStrictEqual(integrator.addSample(10, 1000), {
  fuelUsedL: 0,
  validSamples: 1,
  lastRateLph: 10,
  lastTimestampMs: 1000,
});
const state = integrator.addSample(10, 3700);
assert.strictEqual(state.validSamples, 2);
assert.strictEqual(state.fuelUsedL, 0.0075);
assert.strictEqual(integrator.addSample(NaN, 4700).fuelUsedL, 0.0075);
integrator.reset();
assert.deepStrictEqual(integrator.addSample(0, 1000), {
  fuelUsedL: 0,
  validSamples: 1,
  lastRateLph: 0,
  lastTimestampMs: 1000,
});
assertApprox(integrator.addSample(20, 2000).fuelUsedL, 0.002777777777777778, 1e-12);
assertApprox(integrator.addSample(-1, 3000).fuelUsedL, 0.002777777777777778, 1e-12);
integrator.reset();
integrator.addSample(10, 2000);
const beforeOutOfOrder = integrator.getState();
assert.deepStrictEqual(integrator.addSample(100, 1500), beforeOutOfOrder,
  'sample com timestamp antigo deve ser ignorada sem rebobinar o integrador');
assert.strictEqual(integrator.getState().lastTimestampMs, 2000,
  'timestamp de referência deve continuar monotônico');
const beforeExtremeRate = integrator.getState();
assert.deepStrictEqual(integrator.addSample(81, 2500), beforeExtremeRate,
  'taxa extrema/sentinela deve ser ignorada');
assertApprox(integrator.addSample(10, 3000).fuelUsedL, 10 / 3600, 1e-12,
  'amostra válida após timestamp antigo deve integrar apenas o intervalo correto');
integrator.reset();
assert.strictEqual(integrator.getState().fuelUsedL, 0);

console.log('PASS combustível OBD: integração L/h, intervalos e dados inválidos');


const fsSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'obd', 'fuelConsumption.ts'), 'utf8');
if (!fsSource.includes('ESTIMATED_MAF') || !fsSource.includes('ESTIMATED_MAP')) {
  throw new Error('fuel fallback MAF/MAP não está implementado');
}
assert.strictEqual(estimateFuelRateLph({ mafGs: 0 }), null, 'MAF zero não pode ser convertido em uma estimativa de consumo válida');

const gasolineReference = resolveFuelEstimateProperties('GASOLINA');
assert.strictEqual(gasolineReference.airFuelRatio, 12.8,
  'gasolina C brasileira deve usar a referência E32 datada do modelo, não AFR de gasolina pura');
assert.strictEqual(gasolineReference.fuelDensityKgPerL, 0.757);
const hydrousEthanolReference = resolveFuelEstimateProperties('ETANOL');
assert.strictEqual(hydrousEthanolReference.airFuelRatio, 8.51,
  'etanol selecionado usa proxy para etanol hidratado, não etanol puro');
assert.strictEqual(hydrousEthanolReference.fuelDensityKgPerL, 0.812);
assert.strictEqual(fuelModel.schemaVersion, 1);
assert.strictEqual(fuelModel.calibration.runtimeCalibrationEnabled, false,
  'não declarar calibração de abastecimento ativa antes de persistir abastecimentos reais');
const referenceBlend = resolveFuelEstimateProperties('FLEX');
assert.ok(referenceBlend.airFuelRatio > 10 && referenceBlend.airFuelRatio < 13);
const gasolineMafEstimate = estimateFuelRateLph({ mafGs: 2.5, fuelType: 'GASOLINA' });
assert.ok(gasolineMafEstimate, 'MAF positivo com combustível selecionado deve gerar estimativa');
assert.strictEqual(gasolineMafEstimate.source, 'ESTIMATED_MAF');
assert.ok(gasolineMafEstimate.rateLph > 0);
const correctedMafEstimate = estimateFuelRateLph({
  mafGs: 2.5, fuelType: 'GASOLINA', calibrationFactor: 1.1,
});
assertApprox(correctedMafEstimate.rateLph, gasolineMafEstimate.rateLph * 1.1,
  1e-12);
const unsafeCalibrationFactor = estimateFuelRateLph({
  mafGs: 2.5, fuelType: 'GASOLINA', calibrationFactor: 2.0,
});
assert.strictEqual(unsafeCalibrationFactor.rateLph, gasolineMafEstimate.rateLph,
  'fator fora do envelope 0.70–1.30 deve ser ignorado');
const ethanolMafEstimate = estimateFuelRateLph({ mafGs: 2.5, fuelType: 'ETANOL' });
assert.ok(ethanolMafEstimate, 'Etanol deve usar AFR e densidade próprios');
assert.ok(ethanolMafEstimate.rateLph > gasolineMafEstimate.rateLph,
  'para a mesma massa de ar, estimativa volumétrica com etanol deve superar a estimativa com gasolina');
const flexReferenceEstimate = estimateFuelRateLph({ mafGs: 2.5, fuelType: 'FLEX' });
assert.ok(flexReferenceEstimate, 'FLEX sem PID 0152 deve continuar mostrando uma estimativa identificada');
assert.strictEqual(flexReferenceEstimate.source, 'ESTIMATED_FLEX',
  'mistura de referência precisa ser identificada como estimativa, não taxa medida');
assert.ok(flexReferenceEstimate.rateLph > 0 && flexReferenceEstimate.rateLph < 80);
assert.strictEqual(estimateFuelRateLph({ mafGs: 2.5, fuelType: 'FLEX', ethanolPercent: 100 }).source, 'ESTIMATED_MAF',
  'composição de etanol medida deve usar a fonte MAF');
assert.strictEqual(estimateFuelRateLph({ mafGs: 2.5, fuelType: 'FLEX', ethanolPercent: 0 }).source, 'ESTIMATED_MAF',
  'composição de gasolina medida deve usar a fonte MAF');
const flexMapReference = estimateFuelRateLph({
  mapKpa: 39, rpm: 800, intakeAirTempC: 33, displacementCm3: 1389, fuelType: 'FLEX',
});
assert.ok(flexMapReference && flexMapReference.source === 'ESTIMATED_FLEX',
  'o fallback MAP deve estimar em FLEX sem PID 0152 usando a mistura de referência identificada');
assert.strictEqual(calculateInstantaneousConsumptionKml(60, 1), null,
  'consumo instantâneo de 60 km/L deve ser suprimido, não exibido como leitura plausível');
assert.strictEqual(calculateInstantaneousConsumptionKml(60, 0), null,
  'taxa zero não pode produzir divisão infinita ou consumo inventado');
assert.strictEqual(calculateInstantaneousConsumptionKml(60, 6), 10,
  'taxa e velocidade válidas devem produzir o consumo instantâneo calculado');
assert.strictEqual(estimateFuelRateLph({ mafGs: NaN, fuelType: 'ETANOL' }), null);
assert.strictEqual(estimateFuelRateLph({ mafGs: 655.35, fuelType: 'ETANOL' }), null,
  'MAF com formato de sentinela serial não pode virar estimativa');
assert.strictEqual(estimateFuelRateLph({ mafGs: 250, fuelType: 'ETANOL' }), null,
  'MAF fora do envelope plausível deve ser rejeitado');
assert.strictEqual(estimateFuelRateLph({ mafGs: 2.5, airFuelRatio: 14.7, fuelDensityKgPerL: 0.745 }).source,
  'ESTIMATED_MAF', 'calibração explícita deve continuar disponível');

console.log('fuelConsumption fallback: OK');
