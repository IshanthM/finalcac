// Screenshots of every screen at phone size: node tools/shots.mjs  → .scratch/shots/*.png
import { mkdirSync } from 'node:fs';
import { open } from './e2e-lib.mjs';
const base = 'http://localhost:4173/'; const relay = 'http://localhost:8787';
mkdirSync('.scratch/shots', { recursive: true });
const profile = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };
const { code } = await (await fetch(`${relay}/api/stores`, { method: 'POST' })).json();
const zone = { name: 'Fitting Room 2', type: 'fitting' };
const st = (o) => ({ 'resonance.state.v1': JSON.stringify({ role: null, storeCode: code, zone: null, profile, ...o }), 'resonance.relay': relay });
const shots = [
  ['home', base, st({}), null],
  ['join', `${base}#/join/listener`, st({ storeCode: null }), null],
  ['zone', `${base}#/listener`, st({ role: 'listener' }), null],
  ['listener', `${base}#/listener`, st({ role: 'listener', zone }), null, 'single'],
  ['console', `${base}#/console`, st({ role: 'staff' }), null],
  ['calibrate', `${base}#/calibrate`, st({}), null, 'calib'],
  ['demo', `${base}#/demo`, st({ role: 'demo', zone }), async (p) => { await p.getByRole('button', { name: 'Test alarm' }).click(); await p.waitForSelector('[role=alertdialog]'); await p.getByRole('button', { name: /Acknowledge/ }).click(); await p.waitForTimeout(400); }],
  ['alert', `${base}#/demo`, st({ role: 'demo', zone }), async (p) => { await p.getByRole('button', { name: 'Test: heard by two zones' }).click(); await p.waitForSelector('[role=alertdialog]'); await p.waitForTimeout(900); }],
  ['dashboard', `${base}dashboard.html?store=${code}`, st({}), async (p) => { await p.waitForSelector('.stats'); }],
  ['debug', `${base}?debug=1`, st({}), null],
];
for (const [name, url, storage, act, wav] of shots) {
  const t = await open(url, wav ? `.scratch/${wav}.wav` : null, { storage });
  await t.page.waitForTimeout(1200);
  if (wav) { await t.page.getByRole('button', { name: 'Start listening' }).click().catch(() => {}); await t.page.waitForTimeout(wav === 'calib' ? 5200 : 2500); }
  if (act) await act(t.page);
  await t.page.screenshot({ path: `.scratch/shots/${name}.png`, fullPage: name !== 'alert' });
  await t.browser.close();
}
console.log('done');
