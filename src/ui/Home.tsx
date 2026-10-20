import { go, useAppState } from '../state.ts';
import { Icon, type IconName } from './Icon.tsx';
import { Orb } from './Orb.tsx';

function RoleCard({ icon, title, text, onClick, primary }: { icon: IconName; title: string; text: string; onClick: () => void; primary?: boolean }) {
  return (
    <button class={`card-link ${primary ? 'primary' : ''}`} onClick={onClick}>
      <span class="card-icon"><Icon name={icon} /></span>
      <span class="card-body"><strong>{title}</strong><span>{text}</span></span>
      <span class="card-go"><Icon name="arrow" /></span>
    </button>
  );
}

export function Home() {
  const s = useAppState();
  const base = import.meta.env.BASE_URL;
  return (
    <main class="page">
      <div class="rise" style={{ '--i': 0 }}><Orb /></div>
      <h1 class="rise" style={{ '--i': 1 }}>Resonance</h1>
      <p class="lede rise" style={{ '--i': 2 }}>Phones that listen for tampered tags and tell staff which zone it happened in.</p>

      <div class="status-line rise" style={{ '--i': 3 }}>
        <p class={`chip ${s.profile ? 'ok' : 'warnchip'}`}>
          {s.profile ? `Tag profile · ${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz` : 'No tag profile yet'}
        </p>
        {s.storeCode && <p class="chip ok">Store {s.storeCode}</p>}
      </div>

      <h2 class="rise" style={{ '--i': 4 }}>What is this phone doing?</h2>
      <div class="cards rise" style={{ '--i': 5 }}>
        <RoleCard primary icon="mic" title="Listener" text="Sit in a fitting room or aisle and listen for tag rings." onClick={() => go(s.storeCode ? 'listener' : 'join/listener')} />
        <RoleCard icon="bell" title="Staff console" text="Get the alert, hear it, and see which zone." onClick={() => go(s.storeCode ? 'console' : 'join/staff')} />
        <RoleCard icon="play" title="Demo mode" text="One phone plays both roles. Best for filming." onClick={() => go('demo')} />
      </div>

      <h2 class="rise" style={{ '--i': 6 }}>Set up and review</h2>
      <div class="tools rise" style={{ '--i': 7 }}>
        <button class="tool" onClick={() => go('calibrate')}><Icon name="tune" />Calibrate tag</button>
        <a class="tool" href={`${base}dashboard.html${s.storeCode ? `?store=${s.storeCode}` : ''}`}><Icon name="chart" />Event dashboard</a>
        <a class="tool" href={`${base}?debug=1`}><Icon name="bug" />Debug recorder</a>
      </div>
    </main>
  );
}
