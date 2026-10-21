// Screenshots of every screen: node tools/shots.mjs [--desktop]  → .scratch/shots[-desktop]/*.png
import { mkdirSync } from 'node:fs';
import { open } from './e2e-lib.mjs';
const desktop = process.argv.includes('--desktop');
const dir = desktop ? '.scratch/shots-desktop' : '.scratch/shots';
mkdirSync(dir, { recursive: true });
const base = 'http://localhost:4173/'; const relay = 'http://localhost:8787';
const profile = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };
const { code } = await (await fetch(`${relay}/api/stores`, { method: 'POST' })).json();
const zone = { name: 'Fitting Room 2', type: 'fitting' };
const st = (o) => ({ 'resonance.state.v1': JSON.stringify({ role: null, storeCode: null, zone: null, profile, welcomed: true, ...o }), 'resonance.relay': relay });
const sim = async (p) => { await p.getByRole('button', { name: 'Simulate a tag ring' }).click(); await p.waitForSelector('[role=alertdialog]'); await p.locator('.btn-ack').click(); await p.waitForTimeout(500); };
const shots = [
  ['welcome', `${base}`, st({ welcomed: false }), null],
  ['choose', `${base}`, st({}), null],
  ['home-demo', `${base}`, st({ role: 'demo', zone }), sim],
  ['alerts', `${base}#/alerts`, st({ role: 'demo', zone }), async (p) => { await p.goto(`${base}`); await sim(p); await p.getByRole('link', { name: /Alerts/ }).click(); await p.waitForTimeout(500); }],
  ['zones', `${base}#/zones`, st({ role: 'demo', zone }), null],
  ['settings', `${base}#/settings`, st({ role: 'demo', zone }), null],
  ['about', `${base}#/about`, st({}), null],
  ['calibrate', `${base}#/calibrate`, st({ role: 'demo', zone }), null],
  ['join', `${base}#/join/listener`, st({}), null],
  ['staff', `${base}`, st({ role: 'staff', storeCode: code }), null],
  ['alert', `${base}`, st({ role: 'demo', zone }), async (p) => { await p.getByRole('button', { name: 'Simulate two phones hearing it' }).click(); await p.waitForSelector('[role=alertdialog]'); await p.waitForTimeout(900); }],
  ['dashboard', `${base}dashboard.html?store=${code}`, st({}), async (p) => { await p.waitForSelector('.stats-row'); }],
];
for (const [name, url, storage, act] of shots) {
  const t = await open(url, null, { storage, viewport: desktop ? { width: 1280, height: 860 } : { width: 390, height: 844 } });
  await t.page.waitForTimeout(1200);
  if (act) await act(t.page);
  await t.page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  await t.page.waitForTimeout(900);
  await t.page.screenshot({ path: `${dir}/${name}.png`, fullPage: name !== 'alert' && name !== 'welcome' });
  if (t.errors.length) console.log(name, 'errors', t.errors.slice(0, 2));
  await t.browser.close();
}
console.log('done');
