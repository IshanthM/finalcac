import type { Incident } from '../dsp/dedupe.ts';
import { Icon } from './Icon.tsx';

/** "2 min ago", "Yesterday 4:12 PM": short, human times for a notification feed. */
export function ago(at: number, now = Date.now()): string {
  const s = Math.max(0, Math.round((now - at) / 1000));
  if (s < 45) return 'Just now';
  if (s < 3600) return `${Math.max(1, Math.round(s / 60))} min ago`;
  const d = new Date(at);
  const t = d.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  return new Date(now).toDateString() === d.toDateString() ? t : `${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}, ${t}`;
}

export function EmptyFeed() {
  return (
    <div class="empty">
      <Icon name="bell" />
      <strong>No alerts yet</strong>
      <span>When a tag rings, it shows up here with the zone and time.</span>
    </div>
  );
}

/** Notification-style feed. Pass `onAck` to show an Acknowledge button on open tampers. */
export function EventLog({ items, onAck }: { items: Incident[]; onAck?: (id: string) => void }) {
  if (items.length === 0) return <div class="group"><EmptyFeed /></div>;
  return (
    <ul class="group feed" aria-label="Alerts" style={{ listStyle: 'none', margin: 0, padding: 0 }}>
      {items.map((i) => {
        const open = i.kind === 'tamper' && !i.ackedAt;
        const state = i.kind === 'checkout' ? 'quiet' : open ? 'open' : 'acked';
        const title = i.kind === 'checkout' ? `Checkout at ${i.zone}` : `Tamper in ${i.zone}`;
        const bits = [
          i.kind === 'checkout' ? 'Logged quietly' : open ? 'Needs attention' : 'Acknowledged',
          `SNR ${i.snrDb.toFixed(0)} dB`,
          ...(i.test ? ['Test'] : []),
          ...(i.delayed ? ['Delayed'] : []),
        ];
        return (
          <li key={i.id} class={`feed-item ${state}`}>
            <span class="feed-ico"><Icon name={i.kind === 'checkout' ? 'store' : 'bell'} /></span>
            <div>
              <div class="feed-title">{title}</div>
              <div class="feed-meta">{bits.join(', ')}{i.alsoHeardBy.length > 0 ? `. Also heard by ${i.alsoHeardBy.map((h) => h.zone).join(', ')}.` : ''}</div>
            </div>
            <time class="feed-time" dateTime={new Date(i.at).toISOString()}>{ago(i.at)}</time>
            {open && onAck && <div class="feed-action"><button class="btn btn-tint" onClick={() => onAck(i.id)} aria-label={`Acknowledge tamper in ${i.zone}`}>Acknowledge</button></div>}
          </li>
        );
      })}
    </ul>
  );
}
