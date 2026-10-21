import { useState } from 'preact/hooks';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { go, useAppState } from '../state.ts';
import { Bezel } from './Bezel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Orb } from './Orb.tsx';
import { Reveal } from './Reveal.tsx';

function Tile({ icon, title, text, foot, onClick, href, tone = '', big = false, span = '', visual = false }: {
  icon: IconName; title: string; text: string; foot?: string; onClick?: () => void; href?: string; tone?: '' | 'blue' | 'amber' | 'tan'; big?: boolean; span?: string; visual?: boolean;
}) {
  const body = (
    <span class={`tile ${big ? 'big' : ''}`}>
      {visual && <span class="tile-visual" aria-hidden="true"><Orb on /></span>}
      <span class="tile-top"><span class="tile-ico"><Icon name={icon} /></span><span class="tile-go"><Icon name="arrow" /></span></span>
      <span><strong class="tile-title">{title}</strong><span class="tile-text">{text}</span></span>
      {foot && <span class="tile-foot">{foot}</span>}
    </span>
  );
  const cls = `bz ${tone ? `tone-${tone}` : ''} ${span}`;
  return href
    ? <a class={cls} href={href}><div class="bz-in">{body}</div></a>
    : <button class={cls} onClick={onClick}><div class="bz-in">{body}</div></button>;
}

function Fact({ icon, title, text, tone = '', span }: { icon: IconName; title: string; text: string; tone?: '' | 'blue' | 'amber' | 'tan'; span: string }) {
  return (
    <Bezel tone={tone} class={span}>
      <div class="stack">
        <span class="tile-ico"><Icon name={icon} /></span>
        <div><h3>{title}</h3><p class="muted">{text}</p></div>
      </div>
    </Bezel>
  );
}

export function Home() {
  const s = useAppState();
  const base = import.meta.env.BASE_URL;
  const [ping, setPing] = useState(0);
  const ring = (): void => { unlockOutputs(); chime(); setPing((n) => n + 1); };
  const storeFoot = s.storeCode ? `Store ${s.storeCode}` : 'Needs a store code';

  return (
    <main class="page">
      <section class="hero-split">
        <div class="hero-copy">
          <h1 class="display"><span class="ln"><span style={{ '--d': 0 }}>Hear the tag.</span></span><span class="ln"><span style={{ '--d': 1 }}>Find the <em>zone</em>.</span></span></h1>
          <Reveal i={1} as="p" class="lede">Phones in each zone listen for a tag's ring and tell staff where it happened.</Reveal>
          <Reveal i={2} class="actions">
            <button class="btn btn-primary" onClick={() => go('demo')}>Try demo mode</button>
            <button class="btn" onClick={() => go('calibrate')}>Calibrate a tag</button>
          </Reveal>
        </div>
        <Reveal i={2}>
          <button class="orb-tap" onClick={ring} aria-label="Play a sample alert chime"><Orb on pingKey={ping} /></button>
          <p class="orb-cap">Tap the orb to hear the alert chime.</p>
        </Reveal>
      </section>

      <Reveal as="h2">Set this phone's job</Reveal>
      <div class="bento">
        <Reveal class="span-4 row-2"><Tile big span="" icon="mic" title="Listener" text="Place it in a fitting room or an aisle. It listens for tag rings and reports its zone." foot={storeFoot} onClick={() => go(s.storeCode ? 'listener' : 'join/listener')} tone="blue" visual /></Reveal>
        <Reveal i={1} class="span-2"><Tile icon="bell" title="Staff console" text="Get the alert and see which zone." foot={storeFoot} onClick={() => go(s.storeCode ? 'console' : 'join/staff')} /></Reveal>
        <Reveal i={2} class="span-2"><Tile icon="chart" title="Event dashboard" text="Review every alert and checkout." href={`${base}dashboard.html${s.storeCode ? `?store=${s.storeCode}` : ''}`} /></Reveal>
      </div>

      <Reveal as="h2">From tamper to alert</Reveal>
      <Reveal>
        <Bezel tone="tan">
          <ol class="path">
            <li><span class="tile-ico"><Icon name="wave" /></span><div><h3>The tag rings</h3><p>Pulling the pin makes a small aluminum bar ring at about 13.3 kHz.</p></div></li>
            <li><span class="tile-ico"><Icon name="mic" /></span><div><h3>A phone hears it</h3><p>Only a clean, fading tone passes. Clinks and keys do not.</p></div></li>
            <li><span class="tile-ico"><Icon name="pin" /></span><div><h3>The zone is named</h3><p>Each phone knows its zone, so the alert says where.</p></div></li>
            <li><span class="tile-ico"><Icon name="bell" /></span><div><h3>Staff are alerted</h3><p>A siren, the zone spoken aloud, and a full-screen alert.</p></div></li>
          </ol>
        </Bezel>
      </Reveal>

      <Reveal as="h2">Ready check</Reveal>
      <div class="bento">
        <Reveal class="span-4">
          <button class="bz tone-blue" onClick={() => go('calibrate')} style={{ width: '100%' }}>
            <div class="bz-in"><span class="tile">
              <span class="tile-top"><span class="tile-ico"><Icon name="tune" /></span><span class="tile-go"><Icon name="arrow" /></span></span>
              <span><strong class="tile-title">Tag profile</strong>
                <span class="stat-n" style={{ marginTop: '6px' }}>{s.profile ? Math.round(s.profile.freqHz).toLocaleString('en-US') : 'None'}<small>{s.profile ? 'Hz' : 'yet'}</small></span>
              </span>
              <span class="tile-text">{s.profile ? 'Calibrated. Recalibrate any time.' : 'Ring a tag five times so phones know what to listen for.'}</span>
            </span></div>
          </button>
        </Reveal>
        <Reveal i={1} class="span-2"><Bezel tone="tan"><div class="stack"><span class="tile-ico"><Icon name="store" /></span><div><h3>Store</h3><span class="stat-n" style={{ fontSize: '34px', letterSpacing: '0.16em', marginTop: '6px' }}>{s.storeCode ?? 'None'}</span></div><p class="muted">Share the code with every listener phone.</p></div></Bezel></Reveal>
        <Reveal class="span-2"><Fact span="" icon="lock" title="Audio stays on the phone" text="Detection runs on-device. Only a zone name and signal strength are sent." /></Reveal>
        <Reveal i={1} class="span-4"><Fact span="" tone="amber" icon="offline" title="Works without a connection" text="A listener keeps alerting on its own screen and sends the report when it is back online." /></Reveal>
      </div>

      <Reveal as="div" class="actions">
        <a class="btn btn-quiet" href={`${base}?debug=1`}><Icon name="bug" />Debug recorder</a>
      </Reveal>
    </main>
  );
}
