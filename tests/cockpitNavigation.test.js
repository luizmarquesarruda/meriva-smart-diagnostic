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
// A settings reload on screen focus must not restart the OBD effect merely
// because readAppSettings returned a fresh object; navigation remains visible
// in both orientations.
assert.doesNotMatch(index, /\}, \[isHydrated, settings\]\);/, 'objeto settings inteiro não pode reiniciar o efeito de conexão');
assert.match(index, /settings\?\.elmMaxConnectionAttempts/, 'efeito deve reagir às opções OBD efetivamente alteradas');
assert.match(index, /bottomNavLandscape/, 'navegação inferior deve continuar disponível em paisagem');
assert.doesNotMatch(index, /!layout\.landscape\s*&&\s*\(/, 'navegação não deve desaparecer ao girar o aparelho');

const dataScreen = read('app/dados.tsx');
assert.match(dataScreen, /buildTelemetryChart/, 'tela Dados deve usar o modelo de gráfico testável');
assert.match(dataScreen, /getLiveSeries/, 'gráfico ao vivo deve reutilizar a janela de telemetria existente');
assert.match(dataScreen, /source === 'REAL_OBD'/, 'histórico deve excluir viagens simuladas e seeds');
assert.match(dataScreen, /item\.source === 'REAL'/, 'últimas leituras devem excluir origem de simulação');
assert.match(dataScreen, /telemetrySamples/, 'histórico deve reutilizar amostras persistidas por viagem');
assert.match(dataScreen, /VIAGENS SALVAS/, 'tela deve oferecer modo interativo de histórico');
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