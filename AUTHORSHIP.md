# Authorship log

An honest record of who made what in Resonance. It is kept up to date as we work, and `SUBMISSION.md` builds its AI
disclosure from it. Nothing in here is rounded up in anyone's favour. Where I (Claude) cannot tell something from the
repository, it says so, and the entry is left for the student to fill in.

Last updated: Fri Oct 23, 2026.

## 1. What Claude wrote in earlier sessions

Established from `git log` (15 commits, Oct 20 to 21, 2026) and the repo contents:

- **All 15 commits in this repo carry a `Co-Authored-By: Claude` trailer.** As best I can tell they were all made in
  Claude Code sessions.
- **Essentially all of the app code, styling, tests and documentation was written by Claude** in those sessions,
  working from a written brief by the student. That covers:
  - the capture engine and AudioWorklet (`src/audio/`);
  - the detection pipeline: onset detection, event analysis, the four detector gates, calibration, profile (`src/dsp/`);
  - the alert flow, offline queue and dedupe (`src/alert/`, `src/net/`, `src/runtime.ts`);
  - the Cloudflare Worker relay (`worker/`);
  - the whole UI and the five design iterations (`src/ui/`, `src/style.css`);
  - the browser test scripts (`tools/e2e-*.mjs`) and 183 unit tests.
- **Reused from an earlier project.** The low-level signal code `fft.ts`, `window.ts`, `wav.ts`, `random.ts` and
  `ringBuffer.ts`, with their tests (about 890 lines of source and 945 lines of tests), was copied almost unchanged from
  the student's earlier prototype `resonance-listener`. That prototype's 21 commits are also Claude co-authored. Of the
  183 unit tests, about 123 are those generic copied tests and about 60 are tests of detection, calibration and merging.
- **The 13.3 kHz figure is a prediction, not a measurement.** It comes from a finite-element prediction of the tag
  whose source is outside this repo; I have not seen the simulation itself. No real tag has been recorded in this project yet.
- **All detector thresholds in `src/dsp/params.ts` were chosen by Claude and tuned only on synthetic signals.** None came
  from real recordings.

## 2. What the student did

What the repository can show, with nothing added:

- Wrote the product brief: the problem, the roles (Listener, Staff), the idea of calibrating per store, the screens,
  the build order and what is out of scope.
- Made the product decisions asked during the build (which relay, public repo, copy-and-adapt the old signal code) and
  gave the design direction (the colour palette from their slideshow, and the feedback that the early designs were not
  good enough).
- Owns the real-world inputs that no one else can supply: the physical tag, the recordings, the phones.

What the git history **cannot** show, so it is not claimed here: any line of code the student typed themselves. As of
the commits above, **I can find none.**

From this point on the student's own work is logged in section 3, in their words, as it happens.

## 3. What the student wrote or changed themselves

_Nothing yet. Entries are added only when it is true. Each one names the file, the change and the reason, as the
student explains it._

| Date | File / task | What the student did | In their own words, why |
|---|---|---|---|
| | | | |

## 4. What we changed together (Claude explained, the student decided or edited, Claude reviewed)

_Nothing yet._

| Date | File / task | Claude's part | Student's part |
|---|---|---|---|
| | | | |

## 5. What Claude wrote in this session (Oct 23, 2026)

Written by Claude, then run and tested by Claude. The student has not reviewed this code yet.

| File | What it is |
|---|---|
| `src/dsp/evaluation.ts` | Pure functions for scoring the detector on labelled recordings: file-name labels, running the detector on one file, learning a tag profile from strike files, counting hits, misses and false alarms per condition, and a plain-language verdict. |
| `test/evaluation.test.ts` | 17 tests for the above, on synthetic signals only. |
| `tools/analyze-folder.ts` (`npm run analyze:folder`) | Command-line tool that reads a folder of labelled WAVs and prints, per file, what fired with its frequency, level, SNR and failed gates, then a summary with counts. |
| `src/ui/Debug.tsx` | A labelled recorder on the Debug screen (strike / room noise / keys / clap / music / other, room, distance, number of strikes), and a status line showing whether echo cancellation, noise suppression and auto gain are really off. |
| `tools/e2e-recorder.mjs` | Browser test for the labelled recorder. |

What these have **not** been tested on: any real microphone or any real tag. Tests so far use synthetic signals and a
simulated microphone in desktop Chromium.

## 6. Understanding check

_Not done yet. Answers will be logged here only if the student actually knows them._
