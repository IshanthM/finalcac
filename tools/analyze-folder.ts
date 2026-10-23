// Usage: npm run analyze:folder -- <folder of WAVs> [--profile FREQ[,SPREAD]] [--json]
//
// Runs the real detector over every WAV recorded with the Debug recorder and prints, per file, what fired and what
// it measured, then a summary with counts. File names carry the labels (see src/dsp/evaluation.ts), e.g.
//   strike_quiet_d50_n10_<time>.wav   -> 10 tag strikes expected
//   keys_quiet_dna_n0_<time>.wav      -> 0 expected, anything accepted is a false alarm
//
// Two passes, like a store would work:
//   1. strike files with NO frequency check -> learn the tag's frequency (median of accepted rings),
//   2. every file again WITH that learned profile -> the numbers in the summary.
// Pass --profile to use a fixed profile instead (e.g. one saved from the app's calibration).
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { decodeWav } from '../src/dsp/wav.ts';
import { PARAMS } from '../src/dsp/params.ts';
import { toleranceFrac, type TagProfile } from '../src/dsp/profile.ts';
import { evaluateFile, learnProfile, parseCaptureName, summarize, verdict, type FileResult } from '../src/dsp/evaluation.ts';

const args = process.argv.slice(2);
const json = args.includes('--json');
const pi = args.indexOf('--profile');
const dir = args.find((a, i) => !a.startsWith('--') && (pi < 0 || i !== pi + 1));
if (!dir) {
  console.error('usage: npm run analyze:folder -- <folder of WAVs> [--profile FREQ[,SPREAD]] [--json]');
  process.exit(1);
}

const f = (v: number | null, d = 1): string => (v === null || !Number.isFinite(v) ? 'n/a' : v.toFixed(d));
const names = readdirSync(dir).filter((n) => n.toLowerCase().endsWith('.wav')).sort();
const loaded: { name: string; meta: NonNullable<ReturnType<typeof parseCaptureName>>; samples: Float32Array; sr: number }[] = [];
for (const name of names) {
  const meta = parseCaptureName(name);
  if (!meta) {
    console.warn(`skipping ${name}: name does not look like <label>_<room>_<distance>_n<count>_<time>.wav`);
    continue;
  }
  const wav = decodeWav(new Uint8Array(readFileSync(join(dir, name))));
  loaded.push({ name, meta, samples: wav.samples, sr: wav.sampleRate });
}
if (loaded.length === 0) {
  console.error(`no labelled .wav files in ${dir}`);
  process.exit(1);
}

// Pass 1: learn the profile.
let profile: TagProfile | null = null;
if (pi >= 0) {
  const [freq, spread] = (args[pi + 1] ?? '').split(',').map(Number);
  profile = { freqHz: freq!, spreadFrac: spread ?? 0.002, decayMs: 0, sampleRate: loaded[0]!.sr, calibratedAt: '', rings: [] };
} else {
  const first = loaded.filter((l) => l.meta.label === 'strike').flatMap((l) => evaluateFile(l.samples, l.sr, null).events);
  profile = learnProfile(first, loaded[0]!.sr);
}

// Pass 2: the numbers we report.
const results: FileResult[] = loaded.map((l) => ({ name: l.name, meta: l.meta, eval: evaluateFile(l.samples, l.sr, profile) }));
const summary = summarize(results);

if (json) {
  console.log(JSON.stringify({ profile, results, summary }, null, 2));
  process.exit(0);
}

console.log(profile
  ? `Profile used: ${f(profile.freqHz, 0)} Hz, spread ${(profile.spreadFrac * 100).toFixed(2)}%, accepts ±${(toleranceFrac(profile.spreadFrac) * 100).toFixed(2)}%${pi >= 0 ? ' (given on the command line)' : ' (learned from the strike files)'}`
  : 'Profile: none learned (fewer than 3 accepted rings in the strike files), frequency check skipped.');
console.log(`Sample rates: ${[...new Set(loaded.map((l) => l.sr))].join(', ')} Hz\n`);

for (const r of results) {
  const hits = r.eval.events.filter((e) => e.accepted).length;
  const want = r.meta.label === 'strike' ? `${hits}/${r.meta.expected} rings` : hits === 0 ? 'quiet (good)' : `${hits} FALSE ALARM(S)`;
  console.log(`${r.name}  ${r.eval.durationS.toFixed(1)} s, background ${f(r.eval.backgroundDbfs, 0)} dBFS, ${r.eval.events.length} onset(s): ${want}`);
  for (const e of r.eval.events) {
    console.log(
      `   t=${e.atS.toFixed(2)}s  ${f(e.peakHz, 0)} Hz  level ${f(e.levelDbfs, 0)} dBFS  SNR ${f(e.snrDb)} dB  guard ${f(e.guardDb)} dB  ` +
        (e.accepted ? 'ACCEPTED' : `rejected (${e.failed.join(', ')})`),
    );
  }
}

const st = summary.strike;
console.log('\n=== Summary ===');
for (const line of verdict(summary, PARAMS.snrGateDb)) console.log(line);
if (st.expected > 0) {
  console.log('\nHit rate by condition (room/distance):');
  for (const [k, c] of Object.entries(st.byCondition)) console.log(`  ${k.padEnd(14)} ${c.found}/${c.expected}`);
  console.log(`Ring level: median ${f(st.medianLevelDbfs, 0)} dBFS. Events in strike files that were not accepted: ${st.eventsNotAccepted}`
    + ` (failed gates: snr ${st.gateFailures.snr}, guard ${st.gateFailures.guard}, decay ${st.gateFailures.decay}, tolerance ${st.gateFailures.tolerance})`);
}
console.log('\nNon-tag recordings (false alarms by kind):');
const kinds = Object.entries(summary.negatives);
if (kinds.length === 0) console.log('  none recorded yet: false-alarm rate is UNKNOWN');
for (const [k, n] of kinds) console.log(`  ${k.padEnd(8)} ${n.files} file(s), ${n.seconds.toFixed(0)} s: ${n.falseAlarms} false alarm(s)`);
console.log('\nNote: these counts come only from the recordings in this folder. They are not a general accuracy figure.');
