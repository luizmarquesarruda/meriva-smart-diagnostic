'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');
const Module = require('node:module');

const root = path.resolve(__dirname, '..');
const sourcePath = path.join(root, 'src/maintenance/maintenanceRules.ts');
const source = fs.readFileSync(sourcePath, 'utf8');
const js = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2019, esModuleInterop: true },
}).outputText;
const originalLoad = Module._load;
Module._load = function(request) {
  if (request === '../database/merivaManual') return {
    MERIVA_MANUAL: { maintenance: {
      normalOilChangeKm: 10000, normalOilChangeMonths: 12,
      severeOilChangeKm: 5000, severeOilChangeMonths: 6,
      normalInspectionKm: 10000, normalInspectionMonths: 12,
      coolantChangeKm: 150000, coolantChangeYears: 5,
      brakeFluidChangeYears: 2, tireRotationMaxKm: 10000,
    } },
  };
  return originalLoad.apply(this, arguments);
};
const mod = new Module(sourcePath, null);
mod.filename = sourcePath;
mod.paths = Module._nodeModulePaths(path.dirname(sourcePath));
mod._compile(js, sourcePath);
Module._load = originalLoad;

const { addCalendarMonths, evaluateMaintenance, getMaintenanceTasks, parseLocalDate } = mod.exports;
const normalOil = getMaintenanceTasks(false).find((task) => task.id === 'ENGINE_OIL');
const severeOil = getMaintenanceTasks(true).find((task) => task.id === 'ENGINE_OIL');
assert.equal(normalOil.intervalKm, 10000);
assert.equal(normalOil.intervalMonths, 12);
assert.equal(severeOil.intervalKm, 5000);
assert.equal(severeOil.intervalMonths, 6);
assert.equal(parseLocalDate('2024-02-29') instanceof Date, true);
assert.equal(parseLocalDate('2025-02-29'), null);
assert.equal(parseLocalDate('not-a-date'), null);

const endOfMonth = parseLocalDate('2025-10-31');
assert.equal(addCalendarMonths(endOfMonth, 6).getFullYear(), 2026);
assert.equal(addCalendarMonths(endOfMonth, 6).getMonth(), 3);
assert.equal(addCalendarMonths(endOfMonth, 6).getDate(), 30);

const task = { id: 'ENGINE_OIL', title: 'Óleo', description: '', intervalKm: 5000, intervalMonths: 6 };
const record = { lastServiceAt: '2025-10-31', lastServiceOdometerKm: 10000 };
assert.equal(evaluateMaintenance(task, record, 14999, new Date(2026, 3, 29, 12)).status, 'UP_TO_DATE');
const kmDue = evaluateMaintenance(task, record, 15000, new Date(2026, 3, 29, 12));
assert.equal(kmDue.status, 'DUE');
assert.equal(kmDue.dueByKm, true);
const dateDue = evaluateMaintenance(task, record, 13000, new Date(2026, 3, 30, 12));
assert.equal(dateDue.status, 'DUE');
assert.equal(dateDue.dueByDate, true);
assert.equal(evaluateMaintenance(task, null, null, new Date(2026, 0, 1, 12)).status, 'INCOMPLETE');
assert.equal(evaluateMaintenance(task, { lastServiceAt: 'bad', lastServiceOdometerKm: 10000 }, null).status, 'INCOMPLETE');

const screen = fs.readFileSync(path.join(root, 'app/mais.tsx'), 'utf8');
assert.match(screen, /MANUTENÇÃO E ABASTECIMENTO/);
assert.match(screen, /\/manutencao/);
console.log('maintenanceRules.test.js: PASS');
