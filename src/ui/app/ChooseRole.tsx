import { chooseRole } from '../../runtime.ts';
import { getState, go } from '../../state.ts';
import { Head, Row } from './parts.tsx';

/** First thing a person sees after the welcome: what is this phone for? */
export function ChooseRole() {
  const pick = (role: 'demo' | 'listener' | 'staff'): void => {
    chooseRole(role);
    if (role !== 'demo' && !getState().storeCode) go(role === 'listener' ? 'join/listener' : 'join/staff');
  };
  return (
    <div class="screen">
      <Head title="Resonance" sub="What is this phone doing?" />
      <div class="group">
        <Row icon="play" title="Try the demo" sub="One phone plays both roles. No tag needed." onClick={() => pick('demo')} />
        <Row icon="mic" tone="blue" title="Listener" sub="Place it in a fitting room or aisle to hear tag rings." onClick={() => pick('listener')} />
        <Row icon="bell" tone="amber" title="Staff console" sub="Get alerts and see which zone." onClick={() => pick('staff')} />
      </div>
      <p class="sect">Learn</p>
      <div class="group">
        <Row icon="info" title="How it works" sub="The problem, the tag, and how detection decides." onClick={() => go('about')} />
        <Row icon="tune" title="Calibrate a tag" sub="Ring a tag five times so phones know what to listen for." onClick={() => go('calibrate')} />
      </div>
    </div>
  );
}
