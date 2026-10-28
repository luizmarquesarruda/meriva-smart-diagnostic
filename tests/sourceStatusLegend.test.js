'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const read = (file) => fs.readFileSync(path.join(root, file), 'utf8');
const guide = read('src/ui/SourceStatusLegend.tsx');
const resources = read('app/mais.tsx');
const data = read('app/dados.tsx');
const trips = read('app/viagens.tsx');
const storage = read('app/armazenamento.tsx');

for (const label of ['MEDIDO', 'ESTIMADO', 'REFERÊNCIA', 'SIMULADO', 'INDISPONÍVEL']) {
  assert.ok(guide.includes(label), 'guia deve distinguir o estado ' + label);
}
assert.match(guide, /A legenda explica os estados possíveis/);
assert.match(guide, /não garante que exista uma leitura atual/);
for (const category of [
  'DIAGNÓSTICO E CONEXÃO',
  'VEÍCULO E CONDUÇÃO',
  'DADOS E APRENDIZADO',
  'HISTÓRICO E RELATÓRIOS',
  'SISTEMA E PREFERÊNCIAS',
]) {
  assert.ok(resources.includes(category), 'central de recursos deve apresentar grupo: ' + category);
}
for (const route of ['/laboratorio', '/testes-sensores', '/saude', '/bluetooth', '/veiculo', '/viagens', '/manutencao', '/dados', '/aprendizado', '/armazenamento', '/conectividade', '/configuracoes']) {
  assert.ok(resources.includes("'" + route + "'"), 'atalho ausente: ' + route);
}
assert.match(resources, /AppIcon name=\{icon as AppIconName\}/, 'cada recurso deve exibir ícone próprio');
assert.match(resources, /group\.icon as AppIconName/, 'cada grupo deve ter ícone de categoria');
assert.ok(data.includes('<SourceStatusLegend />'), 'telemetria deve explicar as classes de origem');
assert.ok(trips.includes('<SourceStatusLegend compact />'), 'viagens devem explicar a origem dos dados');
assert.match(trips, /AppIcon name="trips"/, 'cada viagem deve ter um marcador visual');
assert.ok(storage.includes('<SourceStatusLegend compact />'), 'histórico deve exibir a regra de qualidade');
assert.match(storage, /AppIcon name="history"/, 'exportação JSON deve ter ícone');
assert.match(storage, /AppIcon name="data"/, 'exportação CSV deve ter ícone');
assert.match(storage, /AppIcon name="warning"/, 'limpeza de dados deve ter ícone de alerta');
console.log('Layout por categorias, ícones e guia de qualidade dos dados: PASS');
