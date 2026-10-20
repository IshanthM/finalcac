/** The incident log shown to staff, in memory. Fed by the local hub (demo) or by the relay (console). */
import { useEffect, useState } from 'preact/hooks';
import type { Incident } from '../dsp/dedupe.ts';

let list: Incident[] = [];
const subs = new Set<() => void>();
const notify = (): void => subs.forEach((f) => f());

export function upsertIncident(i: Incident): void {
  const k = list.findIndex((x) => x.id === i.id);
  list = k >= 0 ? list.map((x) => (x.id === i.id ? { ...x, ...i } : x)) : [i, ...list];
  list = list.sort((a, b) => b.at - a.at).slice(0, 200);
  notify();
}

export function ackIncident(id: string, at: number = Date.now()): void {
  list = list.map((x) => (x.id === id ? { ...x, ackedAt: at } : x));
  notify();
}

export function setIncidents(items: Incident[]): void {
  list = [...items].sort((a, b) => b.at - a.at).slice(0, 200);
  notify();
}

export function clearIncidents(): void {
  list = [];
  notify();
}

export function useIncidents(): Incident[] {
  const [, set] = useState(0);
  useEffect(() => {
    const f = (): void => set((n) => n + 1);
    subs.add(f);
    return () => { subs.delete(f); };
  }, []);
  return list;
}
