import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import './style.css';
import type { ZoneInfo } from '../worker/src/protocol.ts';
import type { Incident } from './dsp/dedupe.ts';
import { toleranceFrac, parseProfile, type TagProfile } from './dsp/profile.ts';
import { CODE_RE, normalizeCode, relayBase } from './net/config.ts';
import { EventLog } from './ui/EventLog.tsx';

interface Summary { profile: TagProfile | null; zones: ZoneInfo[]; incidents: Incident[] }

function ZoneBars({ items }: { items: Incident[] }) {
  const tamper = items.filter((i) => i.kind === 'tamper' && !i.test);
  const counts = new Map<string, number>();
  for (const i of tamper) counts.set(i.zone, (counts.get(i.zone) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (rows.length === 0) return <p class="muted">No tamper events yet.</p>;
  const max = Math.max(...rows.map((r) => r[1]));
  return (
    <ul class="bars" aria-label="Tamper alerts by zone">
      {rows.map(([zone, n]) => (
        <li key={zone}>
          <span class="bar-label">{zone}</span>
          <span class="bar-track"><span class="bar-fill" style={{ width: `${Math.max(4, (n / max) * 100)}%` }} /></span>
          <span class="bar-val">{n}</span>
        </li>
      ))}
    </ul>
  );
}

function Dashboard() {
  const params = new URLSearchParams(location.search);
  const [code, setCode] = useState(() => normalizeCode(params.get('store') ?? ''));
  const [input, setInput] = useState(code);
  const [data, setData] = useState<Summary | null>(null);
  const [err, setErr] = useState('');
  const [updated, setUpdated] = useState(0);

  useEffect(() => {
    if (!CODE_RE.test(code)) return;
    let stop = false;
    const load = async (): Promise<void> => {
      try {
        const r = await fetch(`${relayBase()}/api/stores/${code}/summary`);
        if (r.status === 404) throw new Error('No store with that code.');
        if (!r.ok) throw new Error(`Relay error ${r.status}`);
        const j = (await r.json()) as Summary;
        if (!stop) { setData({ ...j, profile: parseProfile(j.profile) }); setErr(''); setUpdated(Date.now()); }
      } catch (e) {
        if (!stop) setErr(e instanceof Error ? e.message : 'Could not reach the relay.');
      }
    };
    void load();
    const t = setInterval(load, 3000);
    return () => { stop = true; clearInterval(t); };
  }, [code]);

  const real = (data?.incidents ?? []).filter((i) => !i.test);
  const tampers = real.filter((i) => i.kind === 'tamper');
  const checkouts = real.filter((i) => i.kind === 'checkout');
  const open = tampers.filter((i) => !i.ackedAt);
  const online = (data?.zones ?? []).filter((z) => z.online).length;

  return (
    <main class="page wide">
      <h1>Resonance dashboard</h1>
      <form class="inline" onSubmit={(e) => { e.preventDefault(); if (CODE_RE.test(input)) { setCode(input); history.replaceState(null, '', `?store=${input}`); } }}>
        <label class="sr-only" for="sc">Store code</label>
        <input id="sc" class="input code" value={input} placeholder="STORE CODE" autoCapitalize="characters" autoComplete="off" spellcheck={false} maxLength={9}
          onInput={(e) => setInput(normalizeCode((e.target as HTMLInputElement).value))} />
        <button class="btn btn-primary" type="submit" disabled={!CODE_RE.test(input)}>Show store</button>
      </form>
      {err && <p class="error" role="alert">{err}</p>}
      {!CODE_RE.test(code) && <p class="muted">Enter the store code shown on the staff console.</p>}

      {data && (
        <>
          <p class="muted" aria-live="polite">Store {code} · updated {new Date(updated).toLocaleTimeString()}</p>
          <div class="stats">
            <div class="stat"><span class="stat-n">{tampers.length}</span><span>Tamper alerts</span></div>
            <div class="stat"><span class={`stat-n ${open.length ? 'redn' : ''}`}>{open.length}</span><span>Unacknowledged</span></div>
            <div class="stat"><span class="stat-n">{checkouts.length}</span><span>Checkouts</span></div>
            <div class="stat"><span class="stat-n">{online}/{data.zones.length}</span><span>Zones online</span></div>
          </div>
          <h2>Tamper alerts by zone</h2>
          <ZoneBars items={data.incidents} />
          <h2>Zones</h2>
          <table class="log" aria-label="Zones">
            <thead><tr><th scope="col">Zone</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Last heard</th></tr></thead>
            <tbody>{data.zones.map((z) => (
              <tr key={z.name}><td>{z.name}</td><td>{z.type}</td><td>{z.online ? 'Listening' : 'Offline'}</td><td>{new Date(z.lastSeen).toLocaleTimeString()}</td></tr>
            ))}</tbody>
          </table>
          <h2>Tag profile</h2>
          {data.profile
            ? <p>{Math.round(data.profile.freqHz).toLocaleString('en-US')} Hz, accepts ±{(toleranceFrac(data.profile.spreadFrac) * 100).toFixed(2)}%, decay τ {data.profile.decayMs.toFixed(1)} ms. Calibrated {new Date(data.profile.calibratedAt).toLocaleString()}.</p>
            : <p class="muted">Not calibrated.</p>}
          <h2>Event log</h2>
          <EventLog items={data.incidents} />
        </>
      )}
      <p><a class="btn" href={import.meta.env.BASE_URL}>Back to app</a></p>
    </main>
  );
}

render(<Dashboard />, document.getElementById('app')!);
