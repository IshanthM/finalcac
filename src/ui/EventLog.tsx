import type { Incident } from '../dsp/dedupe.ts';

export function EventLog({ items }: { items: Incident[] }) {
  if (items.length === 0) return <p class="muted">No events yet.</p>;
  return (
    <table class="log" aria-label="Event log">
      <thead>
        <tr><th scope="col">Time</th><th scope="col">Zone</th><th scope="col">Event</th><th scope="col">SNR</th></tr>
      </thead>
      <tbody>
        {items.map((i) => (
          <tr key={i.id} class={i.kind === 'checkout' ? 'quiet' : i.ackedAt ? 'acked' : 'open'}>
            <td>{new Date(i.at).toLocaleTimeString()}</td>
            <td>
              {i.zone}
              {i.alsoHeardBy.length > 0 && <small class="also">also heard by {i.alsoHeardBy.map((h) => h.zone).join(', ')}</small>}
            </td>
            <td>
              {i.kind === 'checkout' ? 'Checkout' : i.ackedAt ? 'Tamper (acknowledged)' : 'Tamper'}
              {i.test && <small class="also">test</small>}
              {i.delayed && <small class="also">delayed</small>}
            </td>
            <td>{i.snrDb.toFixed(0)} dB</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
