// node tools/e2e-demo.mjs [baseUrl]  — needs .scratch/single.wav (npm run fixtures)
import { open } from './e2e-lib.mjs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const profile = { freqHz: 13287, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };
const mk = (zone) => ({ 'resonance.state.v1': JSON.stringify({ role: 'demo', storeCode: null, zone, profile }) });
const results = [];
const check = (name, ok, extra = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${extra}`); };

async function run(zone, fn) {
  const t = await open(`${base}#/demo`, '.scratch/single.wav', { storage: mk(zone) });
  await t.page.addInitScript(() => {});
  await t.page.evaluate(() => {
    window.__spoken = [];
    const orig = window.speechSynthesis.speak.bind(window.speechSynthesis);
    window.speechSynthesis.speak = (u) => { window.__spoken.push(u.text); try { orig(u); } catch {} };
  });
  await fn(t);
  check('no console errors', t.errors.length === 0, JSON.stringify(t.errors));
  await t.browser.close();
}

await run({ name: 'Fitting Room 2', type: 'fitting' }, async ({ page }) => {
  await page.getByRole('button', { name: 'Start listening' }).click();
  await page.waitForSelector('[role=alertdialog]', { timeout: 20000 });
  const text = await page.innerText('[role=alertdialog]');
  check('real ring raises full-screen alert for the zone', /Fitting Room 2/i.test(text) && /TAMPER/i.test(text), JSON.stringify(text.replace(/\n/g, ' | ')));
  await page.screenshot({ path: '.scratch/alert.png' });
  const spoken = await page.evaluate(() => window.__spoken.filter((t) => t.trim()));
  check('alert is spoken', spoken.some((t) => /tamper in fitting room 2/i.test(t)), JSON.stringify(spoken));
  const live = await page.innerText('[role=alert]');
  check('aria-live region announces it', /Tamper in Fitting Room 2/.test(live), live);
  await page.getByRole('button', { name: /Acknowledge tamper/ }).click();
  await page.waitForSelector('[role=alertdialog]', { state: 'detached', timeout: 3000 });
  const log = await page.innerText('ul.log');
  check('acknowledged and logged', /Tamper, acknowledged/i.test(log) && /Fitting Room 2/i.test(log), log.replace(/\n/g, ' | '));
});

await run({ name: 'Register 1', type: 'register' }, async ({ page }) => {
  await page.getByRole('button', { name: 'Start listening' }).click();
  await page.waitForSelector('ul.log li', { timeout: 20000 });
  await page.waitForTimeout(500);
  const log = await page.innerText('ul.log');
  check('register zone logs Checkout quietly', /Checkout/i.test(log) && !/Tamper/i.test(log), log.replace(/\n/g, ' | '));
  check('no alarm overlay for a checkout', (await page.locator('[role=alertdialog]').count()) === 0);
});

await run({ name: 'Fitting Room 2', type: 'fitting' }, async ({ page }) => {
  await page.getByRole('button', { name: 'Simulate two phones hearing it' }).click();
  await page.waitForSelector('[role=alertdialog]', { timeout: 3000 });
  const text = await page.innerText('[role=alertdialog]');
  check('dedupe: attributed to the louder zone, other listed', /Fitting Room 2/i.test(text) && /Also heard by Sales Floor/i.test(text) && /TEST/i.test(text), text.replace(/\n/g, ' | '));
});
process.exit(results.every(Boolean) ? 0 : 1);
