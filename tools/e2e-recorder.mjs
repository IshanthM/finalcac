// Drives the labelled recorder on the Debug screen: records a short strike clip (the mic is a looped synthetic
// WAV, see e2e-capture.mjs), checks the downloaded file name carries the label, and saves it to the given folder
// so `npm run analyze:folder` can score it.
import { chromium } from 'playwright-core';
import { readFileSync, mkdirSync } from 'node:fs';
import { resolve, join } from 'node:path';

const wav = resolve(process.argv[2] ?? '.scratch/synthetic-ring.wav');
const outDir = resolve(process.argv[3] ?? '.scratch/recorded');
const url = process.argv[4] ?? 'http://localhost:4173/?debug=1';
mkdirSync(outDir, { recursive: true });
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
await ctx.route('**/__fake.wav', (r) => r.fulfill({ body: readFileSync(wav), contentType: 'audio/wav' }));
await ctx.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext({ sampleRate: 48000 });
    const buf = await ac.decodeAudioData(await (await fetch('/__fake.wav')).arrayBuffer());
    const src = ac.createBufferSource();
    src.buffer = buf; src.loop = true;
    const dest = ac.createMediaStreamDestination();
    src.connect(dest); src.start();
    return dest.stream;
  };
});
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(url);
await page.getByRole('button', { name: 'Start listening' }).click();
await page.waitForFunction(() => document.body.innerText.includes('running'), null, { timeout: 15000 });

await page.getByLabel('Number of strikes you will make').fill('3');
await page.getByLabel('Length in seconds').fill('6');
const [dl] = await Promise.all([
  page.waitForEvent('download', { timeout: 30000 }),
  page.getByRole('button', { name: 'Record and save' }).click(),
]);
const name = dl.suggestedFilename();
await dl.saveAs(join(outDir, name));
console.log('saved', name);
const ok = /^strike_quiet_d50_n3_\d{8}-\d{6}\.wav$/.test(name);
console.log(ok ? 'PASS file name carries label/room/distance/count' : 'FAIL unexpected file name');
const text = await page.innerText('main');
console.log(text.includes('Saved this session') ? 'PASS saved list shown' : 'FAIL no saved list');
console.log(/Echo cancellation\s*off/i.test(text) ? 'PASS processing status shows echo cancellation off' : 'INFO processing status: ' + (text.match(/Echo cancellation[^\n]*\n?[^\n]*/i)?.[0] ?? 'missing'));
console.log('errors:', errors);
await browser.close();
process.exit(ok && errors.length === 0 ? 0 : 1);
