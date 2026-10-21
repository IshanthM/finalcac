import { render } from 'preact';
import { useEffect, useState } from 'preact/hooks';
import '@fontsource/poppins/latin-300.css';
import '@fontsource/poppins/latin-400.css';
import '@fontsource/poppins/latin-500.css';
import '@fontsource/poppins/latin-600.css';
import '@fontsource/poppins/latin-700.css';
import '@fontsource/geist-mono/latin-400.css';
import '@fontsource/geist-mono/latin-500.css';
import './style.css';
import type { ZoneInfo } from '../worker/src/protocol.ts';
import type { Incident } from './dsp/dedupe.ts';
import { toleranceFrac, parseProfile, type TagProfile } from './dsp/profile.ts';
import { CODE_RE, normalizeCode, relayBase } from './net/config.ts';
import { Bezel } from './ui/Bezel.tsx';
import { EventLog } from './ui/EventLog.tsx';
import { Icon } from './ui/Icon.tsx';
import { Island } from './ui/Island.tsx';
import { Reveal } from './ui/Reveal.tsx';
import './ui/spotlight.ts';

/** Counts up to `n` once (ease-out, 0.9 s); static under reduced motion. */
function Count({ n, d = 0 }: { n: number; d?: number }) {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const [v, setV] = useState(reduce ? n : 0);
  useEffect(() => {
    if (reduce) { setV(n); return; }
    const from = v;
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number): void => {
      const k = Math.min(1, (t - t0) / 900);
      setV(from + (n - from) * (1 - (1 - k) ** 3));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [n]);
  return <>{v.toFixed(d)}</>;
}

interface Summary { profile: TagProfile | null; zones: ZoneInfo[]; incidents: Incident[] }

function ZoneBars({ items }: { items: Incident[] }) {
  const counts = new Map<string, number>();
  for (const i of items) if (i.kind === 'tamper' && !i.test) counts.set(i.zone, (counts.get(i.zone) ?? 0) + 1);
  const rows = [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  if (rows.length === 0) {
    return <div class="empty"><Icon name="chart" /><strong>No tamper events yet</strong><span>Zones with alerts are ranked here.</span></div>;
  }
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

/** Median seconds from alert to acknowledge, from the real event log; null when nothing was acknowledged. */
function medianAckSeconds(items: Incident[]): number | null {
  const t = items.filter((i) => i.kind === 'tamper' && !i.test && i.ackedAt).map((i) => (i.ackedAt! - i.at) / 1000).sort((a, b) => a - b);
  if (t.length === 0) return null;
  return t.length % 2 ? t[(t.length - 1) / 2]! : (t[t.length / 2 - 1]! + t[t.length / 2]!) / 2;
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
        if (r.status === 404) throw new Error('No store has that code.');
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
  const ack = medianAckSeconds(real);

  return (
    <>
      <Island backHref={import.meta.env.BASE_URL} />
      <main class="page wide">
        <Reveal as="h1">Store events</Reveal>
        <Reveal i={1}>
          <form class="inline" onSubmit={(e) => { e.preventDefault(); if (CODE_RE.test(input)) { setCode(input); history.replaceState(null, '', `?store=${input}`); } }}>
            <label class="sr-only" for="sc">Store code</label>
            <input id="sc" class="input code" value={input} placeholder="STORE CODE" autoCapitalize="characters" autoComplete="off" spellcheck={false} maxLength={9}
              onInput={(e) => setInput(normalizeCode((e.target as HTMLInputElement).value))} />
            <button class="btn btn-primary" type="submit" disabled={!CODE_RE.test(input)}>Show store</button>
          </form>
        </Reveal>
        {err && <p class="error" role="alert">{err}</p>}
        {!CODE_RE.test(code) && <p class="lede">Enter the store code shown on the staff console to see its events.</p>}
        {CODE_RE.test(code) && !data && !err && <div class="stats-row"><div class="skel" /><div class="skel" /><div class="skel" /></div>}

        {data && (
          <>
            <p class="muted" aria-live="polite">Store <span class="mono">{code}</span>, updated <span class="mono">{new Date(updated).toLocaleTimeString()}</span></p>
            <Reveal>
              <div class="stats-row stats">
                <div class="stat"><span class="stat-n"><Count n={tampers.length} /></span><span class="stat-l">Tamper alerts</span></div>
                <div class="stat"><span class={`stat-n ${open.length ? 'redn' : ''}`}><Count n={open.length} /></span><span class="stat-l">Open alerts</span></div>
                <div class="stat"><span class="stat-n">{ack === null ? 'n/a' : <Count n={ack} d={1} />}{ack !== null && <small>s</small>}</span><span class="stat-l">Median time to acknowledge</span></div>
                <div class="stat"><span class="stat-n"><Count n={checkouts.length} /></span><span class="stat-l">Checkouts</span></div>
                <div class="stat"><span class="stat-n"><Count n={online} /><small>of {data.zones.length}</small></span><span class="stat-l">Zones online</span></div>
              </div>
            </Reveal>

            <div class="cols two even" style={{ marginTop: '8px' }}>
              <div>
                <Reveal as="h2">Tamper alerts by zone</Reveal>
                <Reveal i={1}><ZoneBars items={data.incidents} /></Reveal>
                <Reveal as="h2">Zones</Reveal>
                <Reveal i={1}>
                  <Bezel>
                    <table class="dtable" aria-label="Zones">
                      <thead><tr><th scope="col">Zone</th><th scope="col">Type</th><th scope="col">Status</th><th scope="col">Last heard</th></tr></thead>
                      <tbody>{data.zones.map((z) => (
                        <tr key={z.name}><td>{z.name}</td><td>{z.type}</td><td>{z.online ? 'Listening' : 'Offline'}</td><td class="mono">{new Date(z.lastSeen).toLocaleTimeString()}</td></tr>
                      ))}</tbody>
                    </table>
                  </Bezel>
                </Reveal>
                <Reveal as="h2">Tag profile</Reveal>
                <Reveal i={1}>
                  <Bezel tone="tan">
                    {data.profile
                      ? <p><span class="mono">{Math.round(data.profile.freqHz).toLocaleString('en-US')} Hz</span>, accepts <span class="mono">±{(toleranceFrac(data.profile.spreadFrac) * 100).toFixed(2)}%</span>, decay <span class="mono">{data.profile.decayMs.toFixed(1)} ms</span>. Calibrated {new Date(data.profile.calibratedAt).toLocaleString()}.</p>
                      : <p class="muted">Not calibrated.</p>}
                  </Bezel>
                </Reveal>
              </div>
              <div>
                <Reveal as="h2">Event log</Reveal>
                <Reveal i={1}><EventLog items={data.incidents} /></Reveal>
              </div>
            </div>
          </>
        )}
      </main>
    </>
  );
}

render(<Dashboard />, document.getElementById('app')!);
