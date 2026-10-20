import type { Incident } from '../dsp/dedupe.ts';

export function EventLog({ items }: { items: Incident[] }) {
  if (items.length === 0) return <p class="empty">No events yet. When a tag rings, it shows up here.</p>;
  return (
    <ul class="log" aria-label="Event log">
      {items.map((i) => {
        const state = i.kind === 'checkout' ? 'quiet' : i.ackedAt ? 'acked' : 'open';
        const label = i.kind === 'checkout' ? 'Checkout' : i.ackedAt ? 'Tamper · acknowledged' : 'Tamper';
        return (
          <li key={i.id} class={`log-row ${state}`}>
            <span class="log-zone">{i.zone}</span>
            <time class="log-time" dateTime={new Date(i.at).toISOString()}>{new Date(i.at).toLocaleTimeString()}</time>
            <span class="log-meta">
              <span class="badge">{label}</span>
              <span class="num">SNR {i.snrDb.toFixed(0)} dB</span>
              {i.test && <span>Test</span>}
              {i.delayed && <span>Delayed</span>}
              {i.alsoHeardBy.length > 0 && <span>Also heard by {i.alsoHeardBy.map((h) => h.zone).join(', ')}</span>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
