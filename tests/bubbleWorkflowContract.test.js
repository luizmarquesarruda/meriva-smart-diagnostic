const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const ts = require('typescript');

const originalTsLoader = require.extensions['.ts'];
require.extensions['.ts'] = function loadTs(module, filename) {
  const source = fs.readFileSync(filename, 'utf8');
  const result = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
      esModuleInterop: true,
    },
    fileName: filename,
  });
  module._compile(result.outputText, filename);
};

const contractPath = path.join(__dirname, '..', 'src', 'cloud', 'bubbleWorkflowContract.ts');
const clientPath = path.join(__dirname, '..', 'src', 'cloud', 'bubbleWorkflowClient.ts');
const {
  BubbleContractError,
  prepareBubbleReading,
  prepareBubbleGps,
  prepareBubbleTrip,
  prepareBubbleDtc,
  prepareBubblePidSupport,
  prepareBubbleHeartbeat,
  classifyBubbleAcknowledgement,
} = require(contractPath);
const { BubbleWorkflowClient, BubbleWorkflowError } = require(clientPath);

const nowMs = 2_000_000_000_000;
const validReading = (overrides = {}) => ({
  deviceId: 'bubble-device-1',
  tripId: 'bubble-trip-1',
  eventId: 'event-obd-0001',
  pid: '010C',
  a: 0x1A,
  b: 0xF8,
  at: new Date(nowMs - 1000).toISOString(),
  source: 'REAL_OBD',
  ecuValidated: true,
  declared: false,
  ...overrides,
});

const reading = prepareBubbleReading(validReading(), nowMs);
assert.equal(reading.version, 1);
assert.equal(reading.pid, '010C');
assert.equal(reading.a, 0x1A);
assert.equal(reading.b, 0xF8);
assert.equal(reading.status, 'Válido');
assert.equal(reading.declared, false);
assert.equal(reading.trip, 'bubble-trip-1');
assert.throws(() => prepareBubbleReading(validReading({ source: 'SIMULACAO' }), nowMs), BubbleContractError);
assert.throws(() => prepareBubbleReading(validReading({ ecuValidated: false }), nowMs), /ECU/);
assert.throws(() => prepareBubbleReading(validReading({ declared: true }), nowMs), /declarado/i);
assert.throws(() => prepareBubbleReading(validReading({ a: 256 }), nowMs), /byte inteiro/i);
assert.throws(() => prepareBubbleReading(validReading({ b: 1.2 }), nowMs), /byte inteiro/i);
assert.throws(() => prepareBubbleReading(validReading({ pid: '0144' }), nowMs), /catálogo/i);
assert.throws(() => prepareBubbleReading(validReading({ at: new Date(nowMs + 1).toISOString() }), nowMs), /futuro/i);
assert.throws(() => prepareBubbleReading(validReading({ at: new Date(nowMs - 86400001).toISOString() }), nowMs), /24 horas/i);
assert.throws(() => prepareBubbleReading(validReading({ previousAtMs: nowMs - 1200 }), nowMs), /1 segundo/i);

const gps = prepareBubbleGps({
  deviceId: 'bubble-device-1',
  tripId: 'bubble-trip-1',
  eventId: 'event-gps-0001',
  at: new Date(nowMs - 1000).toISOString(),
  lat: -23.55,
  lng: -46.63,
  accuracy: 12,
  speedKmh: 42,
}, nowMs);
assert.equal(gps.version, 1);
assert.equal(gps.speed, 42);
assert.throws(() => prepareBubbleGps({ ...gps, lat: 90 }, nowMs), /Latitude/i);
assert.throws(() => prepareBubbleGps({ ...gps, accuracy: 51 }, nowMs), /Precisão/i);
assert.throws(() => prepareBubbleGps({ ...gps, speedKmh: 251 }, nowMs), /Velocidade/i);
assert.throws(() => prepareBubbleGps({ ...gps, at: new Date(nowMs + 1000).toISOString() }, nowMs), /futuro/i);
assert.throws(() => prepareBubbleGps({ ...gps, previousAtMs: nowMs - 1500 }, nowMs), /1 segundo/i);

const trip = prepareBubbleTrip({
  deviceId: 'bubble-device-1',
  externalId: 'local-trip-42',
  name: 'Viagem 42',
  startAt: new Date(nowMs - 60000).toISOString(),
  endAt: new Date(nowMs - 1000).toISOString(),
  status: 'Concluída',
});
assert.equal(trip.external_id, 'local-trip-42');
assert.throws(() => prepareBubbleTrip({
  deviceId: 'bubble-device-1',
  externalId: 'local-trip-43',
  name: 'Viagem',
  startAt: new Date(nowMs - 60000).toISOString(),
  endAt: new Date(nowMs - 120000).toISOString(),
  status: 'Concluída',
}), /anteceder/i);

assert.equal(prepareBubbleDtc({
  deviceId: 'bubble-device-1',
  code: 'p010c',
  description: 'DTC de teste',
  severity: 'Alerta',
  confirmed: true,
  at: new Date(nowMs - 1000).toISOString(),
}).code, 'P010C');
assert.throws(() => prepareBubbleDtc({
  deviceId: 'bubble-device-1',
  code: 'RPM',
  description: 'inválido',
  severity: 'Alerta',
  confirmed: true,
  at: new Date(nowMs - 1000).toISOString(),
}), /DTC/i);
assert.equal(prepareBubblePidSupport('bubble-device-1', '010C', false).supported, false);
assert.throws(() => prepareBubblePidSupport('bubble-device-1', '0144', true), /catálogo/i);
assert.equal(prepareBubbleHeartbeat('bubble-device-1', 'Conectado', -65, '1.0.1').signal, -65);

assert.equal(classifyBubbleAcknowledgement({ accepted: true }), 'ACCEPTED');
assert.equal(classifyBubbleAcknowledgement({ accepted: true, duplicate: true }), 'DUPLICATE_ACCEPTED');
assert.equal(classifyBubbleAcknowledgement({ accepted: false }), 'REJECTED');
assert.equal(classifyBubbleAcknowledgement({ status: 'success' }), 'UNKNOWN');

async function testClient() {
  let clock = nowMs;
  const requests = [];
  const fakeFetch = async (url, init) => {
    requests.push({ url: String(url), init });
    const body = String(url).endsWith('/v1_login')
      ? { status: 'success', response: { token: 'session-token-123', user_id: 'user-1' } }
      : { status: 'success', response: { accepted: true, duplicate: false } };
    return { ok: true, status: 200, json: async () => body };
  };
  const client = new BubbleWorkflowClient(
    'https://meriva-smart.bubbleapps.io/version-test/api/1.1/wf/',
    { fetcher: fakeFetch, now: () => clock },
  );

  await assert.rejects(() => client.heartbeat('device', 'Conectado', 50, '1.0.1'), BubbleWorkflowError);
  assert.equal((await client.login('user@example.com', 'password')).userId, 'user-1');
  assert.equal(client.isAuthenticated, true);

  const first = validReading({ at: new Date(clock - 1000).toISOString() });
  assert.equal((await client.sendReading(first)).accepted, true);
  const second = validReading({ eventId: 'event-obd-0002', at: new Date(clock - 1000).toISOString() });
  await assert.rejects(() => client.sendReading(second), /1 segundo/i);
  clock += 1000;
  second.at = new Date(clock - 1000).toISOString();
  assert.equal((await client.sendReading(second)).accepted, true);

  const authenticatedRequest = requests.find((request) => request.url.endsWith('/v1_reading'));
  assert.equal(authenticatedRequest.init.headers.Authorization, 'Bearer session-token-123');
  assert.equal(JSON.parse(authenticatedRequest.init.body).event_id, 'event-obd-0001');
  assert.equal(requests.filter((request) => request.url.endsWith('/v1_reading')).length, 2);

  client.clearSession();
  assert.equal(client.isAuthenticated, false);
  await assert.rejects(() => client.heartbeat('device', 'Conectado', 50, '1.0.1'), /login/i);
  assert.throws(() => new BubbleWorkflowClient('http://meriva-smart.bubbleapps.io/version-test/api/1.1/wf'), /HTTPS/i);
  assert.throws(() => new BubbleWorkflowClient('https://meriva-smart.bubbleapps.io/version-test'), /api\/1.1\/wf/i);
}

testClient()
  .then(() => {
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    console.log('Bubble Workflow contract tests passed.');
  })
  .catch((error) => {
    if (originalTsLoader) require.extensions['.ts'] = originalTsLoader;
    else delete require.extensions['.ts'];
    console.error(error);
    process.exitCode = 1;
  });
