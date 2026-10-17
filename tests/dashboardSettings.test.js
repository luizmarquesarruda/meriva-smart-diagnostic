'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');

const settings = fs.readFileSync('src/database/appSettings.ts', 'utf8');
const config = fs.readFileSync('app/configuracoes.tsx', 'utf8');
const cockpit = fs.readFileSync('app/index.tsx', 'utf8');
const health = fs.readFileSync('app/saude.tsx', 'utf8');

assert.match(settings, /homePrimaryMetric: 'TEMPERATURE'/, 'temperatura deve ser o indicador inicial, não velocidade');
assert.match(settings, /homeAutoRotate: false/, 'rotação automática deve ser opt-in');
assert.match(settings, /showSpeedMetric: false/, 'velocidade deve ficar oculta por padrão');
assert.match(settings, /largeText: true/, 'texto maior deve vir ativado por padrão');
assert.match(config, /Indicador principal do painel/);
assert.match(config, /CONSUMO km\/L/);
assert.match(config, /FALHAS ATIVAS/);
assert.match(config, /Alternar indicadores automaticamente/);
assert.match(config, /Textos e botões maiores/);
assert.match(config, /Animações suaves da interface/);
assert.match(config, /minHeight: 48/, 'opções de configuração devem ter alvo de toque grande');
assert.match(cockpit, /metric\.id !== 'SPEED' \|\| settings\?\.showSpeedMetric/);
assert.match(cockpit, /settings\?\.homeAutoRotate/);
assert.match(cockpit, /Animated\.timing/);
assert.match(cockpit, /bottomNavItem:\{[^}]*minHeight:44/);
assert.match(health, /CARSCANNER_BASELINE/);
assert.match(health, /composeDiagnosticResponse/);
console.log('Dashboard settings, readability and AI provenance: OK');
