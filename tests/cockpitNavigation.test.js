const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(ROOT, file), 'utf8');

const index = read('app/index.tsx');
const more = read('app/mais.tsx');
const laboratory = read('app/laboratorio.tsx');
for (const route of ['/dados', '/mais']) assert.match(index, new RegExp(route.replace('/', '\\/')), 'cockpit deve expor a rota ' + route);
assert.doesNotMatch(index, /href="\/saude"/, 'saúde detalhada não deve duplicar o cartão na página inicial');
assert.match(more, /'\/saude'/, 'a central de saúde deve continuar acessível em Mais Recursos');
for (const file of ['app/dados.tsx', 'app/saude.tsx', 'app/mais.tsx', 'app/veiculo.tsx', 'app/viagens.tsx', 'app/aprendizado.tsx']) {
  assert.equal(fs.existsSync(path.join(ROOT, file)), true, file + ' deve existir');
}
assert.match(read('app/dados.tsx'), /getLivePidTrend/);
assert.match(read('app/dados.tsx'), /formatSparkline/);
assert.match(read('app/saude.tsx'), /runLocalDiagnostic/);
assert.match(read('app/saude.tsx'), /activeDtcs/);
assert.match(read('app/aprendizado.tsx'), /realSamples/);
assert.match(read('app/laboratorio.tsx'), /03 \/ 07 \/ 0A/);
assert.match(read('app/bluetooth.tsx'), /SAÚDE DO ELM327/);
assert.match(more, /CONSULTA MANUAL DE PID/);
assert.match(more, /\/laboratorio/);
assert.match(laboratory, /CONSULTA MANUAL/);
assert.match(laboratory, /PIDs REGISTRADOS \/ DESCOBERTOS/);
assert.match(laboratory, /state\.pidDiscovery\?\.supportedPids/);
assert.match(laboratory, /setSupportedPids\(existing\.supportedPids\)/);
assert.match(laboratory, /PID inválido/);
assert.match(laboratory, /setPid\(value\)/);
console.log('Cockpit e telas secundárias: OK');