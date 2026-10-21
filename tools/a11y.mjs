// Runs axe-core on each screen (dark theme, phone viewport). node tools/a11y.mjs [appBase] [relayHttp]
import { readFileSync } from 'node:fs';
import { open } from './e2e-lib.mjs';
const base = process.argv[2] ?? 'http://localhost:4173/';
const relay = process.argv[3] ?? 'http://localhost:8787';
const axeSrc = readFileSync('node_modules/axe-core/axe.min.js', 'utf8');
const profile = { freqHz: 13300, spreadFrac: 0.002, decayMs: 8, sampleRate: 48000, calibratedAt: '2026-10-20T00:00:00Z', rings: [] };
const { code } = await (await fetch(`${relay}/api/stores`, { method: 'POST' })).json();
const zone = { name: 'Fitting Room 2', type: 'fitting' };
const state = (o) => ({ 'resonance.state.v1': JSON.stringify({ role: null, storeCode: code, zone: null, profile, ...o }), 'resonance.relay': relay });

const screens = [
  ['home', `${base}`, state({}), null],
  ['join (listener)', `${base}#/join/listener`, state({ storeCode: null }), null],
  ['listener zone setup', `${base}#/listener`, state({ role: 'listener' }), null],
  ['listener', `${base}#/listener`, state({ role: 'listener', zone }), null],
  ['console', `${base}#/console`, state({ role: 'staff' }), null],
  ['calibrate', `${base}#/calibrate`, state({}), null],
  ['demo', `${base}#/demo`, state({ role: 'demo', zone }), null],
  ['demo alert', `${base}#/demo`, state({ role: 'demo', zone }), async (p) => { await p.getByRole('button', { name: 'Test: heard by two zones' }).click(); await p.waitForSelector('[role=alertdialog]'); }],
  ['demo alert (acked, log)', `${base}#/demo`, state({ role: 'demo', zone }), async (p) => { await p.getByRole('button', { name: 'Test alarm' }).click(); await p.waitForSelector('[role=alertdialog]'); await p.getByRole('button', { name: /Acknowledge/ }).click(); await p.waitForTimeout(300); }],
  ['dashboard', `${base}dashboard.html?store=${code}`, state({}), async (p) => { await p.waitForSelector('.stats'); }],
  ['debug', `${base}?debug=1`, state({}), null],
];
let bad = 0;
for (const [name, url, storage, act] of screens) {
  const { browser, page } = await open(url, null, { storage });
  await page.waitForTimeout(700);
  if (act) await act(page);
  await page.evaluate(() => document.querySelectorAll('.reveal').forEach((e) => e.classList.add('in')));
  await page.waitForTimeout(1300);
  await page.addScriptTag({ content: axeSrc });
  const res = await page.evaluate(async () => (await window.axe.run(document, { runOnly: ['wcag2a', 'wcag2aa', 'wcag21aa', 'best-practice'] })).violations.map((v) => ({ id: v.id, impact: v.impact, n: v.nodes.length, help: v.help, sample: v.nodes[0].html.slice(0, 120), why: (v.nodes[0].any[0]?.message ?? v.nodes[0].failureSummary ?? '').slice(0, 160) })));
  // Minimum sizes: text >= 18px for body-like text, tap targets >= 48px.
  const sizes = await page.evaluate(() => {
    const small = [], tiny = [];
    for (const el of document.querySelectorAll('button, a.btn, input:not([type=radio]), label.on, .seg label')) {
      const r = el.getBoundingClientRect();
      if (r.width && r.height && (r.height < 48 || r.width < 48)) tiny.push(`${el.tagName}.${el.className} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.innerText || el.getAttribute('aria-label') || '').slice(0, 24)}"`);
    }
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const seen = new Set();
    for (let n = walker.nextNode(); n; n = walker.nextNode()) {
      const t = n.textContent.trim(); const el = n.parentElement;
      if (!t || !el || el.closest('.sr-only, script, style')) continue;
      const fs = parseFloat(getComputedStyle(el).fontSize);
      if (fs < (el.classList.contains('label') || /mono/.test(getComputedStyle(el).fontFamily) ? 13 : 16) && !seen.has(el.className + fs)) { seen.add(el.className + fs); small.push(`${fs}px .${el.className || el.tagName} "${t.slice(0, 30)}"`); }
    }
    return { small, tiny };
  });
  console.log(`\n== ${name}: ${res.length} axe violation(s), ${sizes.tiny.length} small tap target(s), ${sizes.small.length} text style(s) too small (body <16px, mono labels <13px)`);
  for (const v of res) { bad++; console.log(`   [${v.impact}] ${v.id} x${v.n}: ${v.help}\n      ${v.sample}\n      ${v.why}`); }
  for (const t of sizes.tiny) console.log(`   tap: ${t}`);
  for (const t of sizes.small) console.log(`   text: ${t}`);
  await browser.close();
}
console.log(bad ? `\n${bad} axe violation group(s)` : '\nNo axe violations');
