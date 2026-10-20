/** Detections a listener could not send; flushed (marked delayed) when the relay is back. Survives a reload. */
export interface Queued {
  snr: number;
  freq: number;
  at: number;
  test?: boolean;
}

const KEY = 'resonance.queue.v1';
const MAX = 20;
const MAX_AGE_MS = 60 * 60 * 1000;

export function readQueue(now = Date.now()): Queued[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Queued[];
    return raw.filter((q) => typeof q.at === 'number' && now - q.at < MAX_AGE_MS && Number.isFinite(q.snr) && Number.isFinite(q.freq)).slice(-MAX);
  } catch {
    return [];
  }
}

export function pushQueue(q: Queued): void {
  try { localStorage.setItem(KEY, JSON.stringify([...readQueue(), q].slice(-MAX))); } catch { /* storage blocked */ }
}

export function clearQueue(): void {
  try { localStorage.removeItem(KEY); } catch { /* storage blocked */ }
}
