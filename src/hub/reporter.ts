/** Turns accepted detections from the capture engine into Reports for a sink (the local hub or the relay). */
import { engine, type CapturedEvent } from '../audio/engine.ts';
import type { Report } from '../dsp/dedupe.ts';
import type { Zone } from '../state.ts';

export function toReport(ev: CapturedEvent, zone: Zone, delayed = false): Report | null {
  const p = ev.analysis.peak;
  if (!p) return null;
  return { zone: zone.name, zoneType: zone.type, snrDb: ev.analysis.snrDb, freqHz: p.freqHz, ...(delayed ? { delayed } : {}) };
}

/** Subscribe: every ACCEPTED event while in detect mode becomes a report. Returns an unsubscribe. */
export function attachReporter(getZone: () => Zone | null, sink: (r: Report) => void): () => void {
  return engine.onEvent((ev) => {
    if (ev.calibrating || !ev.verdict.accepted) return;
    const zone = getZone();
    if (!zone) return;
    const r = toReport(ev, zone);
    if (r) sink(r);
  });
}
