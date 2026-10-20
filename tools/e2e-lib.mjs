// Shared Playwright harness: Chromium with getUserMedia replaced by a looping WAV played through WebAudio.
// (Chromium's fake-device flags don't resolve getUserMedia on this Mac; the worklet, ring, detector and UI are real.)
import { chromium } from 'playwright-core';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

export async function open(url, wavPath, { viewport = { width: 390, height: 844 }, storage } = {}) {
  const browser = await chromium.launch({ headless: true, channel: 'chromium' });
  const ctx = await browser.newContext({ viewport, reducedMotion: process.env.E2E_MOTION ? 'no-preference' : 'reduce' });
  if (wavPath) {
    const wav = readFileSync(resolve(wavPath));
    await ctx.route('**/__fake.wav', (r) => r.fulfill({ body: wav, contentType: 'audio/wav' }));
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
  }
  if (storage) await ctx.addInitScript((s) => { for (const [k, v] of Object.entries(s)) localStorage.setItem(k, v); }, storage);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  await page.goto(url);
  return { browser, ctx, page, errors };
}
