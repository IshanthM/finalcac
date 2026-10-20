# Progress (resume point)

Plan: `~/.claude/plans/make-an-new-folder-jolly-rainbow.md`. Deadline Oct 26, 2026.

## Done
- Phase 1: scaffold, copied DSP + 123 tests, peak/SNR/onset/event-analysis modules (20 new tests), capture engine,
  worklet, debug screen (spectrogram, level, onsets, peak, SNR, guard, decay, settings, WAV download/record), analyzer CLI,
  Pages workflow. Browser e2e on a synthetic ring: peak 13287.0 Hz (true 13287), τ 8.2 ms (true 8), no console errors.

- Phase 2 (built on synthetic data, thresholds provisional until CP1 recordings): sub-band onset tiling, measured ringdown
  window, gates (SNR ≥ 12 dB, guard ≥ 10 dB, ringdown, tolerance), calibration (5 rings, 0.5% agreement, redo offenders),
  profile storage, Calibrate screen. 173 tests. Browser e2e for calibration (agree / outlier) passes.

- Phase 3 (demo mode): pure Deduper + register rule (8 tests), siren/speech/vibrate/alarm controller, full-screen alert (alertdialog + aria-live),
  event log, listener hero, zone form, local hub, Demo screen with "Test alarm" / "heard by two zones". Browser e2e (`tools/e2e-demo.mjs`) passes:
  real ring → alert + speech + ack + log; register → quiet Checkout; dedupe attribution.

## CHECKPOINT 1 (owner sends recordings later; work continues on synthetic data meanwhile)
Record real rings on the iPhone at `?debug=1`, put WAVs in `recordings/`, run `npm run analyze -- recordings/*.wav`.
Report: frequency, ring length, click length. Then set `clickSkipMs`, ring window bounds and thresholds in `src/dsp/params.ts`.

## Next
Phase 3 demo mode → Phase 4 relay → Phase 5 dedupe/register rules → Phase 6 polish. Retune `src/dsp/params.ts` when recordings arrive.
