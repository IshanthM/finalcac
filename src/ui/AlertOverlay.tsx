import { useEffect, useRef } from 'preact/hooks';
import { acknowledge, useAlarms } from '../alert/alarm.ts';
import { ackIncident } from '../hub/incidents.ts';

/** Full-screen red alert for the newest unacknowledged tamper; every alert is also spoken and has a siren. */
export function AlertOverlay({ onAck }: { onAck?: (id: string) => void }) {
  const alarms = useAlarms();
  const top = alarms[0];
  const btn = useRef<HTMLButtonElement>(null);
  useEffect(() => { if (top) btn.current?.focus(); }, [top?.id]);
  const ack = (): void => {
    if (!top) return;
    const [id] = acknowledge(top.id);
    if (id) { ackIncident(id); onAck?.(id); }
  };
  return (
    <>
      {/* Always mounted so VoiceOver announces the change. */}
      <div class="sr-only" role="alert" aria-live="assertive" aria-atomic="true">
        {top ? `Tamper in ${top.zone}. ${alarms.length > 1 ? `${alarms.length - 1} more alerts waiting.` : ''}` : ''}
      </div>
      {top && (
        <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" aria-describedby="alert-desc">
          <p class="alert-kicker">{top.test ? 'Test · Tamper' : 'Tamper'}</p>
          <h1 id="alert-title" class="alert-zone">{top.zone}</h1>
          <p id="alert-desc" class="alert-meta">
            {new Date(top.at).toLocaleTimeString()} · SNR {top.snrDb.toFixed(0)} dB{top.delayed ? ' · delayed (listener was offline)' : ''}
          </p>
          {top.alsoHeardBy.length > 0 && <p class="alert-meta">Also heard by: {top.alsoHeardBy.map((h) => h.zone).join(', ')}</p>}
          {alarms.length > 1 && <p class="alert-meta">{alarms.length - 1} more waiting</p>}
          <button ref={btn} class="btn-ack" aria-label={`Acknowledge tamper in ${top.zone}`} onClick={ack}>Acknowledge</button>
        </div>
      )}
    </>
  );
}
