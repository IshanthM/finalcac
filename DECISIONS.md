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
- **D8 Deploy.** GitHub Pages serves the `gh-pages` branch, pushed by `scripts/deploy-pages.sh`. An Actions workflow was dropped
  because the local `gh` token has no `workflow` scope; the script needs no extra scope. (An Actions workflow can be added later after `gh auth refresh -s workflow`.)
- **D9 Onset uses sub-band tiles.** A single 9–15.5 kHz trigger can't see a narrowband ring unless the click is strong. The detector also watches
  overlapping ~1 kHz tiles (8 dB over each tile's own floor). Narrower tiles (2–3 FFT bins) false-triggered ~0.4×/s on pure noise.
  A ring below ~17 dB narrowband SNR with no click will not trigger an onset (tunable in `params.ts`).
- **D10 Ringdown gate.** Must end within `maxRingMs`, fall ≥ 3 dB, have ≥ 3 frames; R² ≥ 0.7 applies only with ≥ 15 dB headroom (below that the fit is noise).
  A steady tone (alarm beep) is rejected because it never ends.
- **D11 Known limit.** A lone random tone landing inside ±0.8% of the tag frequency looks like a ring by frequency alone (~3%/tone);
  on 40 synthetic clatter seeds ≤ 3 accepted. Multi-listener agreement and real recordings are the further defence.
- **D12 Listener alert policy.** When staff are reachable the listener stays quiet (a siren in a fitting room tips off the thief) and notes
  "Staff alerted". With no connection, or no console online, it alarms locally (screen + siren + speech) and queues the report.
  Flip by changing `reachable` in `src/ui/Listener.tsx`.
- **D13 Late reports never move an alert.** The Deduper collects 300 ms, attributes to the highest SNR, and later reports inside 1 s only
  extend "also heard by" (an update), so staff are not told one zone and then another.
- **D14 One dedupe for both paths.** `src/dsp/dedupe.ts` runs in the demo hub and in the Durable Object, so demo and cloud behave the same.
- **D15 Relay URL** is build-time `VITE_RELAY_URL` or a remembered `?relay=` query; default is localhost for development.
