'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const read = (relative) => fs.readFileSync(path.join(ROOT, relative), 'utf8');
const lab = read('app/laboratorio.tsx');
const readiness = read('src/obd/readinessMonitor.ts');
const freezeFrame = read('src/obd/dtcScanner.ts');
const tripSummary = read('src/trip/tripSummary.ts');
const tripsPage = read('app/viagens.tsx');
const history = read('src/diagnostics/findingHistory.ts');
const autoTrip = read('src/trip/autoTripService.ts');
const health = read('app/saude.tsx');
const packageJson = JSON.parse(read('package.json'));

// P1 — readiness monitor status (MIL, supported/incomplete states).
assert.ok(readiness.includes('parseReadinessMonitorResponse'));
assert.ok(readiness.includes("execute('0101')"));
assert.ok(lab.includes('scanReadiness'));
assert.ok(lab.includes('LER MONITORES DE EMISSÕES • PID 0101'));
assert.ok(lab.includes('!monitor.supported'));
assert.ok(lab.includes('INCOMPLETO'));

// P2 — Mode 02 is frame-aware and refuses unsupported/unverified PIDs.
assert.ok(freezeFrame.includes('parseFreezeFrameSupportBitmap'));
assert.ok(freezeFrame.includes('isFreezeFramePidSupported'));
assert.ok(freezeFrame.includes("execute('0200' + frameHex)"));
assert.ok(freezeFrame.includes('responseFrame !== frame'));
assert.ok(lab.includes('LER FREEZE FRAME COMPLETO • MODE 02'));
assert.ok(lab.includes('freezeFrameSnapshot.parameters.map'));

// P3 — trip reports show sparse-sample summaries rather than fake zeros.
assert.ok(tripSummary.includes('summarizeTripTelemetry'));
assert.ok(tripSummary.includes('min: Math.min'));
assert.ok(tripSummary.includes('average: valid.reduce'));
assert.ok(tripsPage.includes('VELOCIDADE NAS AMOSTRAS'));
assert.ok(tripsPage.includes('ROTAÇÃO DO MOTOR'));
assert.ok(tripsPage.includes('MÉDIA AMOSTRADA'));

// P4 — findings are persisted in daily JSON/TXT and shown with context.
assert.ok(history.includes("findings_' + date + '.json"));
assert.ok(history.includes("findings_' + date + '.txt"));
assert.ok(history.includes('MIN_OBSERVATION_INTERVAL_MS'));
assert.ok(autoTrip.includes('recordDiagnosticFindings'));
assert.ok(autoTrip.includes('captureDiagnosticHistoryIfDue'));
assert.ok(health.includes('HISTÓRICO TEMPORAL DE EVIDÊNCIAS'));
assert.ok(health.includes('firstSeenAt'));
assert.ok(health.includes('lastSeenAt'));

// Manual PID query — tapping the field opens a searchable local catalog.
assert.ok(lab.includes('PID_DATABASE'));
assert.ok(lab.includes('filteredPidOptions'));
assert.ok(lab.includes('<Modal visible={pidPickerOpen}'));
assert.ok(lab.includes('value={pidPickerSearch}'));
assert.ok(lab.includes('Selecionar PID para consulta manual'));
assert.ok(lab.includes('setPid(definition.pid)'));
assert.ok(lab.includes('onPress={testPid}'));
assert.ok(lab.includes('SUPORTADO'));
assert.ok(packageJson.scripts.test.includes('node tests/fieldFeatures.test.js'));

for (const testPath of [
  'tests/readinessMonitor.test.js',
  'tests/dtcScanner.test.js',
  'tests/dtcManager.test.js',
  'tests/tripSummary.test.js',
  'tests/findingHistory.test.js',
]) {
  assert.ok(packageJson.scripts.test.includes('node ' + testPath), 'test missing from npm test: ' + testPath);
}

console.log('Feature integration contracts: PASS');
