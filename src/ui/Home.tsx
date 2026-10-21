import { useState } from 'preact/hooks';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { go, useAppState } from '../state.ts';
import { Bezel } from './Bezel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Reveal } from './Reveal.tsx';
import { RingTrace } from './Trace.tsx';

function Row({ icon, title, text, meta, onClick, href }: { icon: IconName; title: string; text: string; meta?: string; onClick?: () => void; href?: string }) {
  const inner = (
    <>
      <Icon name={icon} />
      <span><span class="idx-title">{title}</span><span class="idx-text">{text}</span></span>
      <span class="idx-end">{meta && <span class="idx-meta">{meta}</span>}<span class="idx-go"><Icon name="next" /></span></span>
    </>
  );
  return <li>{href ? <a class="idx-row" href={href}>{inner}</a> : <button class="idx-row" onClick={onClick}>{inner}</button>}</li>;
}

export function Home() {
  const s = useAppState();
  const base = import.meta.env.BASE_URL;
  const [replay, setReplay] = useState(0);
  const ring = (): void => { unlockOutputs(); chime(); setReplay((n) => n + 1); };

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
          <Bezel tone="blue">
            <button class="trace-tap" onClick={ring} aria-label="Play the alert chime and redraw the ring">
              <div class="scope draw"><RingTrace replayKey={replay} /></div>
              <div class="scope-cap"><span><b>13.3 kHz</b> tag ring, illustrative</span><span>Tap to hear the alert</span></div>
            </button>
          </Bezel>
        </Reveal>
      </section>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">This phone</h2>
        <ul class="idx">
          <Row icon="mic" title="Listener" text="Place it in a fitting room or an aisle. It listens for tag rings and reports its zone." meta={s.storeCode ? `Store ${s.storeCode}` : 'Needs a code'} onClick={() => go(s.storeCode ? 'listener' : 'join/listener')} />
          <Row icon="bell" title="Staff console" text="Get the alert, hear it, and see which zone." meta={s.storeCode ? `Store ${s.storeCode}` : 'Needs a code'} onClick={() => go(s.storeCode ? 'console' : 'join/staff')} />
          <Row icon="chart" title="Event dashboard" text="Review every alert and checkout." href={`${base}dashboard.html${s.storeCode ? `?store=${s.storeCode}` : ''}`} />
        </ul>
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">Signal path</h2>
        <ol class="path">
          <li><h3>The tag rings</h3><p>Pulling the pin makes a small aluminum bar ring at about 13.3 kHz.</p></li>
          <li><h3>A phone hears it</h3><p>Only a clean, fading tone passes. Clinks and keys do not.</p></li>
          <li><h3>The zone is named</h3><p>Each phone knows its zone, so the alert says where.</p></li>
          <li><h3>Staff are alerted</h3><p>A siren, the zone spoken aloud, and a full-screen alert.</p></li>
        </ol>
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">Status</h2>
        <dl class="spec">
          <div><dt>Tag profile</dt><dd><span class="val">{s.profile ? `${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'Not calibrated'}</span> <button class="btn btn-quiet" onClick={() => go('calibrate')}>{s.profile ? 'Recalibrate' : 'Calibrate now'}</button></dd></div>
          <div><dt>Store</dt><dd><span class="val">{s.storeCode ?? 'None yet'}</span>{s.storeCode ? ' Share the code with every listener phone.' : ' Join or create one from a role above.'}</dd></div>
          <div><dt>Privacy</dt><dd><strong>Audio stays on the phone.</strong> Detection runs on-device. Only a zone name and signal strength are sent.</dd></div>
          <div><dt>Offline</dt><dd><strong>Works without a connection.</strong> A listener keeps alerting on its own screen and sends the report when it is back online.</dd></div>
        </dl>
      </Reveal>

      <div class="actions"><a class="btn btn-quiet" href={`${base}?debug=1`}><Icon name="bug" />Debug recorder</a></div>
    </main>
  );
}
