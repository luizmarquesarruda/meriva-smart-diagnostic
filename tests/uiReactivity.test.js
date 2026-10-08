const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const hook = fs.readFileSync(path.join(root, 'src', 'ui', 'useAppEventRevision.ts'), 'utf8');
const dados = fs.readFileSync(path.join(root, 'app', 'dados.tsx'), 'utf8');
const laboratorio = fs.readFileSync(path.join(root, 'app', 'laboratorio.tsx'), 'utf8');

assert(hook.includes('Promise.resolve().then'), 'eventos consecutivos devem ser coalescidos por microtask');
assert(hook.includes('typesRef'), 'filtro de eventos não deve forçar resubscrição por identidade de array');
assert(dados.includes('gpsTracker.subscribe(setGpsState)'), 'Dados deve continuar reativo ao GPS');
assert(dados.includes('trip.instantaneousConsumptionKml'), 'Dados deve exibir consumo instantâneo');
assert(laboratorio.includes('isPidDiscoveryCacheUsable'), 'Laboratório deve respeitar o cache contextual');
assert(laboratorio.includes('adapterAddress: device.address.toUpperCase()'), 'Laboratório deve persistir identidade do adaptador');

console.log('uiReactivity.test.js: PASS');
