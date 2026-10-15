const assert = require('node:assert/strict');
const fs = require('node:fs');
const read = (file) => fs.readFileSync(file, 'utf8');

const exporter = read('src/storage/exportDiagnostics.ts');
const reportScreen = read('app/armazenamento.tsx');
const sensorTests = read('app/testes-sensores.tsx');
const dailyHistory = read('src/meriva/dailyObdHistory.ts');
const autoSave = read('src/meriva/autosaveManager.ts');

assert.ok(exporter.includes('exportDiagnosticsTxt'));
assert.ok(exporter.includes('exportDriveCyclesTxt'));
assert.ok(exporter.includes('.txt'));
assert.ok(!exporter.includes('exportDiagnosticsJson'));
assert.ok(!exporter.includes('exportDriveCyclesCsv'));
assert.ok(reportScreen.includes('GERAR DIAGNÓSTICO TXT'));
assert.ok(reportScreen.includes('GERAR VIAGENS TXT'));
assert.ok(!reportScreen.includes('EXPORTAR JSON'));
assert.ok(!reportScreen.includes('EXPORTAR CSV'));
assert.ok(reportScreen.includes('AUTOSAVE_HISTORY_FILE'));
assert.ok(reportScreen.includes('DAILY_OBD_HISTORY_FILE'));
assert.ok(sensorTests.includes('MERIVA_SMART/RELATORIOS/TESTES'));
assert.ok(sensorTests.includes('.txt'));
assert.ok(autoSave.includes('autosave.json'), 'o estado interno continua usando JSON');
assert.ok(!dailyHistory.includes('MAX_DAYS'), 'o histórico diário não deve descartar páginas por limite fixo');
console.log('Relatórios TXT e retenção do histórico diário: OK');
