/** Alarm controller: full-screen alert state, siren, repeated speech, vibration, until acknowledged. */
import { useEffect, useState } from 'preact/hooks';
import type { Incident } from '../dsp/dedupe.ts';
import { chime, startSiren, stopSiren } from './siren.ts';
import { speak, stopSpeaking, tamperPhrase } from './speech.ts';
import { ALERT_PATTERN, vibrate } from './vibrate.ts';

const SPEAK_EVERY_MS = 5000;

let active: Incident[] = [];
let timer: ReturnType<typeof setInterval> | null = null;
const subs = new Set<() => void>();
const notify = (): void => subs.forEach((f) => f());

function phrase(i: Incident): string {
  return tamperPhrase(i.zone);
}

function cycle(): void {
  const top = active[0];
  if (!top) return;
  speak(phrase(top));
  vibrate(ALERT_PATTERN);
}

/** Raise an alarm for a tamper incident, or a quiet chime for a checkout. Safe to call repeatedly for the same id. */
export function raise(incident: Incident): void {
  if (incident.kind === 'checkout') {
    chime();
    return;
  }
  if (active.some((a) => a.id === incident.id)) return;
  active = [incident, ...active];
  if (active.length === 1) {
    startSiren();
    cycle();
    timer = setInterval(cycle, SPEAK_EVERY_MS);
  } else {
    cycle();
  }
  notify();
}

/** Replace an active incident (e.g. its "also heard by" grew). */
export function refresh(incident: Incident): void {
  const k = active.findIndex((a) => a.id === incident.id);
  if (k >= 0) {
    active = active.map((a) => (a.id === incident.id ? incident : a));
    notify();
  }
}

/** Acknowledge one incident (or all when no id). Returns the ids that were cleared. */
export function acknowledge(id?: string): string[] {
  const cleared = id === undefined ? active.map((a) => a.id) : active.filter((a) => a.id === id).map((a) => a.id);
  active = id === undefined ? [] : active.filter((a) => a.id !== id);
  if (active.length === 0) {
    stopSiren();
    stopSpeaking();
    if (timer) clearInterval(timer);
    timer = null;
  }
  notify();
  return cleared;
}

export function activeAlarms(): Incident[] {
  return active;
}

export function useAlarms(): Incident[] {
  const [, set] = useState(0);
  useEffect(() => {
    const f = (): void => set((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return active;
}
