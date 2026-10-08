const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
for (const route of ['/dados', '/saude', '/mais']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
assert.match(read('app/dados.tsx'), /getLivePidTrend/);
assert.match(read('app/dados.tsx'), /formatSparkline/);
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/saude.tsx'), /hasLiveEvidence/, 'Saúde não pode declarar normalidade sem evidência ao vivo');
assert.match(read('app/saude.tsx'), /EVIDÊNCIA INSUFICIENTE/, 'Saúde deve declarar quando não há evidência suficiente');
assert.match(read('app/laboratorio.tsx'), /SCORE HEURÍSTICO/, 'score não pode ser apresentado como probabilidade');
assert.match(read('app/saude.tsx'), /5000/, 'tela de saúde não deve recalcular a IA a cada segundo');
assert.match(read('src/diagnostics/diagnosticEngine.ts'), /MAX_SNAPSHOT_SKEW_MS = 2_000/, 'regras combinadas exigem snapshot temporal coerente');
assert.match(read('src/diagnostics/diagnosticEngine.ts'), /TEMPORAL_MIN_SAMPLES = 10/, 'regras de tendência exigem persistência temporal');
assert.match(read('src/diagnostics/diagnosticEngine.ts'), /rpm.value > 400/, 'regras de mistura devem exigir motor ligado');
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);
console.log('Cockpit e telas secundárias: OK');