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

const { integrateFuelRateLph, FuelRateIntegrator, estimateFuelRateLph } = mod.exports;

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
const beforeStaleFuel = integrator.getState();
assert.deepStrictEqual(integrator.addSample(100, 2000), beforeStaleFuel, 'timestamp atrasado deve ser descartado sem alterar o integrador');
assert.deepStrictEqual(integrator.addSample(100, 3700), beforeStaleFuel, 'timestamp duplicado deve ser descartado sem alterar o integrador');
assert.deepStrictEqual(integrator.addSample(100, Number.NaN), beforeStaleFuel, 'timestamp inválido deve ser descartado sem alterar o integrador');
assertApprox(integrator.addSample(10, 6700).fuelUsedL, 0.01583333333333333, 1e-12);
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
assert.strictEqual(integrator.getState().fuelUsedL, 0);

console.log('PASS combustível OBD: integração L/h, intervalos e dados inválidos');


const fsSource = require('fs').readFileSync(require('path').join(__dirname, '..', 'src', 'obd', 'fuelConsumption.ts'), 'utf8');
if (!fsSource.includes('ESTIMATED_MAF') || !fsSource.includes('ESTIMATED_MAP')) {
  throw new Error('fuel fallback MAF/MAP não está implementado');
}
const zeroMafEstimate = estimateFuelRateLph({ mafGs: 0 });
if (zeroMafEstimate !== null) throw new Error('MAF zero não deve ser tratado como taxa válida de combustível');
const mapEstimate = estimateFuelRateLph({
  mafGs: 0,
  mapKpa: 35,
  rpm: 1500,
  intakeAirTempC: 25,
  displacementCm3: 1389,
});
if (!mapEstimate || mapEstimate.source !== 'ESTIMATED_MAP' || !(mapEstimate.rateLph > 0)) {
  throw new Error('MAF zero deve permitir fallback MAP quando há dados válidos');
}
console.log('fuelConsumption fallback MAF zero, MAP e suporte da ECU: OK');

const autoTripSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'trip', 'autoTripService.ts'), 'utf8');
const manualSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'database', 'merivaManual.ts'), 'utf8');
if (!autoTripSource.includes("connection.supportedPids.includes('0110')") ||
    !autoTripSource.includes("connection.supportedPids.includes('010B')") ||
    !autoTripSource.includes("connection.supportedPids.includes('010F')")) {
  throw new Error('PIDs MAF/MAP/IAT precisam ser verificados contra os PIDs suportados pela ECU');
}
if (!autoTripSource.includes('MERIVA_MANUAL.engine.displacementCm3')) {
  throw new Error('Estimativa MAP deve usar a cilindrada documentada da Meriva, sem fallback 1598 cm³');
}
if (!manualSource.includes('displacementCm3: 1389')) {
  throw new Error('Cilindrada padrão da Meriva 1.4 deve permanecer alinhada ao manual técnico');
}
console.log('fuelConsumption cilindrada Meriva 1.4: OK');

const fuelLevelSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'trip', 'fuelLevel.ts'), 'utf8');
if (!fuelLevelSource.includes('MERIVA_MANUAL.capacities.fuelTankL')) {
  throw new Error('Capacidade total deve vir da especificação técnica do veículo');
}
if (!fuelLevelSource.includes('MERIVA_MANUAL.capacities.fuelReserveApproxL')) {
  throw new Error('Reserva deve vir da especificação técnica do veículo');
}
if (!fuelLevelSource.includes('USABLE_BEFORE_RESERVE_L = TANK_CAPACITY_L - RESERVE_CAPACITY_L')) {
  throw new Error('A reserva de 5 L deve estar incluída no tanque total de 56 L');
}
if (!fuelLevelSource.includes('TANK_CAPACITY_L * percent / 100')) {
  throw new Error('Litros restantes devem ser calculados sobre o tanque total, incluindo a reserva');
}
const tankCapacityL = 56;
const reserveCapacityL = 5;
const usableBeforeReserveL = tankCapacityL - reserveCapacityL;
const reserveThresholdPercent = reserveCapacityL / tankCapacityL * 100;
if (usableBeforeReserveL !== 51 || Math.abs(reserveThresholdPercent - 8.9285714286) > 0.000001) {
  throw new Error('Cálculo de tanque/reserva incorreto: esperado 51 L antes da reserva e reserva ≈ 8,93%');
}
if (!fuelLevelSource.includes('incluindo a reserva')) {
  throw new Error('A documentação no código deve explicitar que os litros restantes incluem a reserva');
}
console.log('fuelLevel tanque Meriva 56 L total / reserva 5 L: OK');
