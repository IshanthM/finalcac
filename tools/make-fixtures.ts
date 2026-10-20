// Generates a synthetic ring recording (noise + click + decaying 13.3 kHz tone) for browser e2e.
import { writeFileSync } from 'node:fs';
import { encodeWav } from '../src/dsp/wav.ts';
import { ringSignal } from '../test/helpers/synth.ts';

const out = process.argv[2] ?? '.scratch/synthetic-ring.wav';
const { x } = ringSignal({ seconds: 6, onsetMs: 3000, freqHz: 13287, tauMs: 8, amp: 0.05, clickAmp: 0.3, clickMs: 2, noiseRms: 0.0005 });
writeFileSync(out, encodeWav(x, 48000, { format: 'pcm16' }));
console.log(`wrote ${out}`);
