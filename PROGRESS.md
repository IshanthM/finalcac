# Progress (resume point)

Plan: `~/.claude/plans/make-an-new-folder-jolly-rainbow.md`. Deadline Oct 26, 2026.

## Done
- Phase 1: scaffold, copied DSP + 123 tests, peak/SNR/onset/event-analysis modules (20 new tests), capture engine,
  worklet, debug screen (spectrogram, level, onsets, peak, SNR, guard, decay, settings, WAV download/record), analyzer CLI,
  Pages workflow. Browser e2e on a synthetic ring: peak 13287.0 Hz (true 13287), τ 8.2 ms (true 8), no console errors.

## CHECKPOINT 1 (waiting on owner)
Record real rings on the iPhone at `?debug=1`, put WAVs in `recordings/`, run `npm run analyze -- recordings/*.wav`.
Report: frequency, ring length, click length. Then set `clickSkipMs`, ring window bounds and thresholds in `src/dsp/params.ts`.

## Next
Phase 2: detector (gates), calibration, tuned to the recordings.
