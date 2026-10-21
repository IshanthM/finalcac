import type { Incident } from '../dsp/dedupe.ts';
import { Icon } from './Icon.tsx';

export function EventLog({ items }: { items: Incident[] }) {
  if (items.length === 0) {
    return (
      <div class="empty">
        <Icon name="bell" />
        <strong>No events yet</strong>
        <span>When a tag rings, it appears here with the zone and time.</span>
      </div>
    );
  }
  return (
    <ul class="log" aria-label="Event log">
      {items.map((i) => {
        const state = i.kind === 'checkout' ? 'quiet' : i.ackedAt ? 'acked' : 'open';
        const label = i.kind === 'checkout' ? 'Checkout' : i.ackedAt ? 'Tamper, acknowledged' : 'Tamper';
        return (
          <li key={i.id} class={`log-row ${state}`}>
            <span class="log-zone">{i.zone}</span>
            <time class="log-time" dateTime={new Date(i.at).toISOString()}>{new Date(i.at).toLocaleTimeString()}</time>
            <span class="log-meta">
              <span class="badge">{label}</span>
              <span class="mono">SNR {i.snrDb.toFixed(0)} dB</span>
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
