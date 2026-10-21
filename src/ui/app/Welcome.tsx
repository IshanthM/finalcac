import { useEffect, useRef, useState } from 'preact/hooks';
import { chime } from '../../alert/siren.ts';
import { unlockOutputs } from '../../alert/unlock.ts';
import { chooseRole } from '../../runtime.ts';
import { getState, go, setState } from '../../state.ts';
import { Mark } from '../Brand.tsx';
import { Stages } from '../Stages.tsx';
import { TagModel } from '../TagModel.tsx';
import { RingTrace } from '../Trace.tsx';
import { Row } from './parts.tsx';

/** Three swipeable pages: the idea, how it works, and what this phone is for. Shown on first launch. */
export function Welcome({ onDone }: { onDone: () => void }) {
  const rail = useRef<HTMLDivElement>(null);
  const [page, setPage] = useState(0);
  const [pulled, setPulled] = useState(false);
  const [replay, setReplay] = useState(0);

  useEffect(() => {
    const el = rail.current;
    if (!el) return;
    const on = (): void => setPage(Math.round(el.scrollLeft / el.clientWidth));
    el.addEventListener('scroll', on, { passive: true });
    return () => el.removeEventListener('scroll', on);
  }, []);
  const goTo = (i: number): void => rail.current?.scrollTo({ left: i * (rail.current?.clientWidth ?? 0), behavior: 'smooth' });
  const finish = (): void => { setState({ welcomed: true }); onDone(); };
  const pull = (): void => { if (pulled) return; unlockOutputs(); chime(); setPulled(true); setReplay((n) => n + 1); };
  const pick = (role: 'demo' | 'listener' | 'staff'): void => {
    chooseRole(role);
    finish();
    if (role !== 'demo' && !getState().storeCode) go(role === 'listener' ? 'join/listener' : 'join/staff'); else go('');
  };

  return (
    <div class="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Resonance">
      <div class="w-top">
        <span class="brand"><Mark />Resonance</span>
        <button class="btn btn-plain" onClick={finish}>Skip</button>
      </div>
      <div class="w-slides" ref={rail}>
        <section class="w-slide" aria-label="Page 1 of 3"><div>
          <h1 class="display">Hear the tag.<br />Find the <em>zone</em>.</h1>
          <p class="lede">Phones in each zone listen for an anti-theft tag's ring and tell staff exactly where it was tampered with.</p>
          <div class="tag-stage">
            <TagModel pulled={pulled} onPull={pull} />
            <div class="scope compact draw" key={replay}>{pulled ? <RingTrace bare replayKey={replay} /> : <RingTrace bare replayKey={-1} />}</div>
            <div class="actions">
              {pulled ? <button class="btn btn-plain" onClick={() => setPulled(false)}>Re-arm the tag</button> : <button class="btn btn-tint" onClick={pull}>Pull the pin</button>}
              <span class="muted" style={{ fontSize: '15px' }}>{pulled ? 'Ringing at about 13.3 kHz' : 'Drag the tag to turn it'}</span>
            </div>
          </div>
        </div></section>
        <section class="w-slide" aria-label="Page 2 of 3"><div>
          <h1 class="display">From tag to alert<em>.</em></h1>
          <p class="lede">The tag rings. A phone hears it. The zone is named. Staff are alerted.</p>
          <Stages />
        </div></section>
        <section class="w-slide" aria-label="Page 3 of 3"><div>
          <h1 class="display">What is this phone <em>for</em>?</h1>
          <p class="lede">You can change this any time in Settings.</p>
          <div class="group">
            <Row icon="play" title="Try the demo" sub="One phone plays both roles. No tag needed." onClick={() => pick('demo')} />
            <Row icon="mic" tone="blue" title="Listener" sub="Place it in a fitting room or aisle." onClick={() => pick('listener')} />
            <Row icon="bell" tone="amber" title="Staff console" sub="Get alerts and see which zone." onClick={() => pick('staff')} />
          </div>
        </div></section>
      </div>
      <div class="w-foot">
        <div class="dots" aria-hidden="true">{[0, 1, 2].map((i) => <i key={i} class={page === i ? 'on' : ''} />)}</div>
        {page < 2
          ? <button class="btn btn-primary btn-block" onClick={() => goTo(page + 1)}>Next</button>
          : <button class="btn btn-tint btn-block" onClick={finish}>Explore without choosing</button>}
      </div>
    </div>
  );
}
