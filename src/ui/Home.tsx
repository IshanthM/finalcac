import { go, useAppState } from '../state.ts';

export function Home() {
  const s = useAppState();
  const base = import.meta.env.BASE_URL;
  return (
    <main class="page">
      <h1>Resonance</h1>
      <p>Phones as a tamper-alarm network for a store. Listener phones hear a Resonance tag ring when its pin is pulled, and tell staff <em>where</em>.</p>
      <p class="muted">{s.profile ? `Tag profile: ${Math.round(s.profile.freqHz).toLocaleString('en-US')} Hz.` : 'No tag profile yet. Calibrate first.'}</p>
      <div class="actions">
        <button class="btn btn-primary" onClick={() => go('demo')}>Demo mode (one phone)</button>
        <button class="btn" onClick={() => go('calibrate')}>Calibrate tag</button>
        <a class="btn" href={`${base}?debug=1`}>Debug recorder</a>
      </div>
    </main>
  );
}
