import { Bezel } from './Bezel.tsx';

/** A tiny floor plan with one area lit. Original models; no photography. */
function Plan({ hi }: { hi: 'fitting' | 'register' | 'floor' }) {
  const on = 'plan-hi';
  return (
    <svg viewBox="0 0 200 120" aria-hidden="true" focusable="false">
      <rect x="8" y="8" width="184" height="104" class="plan-wall" />
      {/* fitting rooms along the left */}
      {[0, 1, 2].map((i) => <rect key={i} x="14" y={14 + i * 31} width="40" height="28" class={hi === 'fitting' && i === 1 ? on : 'plan-room'} />)}
      {/* shelves on the floor */}
      {[0, 1].map((i) => <rect key={i} x="80" y={22 + i * 30} width="70" height="9" class={hi === 'floor' ? on : 'plan-room'} />)}
      {/* register counter by the door */}
      <rect x="132" y="86" width="46" height="18" class={hi === 'register' ? on : 'plan-room'} />
      <path d="M192 52V68" class="plan-door" />
      {hi === 'fitting' && <circle class="plan-dot" cx="34" cy="59" r="4" />}
      {hi === 'floor' && <circle class="plan-dot" cx="115" cy="57" r="4" />}
      {hi === 'register' && <circle class="plan-dot" cx="155" cy="95" r="4" />}
    </svg>
  );
}

const CASES = [
  { hi: 'fitting', title: 'Fitting rooms', text: 'The loudest phone names the room. Staff hear the siren and the spoken zone.', tag: 'Alarms', tone: 'blue' },
  { hi: 'register', title: 'Register', text: 'A pin pulled at checkout is logged quietly as a checkout. No siren.', tag: 'Quiet log', tone: '' },
  { hi: 'floor', title: 'Sales floor', text: 'Aisles get their own zones, so a tampered tag points to a part of the store.', tag: 'Alarms', tone: 'amber' },
] as const;

export function UseCases() {
  return (
    <div class="cases">
      {CASES.map((c) => (
        <Bezel key={c.title} tone={c.tone}>
          <div class="case-art"><Plan hi={c.hi} /></div>
          <div class="case-head"><h3>{c.title}</h3><span class="pill">{c.tag}</span></div>
          <p class="muted">{c.text}</p>
        </Bezel>
      ))}
    </div>
  );
}
