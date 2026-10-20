// Integration test against a running relay:  npm run relay:dev   then   npm run e2e:relay [ws://localhost:8787]
const relay = process.argv[2] ?? 'ws://localhost:8787';
const http = relay.replace(/^ws/, 'http');
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(code, qs) {
  const ws = new WebSocket(`${relay}/api/stores/${code}/ws?${qs}`);
  const msgs = [];
  const c = { ws, msgs, send: (o) => ws.send(typeof o === 'string' ? o : JSON.stringify(o)), of: (t) => msgs.filter((m) => m.t === t) };
  c.ready = new Promise((res, rej) => { ws.onopen = () => res(c); ws.onerror = () => rej(new Error('ws error')); });
  ws.onmessage = (e) => msgs.push(JSON.parse(String(e.data)));
  return c;
}
const listener = (code, zone, type) => client(code, `role=listener&zone=${encodeURIComponent(zone)}&type=${type}`).ready;
const consoleWs = (code) => client(code, 'role=console').ready;

const created = await (await fetch(`${http}/api/stores`, { method: 'POST' })).json();
const code = created.code;
check('store created with a 6-char code', /^[A-HJ-NP-Z2-9]{6}$/.test(code), JSON.stringify(created));
check('unknown store code is rejected', (await fetch(`${http}/api/stores/ZZZZZZ`)).status === 404);

const con = await consoleWs(code);
const A = await listener(code, 'Fitting Room 2', 'fitting');
const B = await listener(code, 'Sales Floor', 'floor');
const R = await listener(code, 'Register 1', 'register');
await sleep(300);
const zones = con.of('zones').at(-1)?.zones ?? [];
check('console sees all three zones online', zones.length === 3 && zones.every((z) => z.online), JSON.stringify(zones));
check('listeners are told a console is online', A.of('zones').at(-1)?.consoles === 1 || A.of('state')[0]?.consoles === 1);

// 1) two listeners hear one event: attributed to the louder, other listed
A.send({ t: 'detect', snr: 24, freq: 13300 });
await sleep(80);
B.send({ t: 'detect', snr: 13, freq: 13302 });
await sleep(700);
const inc = con.of('incident');
check('one incident for two listeners', inc.length === 1, `${inc.length} incidents`);
check('attributed to the louder zone', inc[0]?.incident.zone === 'Fitting Room 2' && inc[0]?.incident.kind === 'tamper');
check('other zone listed as also heard by', JSON.stringify(inc[0]?.incident.alsoHeardBy.map((h) => h.zone)) === '["Sales Floor"]', JSON.stringify(inc[0]?.incident.alsoHeardBy));

// 2) acknowledge from the console reaches everyone and is persisted
con.send({ t: 'ack', id: inc[0].incident.id });
await sleep(300);
check('ack broadcast to listeners too', A.of('ack').length === 1 && con.of('ack').length === 1);
let events = (await (await fetch(`${http}/api/stores/${code}/events`)).json()).events;
check('event log has the incident, acknowledged', events.length === 1 && events[0].ackedAt > 0, JSON.stringify(events));
A.send({ t: 'ack', id: 'x' });
await sleep(150);
check('a listener cannot acknowledge', A.of('error').some((m) => /only a console/.test(m.msg)));

// 3) register zone = quiet checkout
await sleep(1100);
R.send({ t: 'detect', snr: 22, freq: 13300 });
await sleep(700);
check('register zone logs a checkout', con.of('incident').at(-1)?.incident.kind === 'checkout' && con.of('incident').at(-1)?.incident.zone === 'Register 1');

// 4) late second listener inside 1 s extends "also heard by" via update, attribution unchanged
await sleep(1100);
A.send({ t: 'detect', snr: 15, freq: 13300 });
await sleep(450);
B.send({ t: 'detect', snr: 30, freq: 13300 });
await sleep(400);
const upd = con.of('update').at(-1);
check('late report -> update, zone unchanged', upd?.incident.zone === 'Fitting Room 2' && upd?.incident.alsoHeardBy[0]?.zone === 'Sales Floor', JSON.stringify(upd));

// 5) shared tag profile: pushed by one phone, delivered to others and to later joiners
const profile = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [13299, 13301] };
A.send({ t: 'profile', profile });
await sleep(300);
check('profile broadcast to other listeners', B.of('profile').length === 1 && B.of('profile')[0].profile.freqHz === 13300);
const late = await listener(code, 'Fitting Room 1', 'fitting');
await sleep(300);
check('a new listener receives the stored profile and recent events', late.of('state')[0].profile?.freqHz === 13300 && late.of('state')[0].incidents.length >= 2);
A.send({ t: 'profile', profile: { ...profile, freqHz: 99 } });
await sleep(150);
check('invalid profile rejected', A.of('error').some((m) => /bad message/.test(m.msg)));

// 6) limits
await sleep(1100);
for (let i = 0; i < 12; i++) A.send({ t: 'detect', snr: 20, freq: 13300 });
await sleep(400);
check('per-socket flood is rate limited', A.of('error').filter((m) => m.msg === 'rate limited').length >= 5, `${A.of('error').length} errors`);
A.send('x'.repeat(3000));
await sleep(150);
check('oversized message refused', A.of('error').some((m) => /too large/.test(m.msg)));
A.send('{not json');
await sleep(150);
check('bad JSON refused without dropping the socket', A.of('error').some((m) => /bad json/.test(m.msg)) && A.ws.readyState === 1);
const refused = await new Promise((res) => {
  const w = new WebSocket(`${relay}/api/stores/${code}/ws?role=listener&zone=&type=fitting`);
  w.onopen = () => { w.close(); res(false); };
  w.onerror = () => res(true);
  w.onclose = () => res(true);
});
check('listener without a zone is refused', refused);

// 7) store creation limit (default 10/hour/IP). Only checked when the relay runs with the default limit.
if (process.env.CHECK_CREATE_LIMIT) {
  let limited = false;
  for (let i = 0; i < 12 && !limited; i++) limited = (await fetch(`${http}/api/stores`, { method: 'POST' })).status === 429;
  check('store creation is rate limited per IP', limited);
}

for (const c of [con, A, B, R, late]) c.ws.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
