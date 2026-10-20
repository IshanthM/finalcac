# Resonance (Congressional App Challenge 2026)

A phone-first PWA that turns phones into a tamper-alarm network for a store. **Listener** phones sit in zones
(fitting rooms, register), hear a Resonance Tag ring when its tack pin is pulled, and a **staff** phone is alerted
saying *where*. Detection runs fully on-device and works offline; the cloud only relays and logs.

Live app: https://ishanthm.github.io/finalcac/ · Debug recorder: `?debug=1` · Event dashboard: `dashboard.html?store=CODE`

## How it works
- **Tag:** one aluminum standoff that rings near 13.3 kHz when the pin is pulled (plus a broadband click). Tags are identical,
  so location comes from *which listener heard it*.
- **Listener:** microphone → AudioWorklet → 2 s ring buffer → own FFT. Onset (sub-band energy vs adaptive floors), click skip,
  peak refinement (zero-padded FFT + parabolic), then gates: SNR ≥ 12 dB, narrowband guard ≥ 10 dB, exponential ringdown,
  frequency within the calibrated tolerance. All DSP is pure TypeScript in `src/dsp` with every tunable in `params.ts`.
- **Calibration:** ring 5 times; all must agree within 0.5%; the median becomes the store's tag profile, shared to every listener.
- **Staff console:** zone map, full-screen red alert with siren and speech ("Tamper in fitting room 2"), acknowledge, event log.
  Register zones log a quiet "Checkout". If several listeners hear one event within ~1 s, the loudest zone is the alert and the rest are "also heard by".
- **Offline:** a listener with no connection (or no staff console online) alerts on its own screen; the detection is queued and sent
  later, marked "delayed".
- **Demo mode:** one phone is listener and console (same dedupe/alert code path), with test buttons for filming.

## Cloud (Cloudflare, $0)
`worker/`: one Worker + one Durable Object per store (SQLite): WebSocket relay, event log, zones, tag profile, dedupe, rate limits.
No keys or secrets exist anywhere (the store code is the only access control, by design: no accounts).
Limits: 2 KB messages, 5 reports/s per socket, 120/min per store, 20 sockets per store, 10 store creations/hour per IP, CORS to the Pages origin.
Free plan cannot bill you, so there is no budget alert to set. The Anthropic API credits are not used: the app has no feature that needs an LLM.
```
npx wrangler login          # you, once
npm run relay:deploy        # prints https://finalcac-relay.<you>.workers.dev
npm run relay:teardown      # deletes the Worker and ALL store data
```
Point the app at it with `VITE_RELAY_URL=https://finalcac-relay.<you>.workers.dev npm run deploy`, or open the app once with `?relay=<url>`.

## Develop
```
npm install          # .npmrc points at registry.yarnpkg.com (registry.npmjs.org is blocked on the dev Mac)
npm test             # Vitest: DSP on synthetic signals (run after every DSP change)
npm run dev          # Vite dev server
npm run relay:dev    # local relay on :8787 (no cloud)
npm run fake-listener -- --create --zone "Fitting Room 2" --type fitting --snr 20 --hold   # a phone-free listener
npm run e2e:relay    # relay integration test (needs relay:dev)
npm run fixtures && npm run build && npx vite preview --port 4173
node tools/e2e-demo.mjs / e2e-calibrate.mjs calib / e2e-multi.mjs      # browser tests
npm run deploy       # builds and pushes dist/ to the gh-pages branch (GitHub Pages)
```

## Recording real rings (Checkpoint 1)
1. Open `?debug=1` in Safari on the iPhone, tap **Start listening**, allow the mic.
2. Ring a tag. Each onset appears under *Onset snapshots*; tap **Download** (share sheet → AirDrop/Files). **Record 10 s** captures a clip.
3. Put the WAVs in `recordings/` and run `npm run analyze -- recordings/*.wav` (add `--profile 13300` to see accept/reject reasons).
