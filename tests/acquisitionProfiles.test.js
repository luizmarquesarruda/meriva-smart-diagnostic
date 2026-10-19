const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const settings = read('src/database/appSettings.ts');
const settingsScreen = read('app/configuracoes.tsx');
const policy = JSON.parse(read('src/knowledge/polling_policy.json'));
const service = read('src/trip/autoTripService.ts');

assert.match(settings, /acquisitionProfile:\s*AcquisitionProfile/);
assert.match(settings, /acquisitionProfile:\s*'STANDARD'/);
assert.match(settings, /parsed\.acquisitionProfile === 'COCKPIT_PRIORITY'/);
assert.match(settings, /elmAdaptiveTimeoutMaxMs:\s*Math\.max\(/,
  'a leitura das configurações não pode aceitar timeout mínimo maior que o máximo');

assert.match(settingsScreen, /settings\.acquisitionProfile === 'STANDARD'/);
assert.match(settingsScreen, /settings\.acquisitionProfile === 'COCKPIT_PRIORITY'/);
assert.match(settingsScreen, /updateSetting\('elmAdaptiveTimeoutMaxMs', value\)/);
assert.match(settingsScreen, /updateSetting\('elmAdaptiveTimeoutMinMs', value\)/);
assert.match(settingsScreen, /next\.elmAdaptiveTimeoutMaxMs = Math\.max/);
assert.match(settingsScreen, /next\.elmAdaptiveTimeoutMinMs = Math\.min/);
assert.match(settingsScreen, /\[3, 5, 10\]\.map/,
  'tentativas de conexão devem corresponder ao limite aceito pelo parser de configurações');
assert.doesNotMatch(settingsScreen, /\[3, 10, 20\]\.map/,
  'a interface não deve oferecer 20 tentativas se o parser limita a opção a 10');

assert.deepStrictEqual(Object.keys(policy.acquisitionProfiles).sort(), ['COCKPIT_PRIORITY', 'STANDARD']);
assert.strictEqual(policy.acquisitionProfiles.STANDARD.optionalSamplingMultiplier, 1);
assert.strictEqual(policy.acquisitionProfiles.COCKPIT_PRIORITY.optionalSamplingMultiplier, 2);
assert.strictEqual(policy.acquisitionProfiles.STANDARD.rotatingTelemetryEveryCycles, 1);
assert.strictEqual(policy.acquisitionProfiles.COCKPIT_PRIORITY.rotatingTelemetryEveryCycles, 2);

assert.match(service, /this\.acquisitionProfile = settings\.acquisitionProfile/);
assert.match(service, /nextSettings\.acquisitionProfile !== this\.acquisitionProfile/);
assert.match(service, /FUEL_ESTIMATE_EVERY_N_CYCLES \* optionalSamplingMultiplier/);
assert.match(service, /FUEL_LEVEL_EVERY_N_CYCLES \* optionalSamplingMultiplier/);
assert.match(service, /fuelCompositionPolicy\.everyCycles \* optionalSamplingMultiplier/);
assert.match(service, /this\.pollCycleNumber % acquisitionPolicy\.rotatingTelemetryEveryCycles === 0/);
assert.match(service, /queryPid\('010D'\)/);
assert.match(service, /queryPid\('010C'\)/);
assert.match(service, /queryPid\('015E'\)/);

console.log('Acquisition profiles and settings invariants: OK');
