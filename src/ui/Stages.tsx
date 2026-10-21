import { useEffect, useRef, useState } from 'preact/hooks';
import { chime } from '../alert/siren.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { Bezel } from './Bezel.tsx';

/** Four stages from tag to alert, each with its own small model. Plays once when scrolled into view, and on demand. */
function TagMini() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <defs><linearGradient id="sg" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#cdd8e6" /><stop offset="0.5" stop-color="#7f93ab" /><stop offset="1" stop-color="#34465c" /></linearGradient></defs>
      <rect x="22" y="43" width="116" height="14" rx="3" fill="url(#sg)" />
      <rect x="44" y="34" width="14" height="32" rx="3" class="clip-m" /><rect x="102" y="34" width="14" height="32" rx="3" class="clip-m" />
      <g class="pin-m"><rect x="49" y="12" width="4" height="30" rx="1.5" fill="#d2b99a" /><circle cx="51" cy="12" r="5" fill="#ecd6b8" /></g>
      {[0, 1, 2].map((i) => <circle key={i} class="arc-m" style={{ '--i': i }} cx="80" cy="50" r="30" fill="none" stroke="#d2b99a" stroke-width="1.5" />)}
    </svg>
  );
}
function PhoneMini() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect x="28" y="6" width="44" height="88" rx="9" class="outline-m" />
      <path class="line-m" d="M34 70 L40 69 L45 71 L50 68 L54 40 L58 74 L63 70 L66 71" pathLength={1} fill="none" />
      <rect x="40" y="12" width="20" height="3" rx="1.5" fill="rgba(255,255,255,0.25)" />
    </svg>
  );
}
function MapMini() {
  return (
    <svg viewBox="0 0 160 100" aria-hidden="true" focusable="false">
      <rect x="14" y="10" width="132" height="80" class="outline-m" />
      <path d="M62 10V90M104 10V50M62 50H146" class="wall-m" />
      <rect x="64" y="12" width="38" height="36" class="room-m" />
      <circle cx="83" cy="30" r="4" fill="#ecd6b8" /><circle cx="83" cy="30" r="4" class="ping-m" fill="none" stroke="#d2b99a" stroke-width="1.5" />
    </svg>
  );
}
function AlertMini() {
  return (
    <svg viewBox="0 0 100 100" aria-hidden="true" focusable="false">
      <rect x="28" y="6" width="44" height="88" rx="9" class="outline-m" />
      <g class="banner-m"><rect x="32" y="14" width="36" height="22" rx="4" fill="#b4141c" /><rect x="36" y="20" width="22" height="3" rx="1.5" fill="#fff" /><rect x="36" y="27" width="14" height="3" rx="1.5" fill="rgba(255,255,255,0.7)" /></g>
      <rect x="36" y="76" width="28" height="8" rx="2" class="btn-m" />
    </svg>
  );
}

const STAGES = [
  { Mini: TagMini, title: 'The tag rings', text: 'Pulling the pin makes a small aluminum bar ring at about 13.3 kHz.' },
  { Mini: PhoneMini, title: 'A phone hears it', text: 'Only a clean, fading tone passes. Clinks and keys do not.' },
  { Mini: MapMini, title: 'The zone is named', text: 'Each phone knows its zone, so the alert says where.' },
  { Mini: AlertMini, title: 'Staff are alerted', text: 'A siren, the zone spoken aloud, and a full-screen alert.' },
] as const;

export function Stages() {
  const ref = useRef<HTMLDivElement>(null);
  const [run, setRun] = useState(0); // 0 = not started; changing the number replays
  useEffect(() => {
    const el = ref.current;
    if (!el || !('IntersectionObserver' in window)) { setRun(1); return; }
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) { setRun((n) => n || 1); io.disconnect(); } }, { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const replay = (): void => { unlockOutputs(); chime(); setRun((n) => n + 1); };
  return (
    <div>
      <div class="stages" ref={ref} data-run={run ? 'on' : 'off'} key={run}>
        {STAGES.map(({ Mini, title, text }, i) => (
          <Bezel key={title} class="stage" style={{ '--n': i }} tone={i === 3 ? 'amber' : i === 0 ? 'blue' : ''}>
            <div class="stage-art"><Mini /></div>
            <h3>{title}</h3>
            <p class="muted">{text}</p>
          </Bezel>
        ))}
      </div>
      <div class="actions"><button class="btn" onClick={replay}>Replay the sequence</button></div>
    </div>
  );
}
