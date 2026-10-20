# Decisions

- **D1 Stack.** Vite + TypeScript + Preact + Vitest. Preact for a small bundle on phones. `.npmrc` uses registry.yarnpkg.com.
- **D2 Reused DSP.** `fft`, `window`, `ringBuffer`, `wav`, `random` and their tests were copied from the earlier
  resonance-listener repo (no link to it). Ring buffer is 2 s here (brief), min sample rate 8 kHz.
- **D3 Relay.** Cloudflare Worker + Durable Object (free plan, $0). Credits are Anthropic API credits, which cannot host a relay; $0 spent.
- **D4 Detection is measured, not assumed.** Ring length is unknown, so `eventAnalysis.ts` measures click, ring length and decay
  from recordings; `clickSkipMs` and window bounds in `params.ts` are set from them at Checkpoint 1.
- **D5 Capture path.** getUserMedia (EC/NS/AGC off) → zero-gain destination so Safari keeps pulling → AudioWorklet (1024-sample
  blocks) → 2 s ring → own FFT. AnalyserNode is not used; the spectrogram reads the ring.
- **D6 Click measurement resolution** is about one 2.7 ms frame; off-tone energy within 45 dB of in-band energy is treated as window leakage.
- **D7 Browser e2e** (`tools/e2e-capture.mjs`) replaces getUserMedia with a WebAudio stream playing a synthetic WAV, because
  Chromium's fake-device flags do not resolve getUserMedia on the dev Mac. Everything after the mic is real.
