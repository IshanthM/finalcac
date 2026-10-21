import { acknowledge } from '../../alert/alarm.ts';
import { ackIncident, clearIncidents, useIncidents } from '../../hub/incidents.ts';
import { acknowledgeAlert } from '../../runtime.ts';
import { useAppState } from '../../state.ts';
import { EventLog } from '../EventLog.tsx';
import { Head } from './parts.tsx';

export function AlertsTab() {
  const s = useAppState();
  const items = useIncidents();
  const real = items.filter((i) => !i.test);
  const tampers = real.filter((i) => i.kind === 'tamper');
  const open = items.filter((i) => i.kind === 'tamper' && !i.ackedAt);
  const earlier = items.filter((i) => !(i.kind === 'tamper' && !i.ackedAt));
  const times = tampers.filter((i) => i.ackedAt).map((i) => (i.ackedAt! - i.at) / 1000).sort((a, b) => a - b);
  const median = times.length ? (times.length % 2 ? times[(times.length - 1) / 2]! : (times[times.length / 2 - 1]! + times[times.length / 2]!) / 2) : null;
  const ack = (id: string): void => { ackIncident(id); acknowledge(id); acknowledgeAlert(id); };
  const canAck = s.role === 'staff' || s.role === 'demo';
  return (
    <div class="screen">
      <Head title="Alerts" sub="Every tamper and checkout, newest first" />
      <div class="mini-stats">
        <div class="mini-stat"><b class={open.length ? 'red' : ''}>{open.length}</b><span>Open</span></div>
        <div class="mini-stat"><b>{tampers.length}</b><span>Tampers</span></div>
        <div class="mini-stat"><b>{median === null ? 'n/a' : `${median.toFixed(1)}s`}</b><span>Median response</span></div>
      </div>
      {open.length > 0 && <><p class="sect">Needs attention</p><EventLog items={open} onAck={canAck ? ack : undefined} /></>}
      <p class="sect">{open.length > 0 ? 'Earlier' : 'Activity'}</p>
      <EventLog items={earlier} />
      {items.length > 0 && s.role === 'demo' && <div class="actions"><button class="btn btn-plain" onClick={() => clearIncidents()}>Clear log</button></div>}
    </div>
  );
}
