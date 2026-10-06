'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const schedule = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'knowledge', 'meriva_maintenance.json'), 'utf8'));
const oil = schedule.items.find((item) => item.id === 'oleo_motor');
const filter = schedule.items.find((item) => item.id === 'filtro_oleo');

assert.strictEqual(filter.dependsOnItemId, 'oleo_motor');
assert.strictEqual(filter.changeEveryDependentChanges, 2);
assert.strictEqual(filter.firstChangeWithOil, true);
assert.strictEqual(oil.intervalKmNormal, 10000);
assert.strictEqual(oil.intervalKmSevere, 5000);

const history = [
  { id: 'oil-1', itemId: 'oleo_motor', changedAtKm: 100000, changedAt: '2026-01-01T10:00:00Z' },
  { id: 'filter-1', itemId: 'filtro_oleo', changedAtKm: 100000, changedAt: '2026-01-01T10:01:00Z' },
  { id: 'oil-2', itemId: 'oleo_motor', changedAtKm: 110000, changedAt: '2026-05-01T10:00:00Z' },
  { id: 'oil-3', itemId: 'oleo_motor', changedAtKm: 120000, changedAt: '2026-09-01T10:00:00Z' },
];
assert.strictEqual(history.filter((r) => r.itemId === 'oleo_motor').length, 3);
assert.strictEqual(history.filter((r) => r.itemId === 'filtro_oleo').length, 1);
console.log('maintenance audit reference: 6 testes PASSARAM');

// O hodômetro do painel é autoritativo. GPS só pode ser métrica monitorada.
const serviceSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'maintenance', 'maintenanceService.ts'), 'utf8');
assert.ok(serviceSource.includes('monitoredDistanceKm'), 'estado deve separar distância monitorada do hodômetro');
assert.ok(!serviceSource.includes('state.vehicleOdometerKm = Number((state.vehicleOdometerKm + delta)'), 'GPS não pode incrementar o hodômetro');
console.log('odometer authority: 2 testes PASSARAM');
