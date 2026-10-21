import { useState } from 'preact/hooks';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { getState, go, setState, useAppState } from '../state.ts';
import { Bezel } from './Bezel.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Orb } from './Orb.tsx';
import { Reveal } from './Reveal.tsx';
import { RingTrace } from './Trace.tsx';

const REPO = 'https://github.com/IshanthM/finalcac';

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
  const code = s.storeCode;
  // Demo mode starts instantly: give the phone a default zone the first time (it can be changed there).
  const startDemo = (): void => {
    if (!getState().zone) setState({ zone: { name: 'Fitting Room 2', type: 'fitting' }, role: 'demo' });
    go('demo');
  };

  return (
    <main class="page">
      <section class="hero-split">
        <div class="hero-copy">
          <h1 class="display"><span class="ln"><span style={{ '--d': 0 }}>Hear the tag.</span></span><span class="ln"><span style={{ '--d': 1 }}>Find the <em>zone</em>.</span></span></h1>
          <Reveal i={1} as="p" class="lede">Phones in each zone listen for a tag's ring and tell staff where it happened.</Reveal>
          <Reveal i={2} class="actions">
            <button class="btn btn-primary" onClick={startDemo}>Try the demo</button>
            <button class="btn" onClick={() => go('calibrate')}>Calibrate a tag</button>
          </Reveal>
        </div>
        <Reveal i={2} class="scope-wrap">
          <Bezel tone="blue" ticks>
            <button class="trace-tap" onClick={ring} aria-label="Play the alert chime and redraw the ring">
              <div class="scope draw"><RingTrace replayKey={replay} /></div>
              <div class="scope-cap"><span><b>13.3 kHz</b> tag ring, illustrative</span><span>Tap to hear the alert</span></div>
            </button>
          </Bezel>
        </Reveal>
      </section>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">Why it matters</h2>
        <div class="facts">
          <div class="fact"><span class="fact-n"><em>$112B</em></span><p>Estimated U.S. retail shrink in 2022.</p><cite>National Retail Federation</cite></div>
          <div class="fact"><span class="fact-n">Magnets</span><p>Standard anti-theft tags can be opened with one, and staff never learn where it happened.</p></div>
          <div class="fact"><span class="fact-n">13.3 <em>kHz</em></span><p>Resonance's tag rings at a pitch phones can hear, so the phone that hears it names the zone.</p></div>
        </div>
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">Try it</h2>
        <div class="role-grid">
          <button class="bz tone-blue" onClick={() => go(code ? 'listener' : 'join/listener')}>
            <div class="bz-in feature">
              <Orb on small />
              <div class="feature-body">
                <span class="idx-title">Listener</span>
                <span class="idx-text">Place it in a fitting room or an aisle. It listens for tag rings and reports its zone.</span>
                <span class="feature-foot"><span class="idx-meta">{code ? `Store ${code}` : 'Needs a store code'}</span><span class="idx-go"><Icon name="next" /></span></span>
              </div>
            </div>
          </button>
          <Bezel>
            <ul class="idx">
              <Row icon="bell" title="Staff console" text="Get the alert, hear it, and see which zone." meta={code ? `Store ${code}` : undefined} onClick={() => go(code ? 'console' : 'join/staff')} />
              <Row icon="chart" title="Event dashboard" text="Every alert and checkout, with response times." href={`${base}dashboard.html${code ? `?store=${code}` : ''}`} />
              <Row icon="play" title="Demo mode" text="One phone plays both roles. No tag needed." onClick={startDemo} />
            </ul>
          </Bezel>
        </div>
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
        <h2 class="sec-label">Under the hood</h2>
        <dl class="spec">
          <div><dt>Detection</dt><dd><strong>Runs on the phone.</strong> A Fourier transform finds one narrow tone, then the way it fades is checked. Noise, clatter and music fail that test.</dd></div>
          <div><dt>Calibration</dt><dd>Ring the tag five times. All five must agree within 0.5%, and the median becomes the store's profile.</dd></div>
          <div><dt>Merging</dt><dd>If several phones hear one ring within a second, staff get one alert that names the loudest zone.</dd></div>
          <div><dt>Privacy</dt><dd><strong>Audio never leaves the phone.</strong> Only a zone name and signal strength are sent, and a listener keeps alerting with no connection.</dd></div>
          <div><dt>Tested</dt><dd>Over 180 automated tests check detection against synthetic rings, clatter and music, plus browser tests of every flow.</dd></div>
          <div><dt>Source</dt><dd><a class="btn btn-quiet" href={REPO} target="_blank" rel="noopener">Read the code on GitHub</a></dd></div>
        </dl>
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">This device</h2>
        <dl class="spec">
          <div><dt>Tag profile</dt><dd><span class="val">{s.profile ? `${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'Not calibrated'}</span> <button class="btn btn-quiet" onClick={() => go('calibrate')}>{s.profile ? 'Recalibrate' : 'Calibrate now'}</button></dd></div>
          <div><dt>Store</dt><dd><span class="val">{code ?? 'None yet'}</span>{code ? ' Share the code with every listener phone.' : ' Join or create one from a role above.'}</dd></div>
        </dl>
      </Reveal>

      <div class="actions"><a class="btn btn-quiet" href={`${base}?debug=1`}><Icon name="bug" />Debug recorder</a></div>
    </main>
  );
}
