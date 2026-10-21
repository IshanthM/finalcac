import { useState } from 'preact/hooks';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { getState, go, setState, useAppState } from '../state.ts';
import { Bezel } from './Bezel.tsx';
import { Blueprint } from './Blueprint.tsx';
import { Icon, type IconName } from './Icon.tsx';
import { Orb } from './Orb.tsx';
import { Reveal } from './Reveal.tsx';
import { Stages } from './Stages.tsx';
import { TagModel } from './TagModel.tsx';
import { UseCases } from './UseCases.tsx';
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
  const [pulled, setPulled] = useState(false);
  const pull = (): void => { if (pulled) return; unlockOutputs(); chime(); setPulled(true); setReplay((n) => n + 1); };
  const rearm = (): void => setPulled(false);
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
        <Reveal i={2} class="tag-stage">
          <Bezel tone="blue" ticks>
            <TagModel pulled={pulled} onPull={pull} />
            <div class="scope compact draw" key={replay}>{pulled ? <RingTrace bare replayKey={replay} /> : <RingTrace bare replayKey={-1} />}</div>
            <div class="stage-controls">
              <p class="stage-hint">{pulled ? 'Ringing at about 13.3 kHz' : 'Drag to turn the tag'}</p>
              {pulled
                ? <button class="btn btn-quiet" onClick={rearm}>Re-arm the tag</button>
                : <button class="btn" onClick={pull}>Pull the pin</button>}
            </div>
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
        <h2 class="sec-label">Where it works</h2>
        <UseCases />
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">From tag to alert</h2>
        <Stages />
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
        <h2 class="sec-label">The tag</h2>
        <div class="hw">
          <Bezel ticks tone="tan">
            <Blueprint />
            <ul class="legend">
              <li><b>A</b>6 mm aluminum standoff, 46 mm long</li>
              <li><b>B</b>3D-printed clip, one at each end</li>
              <li><b>C</b>Tack pin: pulling it makes the bar ring</li>
            </ul>
          </Bezel>
          <div>
            <div class="pills"><span class="pill">Battery-free</span><span class="pill">Passive</span><span class="pill">Re-arms in seconds</span></div>
            <dl class="spec">
              <div><dt>Ring</dt><dd>One clear tone near <strong>13.3 kHz</strong>. Real tags land within a few percent, which is why each store calibrates.</dd></div>
              <div><dt>Click</dt><dd>Pulling the pin also makes a short broadband click. Detection skips it and listens to the ring that follows.</dd></div>
              <div><dt>Identity</dt><dd>Every tag is identical. Location comes from which phone heard it, not from the tag.</dd></div>
              <div><dt>Exit gates</dt><dd>A separate 58 kHz label is still there for the door. Resonance works alongside it.</dd></div>
            </dl>
          </div>
        </div>
      </Reveal>

      <Reveal as="section" class="sec">
        <h2 class="sec-label">How it decides</h2>
        <div>
          <p class="statement">Four checks decide every ring. <span>Anything that fails one is ignored.</span></p>
          <div class="numbers">
            <Bezel tone="blue" class="feat"><div><span class="stat-n">12<small>dB</small></span><p class="desc">Minimum signal over the background noise before a sound counts as a ring.</p></div><div class="src"><span>Signal check</span><span>Set in code</span></div></Bezel>
            <Bezel><div><span class="stat-n">0.5<small>%</small></span><p class="desc">How closely all five calibration rings must agree.</p></div><div class="src"><span>Calibration</span><span>Per store</span></div></Bezel>
            <Bezel><div><span class="stat-n">1<small>s</small></span><p class="desc">Window for merging reports from several phones into one alert.</p></div><div class="src"><span>Merging</span><span>Set in code</span></div></Bezel>
            <Bezel tone="amber" class="wide"><div><span class="stat-n">4</span><p class="desc">Checks per ring: signal, clean tone, fade-out, and frequency.</p></div><div class="src"><span>Pipeline</span><span>All must pass</span></div></Bezel>
          </div>
          <div class="faq">
            <details><summary>What counts as a tag ring?</summary><div class="ans">A clean tone near the tag's calibrated frequency, at least 12 dB above the background, that fades away within a fraction of a second. A steady beep, a burst of noise, or a chord does not pass.</div></details>
            <details><summary>How do several phones agree?</summary><div class="ans">Reports that arrive within a second are merged into one alert. The loudest zone is named, and the others are listed as "also heard by".</div></details>
            <details><summary>Where does the audio go?</summary><div class="ans">Nowhere. Detection runs on the phone. Only a zone name and signal strength go to the store's relay, and a listener with no connection still alerts on its own screen.</div></details>
            <details><summary>What can it miss?</summary><div class="ans">Very quiet or very short rings can fail the checks, and a tag that was never calibrated will not be accepted. That is why each store calibrates with its own tags first.</div></details>
            <details><summary>How is it tested?</summary><div class="ans">Over 180 automated tests run detection against synthetic rings, clatter and music, plus browser tests of every flow. <a href={REPO} target="_blank" rel="noopener">The code is public on GitHub.</a></div></details>
          </div>
        </div>
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
