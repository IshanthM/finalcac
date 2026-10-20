// Two phones in two browsers through the local relay (npm run relay:dev; npm run build && npx vite preview --port 4173).
//   node tools/e2e-multi.mjs [appBase] [relayHttp]
import { open } from './e2e-lib.mjs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'http://localhost:8787';
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${ok ? '' : '  ' + extra}`); };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const profile = { freqHz: 13287, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };

const { code } = await (await fetch(`${relay}/api/stores`, { method: 'POST' })).json();
const st = (role, extra = {}, withProfile = true) => ({
  'resonance.state.v1': JSON.stringify({ role, storeCode: code, zone: null, profile: withProfile ? profile : null, ...extra }),
  'resonance.relay': relay,
});

// Staff console
const con = await open(`${base}#/console`, null, { storage: st('staff') });
await con.page.getByRole('button', { name: 'Enable alerts' }).click();
await con.page.waitForFunction(() => /Connected/.test(document.body.innerText), null, { timeout: 8000 });
check('console shows the store code', (await con.page.innerText('.code-big')).trim() === code);

// Listener A: Fitting Room 2, online, hears a ring
const A = await open(`${base}#/listener`, '.scratch/single.wav', { storage: st('listener', { zone: { name: 'Fitting Room 2', type: 'fitting' } }) });
await A.page.waitForFunction(() => /connected/.test(document.body.innerText), null, { timeout: 8000 });
await sleep(500);
const zonesText = await con.page.innerText('.zones');
check('console sees the listener zone online', /Fitting Room 2/i.test(zonesText) && /Listening/.test(zonesText), zonesText);
const chipA = (await A.page.innerText('.chip')).trim();
check('listener knows a console is online', !/no staff console/.test(chipA), chipA);
await A.page.getByRole('button', { name: 'Start listening' }).click();

await con.page.waitForSelector('[role=alertdialog]', { timeout: 25000 });
const alert = await con.page.innerText('[role=alertdialog]');
check('ring on the listener raises the full-screen alert on the console', /Fitting Room 2/i.test(alert) && /TAMPER/i.test(alert), alert.replace(/\n/g, ' | '));
await con.page.screenshot({ path: '.scratch/console-alert.png' });
check('listener stays quiet when staff are reachable (no local alarm)', (await A.page.locator('[role=alertdialog]').count()) === 0);
check('listener notes that staff were alerted', /Staff alerted/.test(await A.page.innerText('main')));
await con.page.getByRole('button', { name: /Acknowledge tamper/ }).click();
await con.page.waitForSelector('[role=alertdialog]', { state: 'detached', timeout: 4000 });
await sleep(500);
const rows = await con.page.innerText('ul.log');
check('console log shows the tamper as acknowledged', /Tamper, acknowledged/.test(rows), rows.replace(/\n/g, ' | '));
const dash = await open(`${base}dashboard.html?store=${code}`, null, { storage: { 'resonance.relay': relay } });
await dash.page.waitForSelector('.stats', { timeout: 8000 });
const dtxt = await dash.page.innerText('main');
check('dashboard counts the alert and shows the zone', /1\s*Tamper alerts/.test(dtxt) && /Fitting Room 2/i.test(dtxt), dtxt.replace(/\n/g, ' | ').slice(0, 300));
await dash.page.screenshot({ path: '.scratch/dashboard.png', fullPage: true });
check('profile was shared to the store by the listener', /13,287 Hz/.test(dtxt));

await A.browser.close(); // stop A's looping ring so it does not mix with B's alert

// Listener B: offline at first (relay unreachable) -> local alarm, queued -> delivered, marked delayed, after reconnect
const B = await open(`${base}#/listener`, '.scratch/single.wav', { storage: { ...st('listener', { zone: { name: 'Fitting Room 1', type: 'fitting' } }), 'resonance.relay': 'http://localhost:9' } });
await B.page.getByRole('button', { name: 'Start listening' }).click();
await B.page.waitForSelector('[role=alertdialog]', { timeout: 25000 });
const local = await B.page.innerText('[role=alertdialog]');
check('offline listener still alarms locally', /Fitting Room 1/i.test(local) && /TAMPER/i.test(local), local.replace(/\n/g, ' | '));
await B.page.getByRole('button', { name: /Acknowledge tamper/ }).click();
await B.page.evaluate((r) => localStorage.setItem('resonance.relay', r), relay);
await con.page.waitForSelector('[role=alertdialog]', { timeout: 30000 });
const late = await con.page.innerText('[role=alertdialog]');
check('queued detection reaches the console after reconnect, marked delayed', /Fitting Room 1/i.test(late) && /delayed/i.test(late), late.replace(/\n/g, ' | '));

const noisy = /Failed to load resource|WebSocket connection|ERR_CONNECTION|ERR_/;
check('no console errors anywhere', [con, A, B, dash].every((t) => t.errors.filter((e) => !noisy.test(e)).length === 0), JSON.stringify([con, A, B, dash].map((t) => t.errors)));
for (const t of [con, B, dash]) await t.browser.close();
console.log(`\n${results.filter(Boolean).length}/${results.length} passed`);
process.exit(results.every(Boolean) ? 0 : 1);
