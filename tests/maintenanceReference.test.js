'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const file = path.join(__dirname, '..', 'src', 'knowledge', 'meriva_maintenance.json');
const schedule = JSON.parse(fs.readFileSync(file, 'utf8'));

assert.strictEqual(schedule.vehicle, 'Chevrolet Meriva Maxx 1.4 8V ECONO.FLEX 2011/2012');
assert.strictEqual(schedule.rules.normal_oil_km, 10000);
assert.strictEqual(schedule.rules.severe_oil_km, 5000);
assert.strictEqual(schedule.rules.normal_oil_months, 12);
assert.strictEqual(schedule.rules.severe_oil_months, 6);

const oil = schedule.items.find((item) => item.id === 'oleo_motor');
const coolant = schedule.items.find((item) => item.id === 'liquido_arrefecimento');
const brake = schedule.items.find((item) => item.id === 'fluido_freio');
assert.strictEqual(oil.intervalKmNormal, 10000);
assert.strictEqual(oil.intervalKmSevere, 5000);
assert.strictEqual(coolant.intervalKmNormal, 150000);
assert.strictEqual(coolant.intervalMonthsNormal, 60);
assert.strictEqual(brake.intervalMonthsNormal, 24);

assert.ok(schedule.items.some((item) => item.id === 'filtro_oleo'));
assert.ok(schedule.items.some((item) => item.id === 'filtro_ar'));
assert.ok(schedule.items.some((item) => item.id === 'filtro_combustivel'));
assert.ok(schedule.items.some((item) => item.id === 'velas'));

console.log('maintenance reference: 8 testes PASSARAM');
