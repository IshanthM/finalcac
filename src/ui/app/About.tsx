import { useState } from 'preact/hooks';
import { go } from '../../state.ts';
import { Bezel } from '../Bezel.tsx';
import { Blueprint } from '../Blueprint.tsx';
import { Stages } from '../Stages.tsx';
import { UseCases } from '../UseCases.tsx';
import { Head, Row } from './parts.tsx';

const REPO = 'https://github.com/IshanthM/finalcac';

/** The story for people judging it: the problem, where it works, the tag, how detection decides. */
export function About() {
  const [, force] = useState(0);
  void force;
  return (
    <div class="screen">
      <Head title="How it works" sub="The problem, the tag, and how detection decides" back />

      <p class="sect">Why it matters</p>
      <div class="facts">
        <div class="fact"><span class="fact-n"><em>$112B</em></span><p>Estimated U.S. retail shrink in 2022.</p><cite>National Retail Federation</cite></div>
        <div class="fact"><span class="fact-n">Magnets</span><p>Standard anti-theft tags can be opened with one, and staff never learn where it happened.</p></div>
        <div class="fact"><span class="fact-n">13.3 <em>kHz</em></span><p>Resonance's tag rings at a pitch phones can hear, so the phone that hears it names the zone.</p></div>
      </div>

      <p class="sect">Where it works</p>
      <UseCases />

      <p class="sect">From tag to alert</p>
      <Stages />

      <p class="sect">The tag</p>
      <Bezel tone="tan">
        <Blueprint />
        <ul class="legend">
          <li><b>A</b>6 mm aluminum standoff, 46 mm long</li>
          <li><b>B</b>3D-printed clip, one at each end</li>
          <li><b>C</b>Tack pin: pulling it makes the bar ring</li>
        </ul>
      </Bezel>
      <div class="pills" style={{ marginTop: '14px' }}><span class="pill">Battery-free</span><span class="pill">Passive</span><span class="pill">Re-arms in seconds</span></div>
      <div class="group" style={{ padding: '4px 16px' }}>
        <dl class="spec">
          <div><dt>Ring</dt><dd>One clear tone near <strong>13.3 kHz</strong>. Real tags land within a few percent, which is why each store calibrates.</dd></div>
          <div><dt>Click</dt><dd>Pulling the pin also makes a short broadband click. Detection skips it and listens to the ring that follows.</dd></div>
          <div><dt>Identity</dt><dd>Every tag is identical. Location comes from which phone heard it, not from the tag.</dd></div>
          <div><dt>Exit gates</dt><dd>A separate 58 kHz label is still there for the door. Resonance works alongside it.</dd></div>
        </dl>
      </div>

      <p class="sect">How it decides</p>
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

      <p class="sect">Try it</p>
      <div class="group">
        <Row icon="play" title="Open the demo" sub="No tag needed" onClick={() => go('')} />
      </div>
    </div>
  );
}
