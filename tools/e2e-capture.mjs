// Drives the built debug page in Chromium with a synthetic ring standing in for the microphone.
// (Chromium's fake-device flags don't resolve getUserMedia on this Mac, so getUserMedia is replaced by a
// WebAudio stream that loops the WAV. The worklet, ring buffer, detector, analysis and UI are all real.)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const wav = resolve(process.argv[2] ?? '.scratch/synthetic-ring.wav');
const url = process.argv[3] ?? 'http://localhost:4173/?debug=1';
const browser = await chromium.launch({ headless: true, channel: 'chromium' });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
await ctx.route('**/__fake.wav', (r) => r.fulfill({ body: readFileSync(wav), contentType: 'audio/wav' }));
await ctx.addInitScript(() => {
  navigator.mediaDevices.getUserMedia = async () => {
    const ac = new AudioContext();
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
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(url);
await page.getByRole('button', { name: 'Start listening' }).click();
await page.waitForFunction(() => document.body.innerText.includes('running'), null, { timeout: 15000 });
await page.waitForFunction(() => /Onsets seen\s*[1-9]/.test(document.body.innerText), null, { timeout: 20000 });
await page.waitForTimeout(1800);
const text = await page.innerText('main');
console.log(text.split('\n').filter((l) => l.trim()).slice(0, 80).join('\n'));
await page.screenshot({ path: '.scratch/debug.png', fullPage: true });
console.log('errors:', errors);
await browser.close();
