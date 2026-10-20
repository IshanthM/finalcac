# Resonance (Congressional App Challenge 2026)

A phone-first PWA that turns phones into a tamper-alarm network for a store. **Listener** phones sit in
zones (fitting rooms, register), hear a Resonance Tag ring when its tack pin is pulled, and a **staff**
phone is alerted saying *where*. Detection runs fully on-device and works offline; the cloud only relays and logs.

Live: https://ishanthm.github.io/finalcac/  ·  Debug recorder: https://ishanthm.github.io/finalcac/?debug=1

## Status
Phase 1 (capture, spectrum, debug screen, WAV download). See `PROGRESS.md` and `DECISIONS.md`.

## Develop
```
npm install          # .npmrc points at registry.yarnpkg.com (registry.npmjs.org is blocked on the dev Mac)
npm test             # Vitest: DSP on synthetic signals (run after every DSP change)
npm run dev          # Vite dev server (the mic needs HTTPS or localhost)
npm run build
npm run analyze -- recordings/*.wav     # measure real rings from WAVs
```
All DSP is in `src/dsp` as pure functions (no DOM). Every tunable is in `src/dsp/params.ts`.

## Recording real rings (Checkpoint 1)
1. Open `?debug=1` in Safari on the iPhone, tap **Start listening**, allow the mic.
2. Ring a tag. Each onset appears under *Onset snapshots*; tap **Download** (share sheet → AirDrop/Files).
   **Record 10 s** captures a continuous clip instead.
3. Put the WAVs in `recordings/` and run `npm run analyze -- recordings/*.wav`.

## Tests
Synthetic signals cover tone peak refinement and accuracy, SNR estimation, onset detection (noise,
adaptive floor, 44.1/48 kHz, refractory), and event analysis (click, ring length, decay).
