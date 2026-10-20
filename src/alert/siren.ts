/** Two-tone-sweep siren on a sine (700 to 1400 Hz): audible, and far below the 9 to 15.5 kHz detection band. */
import { outputContext } from './unlock.ts';

interface Running { stop: () => void }
let running: Running | null = null;

export function startSiren(): void {
  if (running) return;
  const ctx = outputContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 1050;
  lfo.type = 'triangle';
  lfo.frequency.value = 1.2;
  lfoGain.gain.value = 350;
  gain.gain.value = 0.0001;
  lfo.connect(lfoGain).connect(osc.frequency);
  osc.connect(gain).connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.9, t + 0.05);
  osc.start();
  lfo.start();
  running = {
    stop: () => {
      const now = ctx.currentTime;
      gain.gain.cancelScheduledValues(now);
      gain.gain.setValueAtTime(Math.max(gain.gain.value, 0.0001), now);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.08);
      osc.stop(now + 0.1);
      lfo.stop(now + 0.1);
    },
  };
}

export function stopSiren(): void {
  running?.stop();
  running = null;
}

/** A short single chime (for a quiet notice such as a checkout). */
export function chime(): void {
  const ctx = outputContext();
  if (!ctx) return;
  const osc = ctx.createOscillator();
  const gain = ctx.createGain();
  osc.type = 'sine';
  osc.frequency.value = 660;
  gain.gain.value = 0.0001;
  osc.connect(gain).connect(ctx.destination);
  const t = ctx.currentTime;
  gain.gain.exponentialRampToValueAtTime(0.25, t + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
  osc.start(t);
  osc.stop(t + 0.4);
}
