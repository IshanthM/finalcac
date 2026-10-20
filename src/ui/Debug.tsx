import { useState } from 'preact/hooks';
import type { CapturedEvent, Snapshot } from '../audio/engine.ts';
import { keepAwake, wakeLockActive } from '../audio/wakeLock.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { saveWav } from '../audio/wavExport.ts';
import { PARAMS } from '../dsp/params.ts';
import { useEngine } from './useEngine.ts';
import { Spectrogram } from './Spectrogram.tsx';

const f1 = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : v > 0 ? '∞' : '—');
const stamp = (t: number): string => new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19);
const db = (v: number): string => (v <= -199 ? '—' : `${v.toFixed(1)} dB`);

function Level() {
  const e = useEngine();
  const dbfs = e.level.peak > 0 ? 20 * Math.log10(e.level.peak) : -120;
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  return (
    <div class="meter" role="meter" aria-label="Input level" aria-valuemin={-90} aria-valuemax={0} aria-valuenow={Math.round(dbfs)}>
      <div class="meter-fill" style={{ width: `${pct}%` }} />
      <span class="meter-text">{dbfs <= -119 ? '—' : `${dbfs.toFixed(0)} dBFS`}</span>
    </div>
  );
}

function EventCard({ ev }: { ev: CapturedEvent }) {
  const a = ev.analysis;
  const p = a.peak;
  return (
    <li class="card">
      <div class="card-head">{new Date(ev.at).toLocaleTimeString()} · {p ? `${f1(p.freqHz, 0)} Hz` : 'no peak'}</div>
      <dl class="kv">
        <dt>SNR</dt><dd>{f1(a.snrDb)} dB</dd>
        <dt>Guard margin</dt><dd>{p ? f1(p.guardMarginDb) : '—'} dB</dd>
        <dt>Click</dt><dd>{f1(a.clickMs)} ms</dd>
        <dt>Ring length</dt><dd>{f1(a.ringMs)} ms</dd>
        <dt>Decay τ</dt><dd>{f1(a.tauMs)} ms (−20 dB in {f1(a.decay20Ms)} ms, R² {f1(a.decayR2, 2)})</dd>
        <dt>Band at onset</dt><dd>{db(ev.onset.bandDb)} vs floor {db(ev.onset.floorDb)}</dd>
      </dl>
    </li>
  );
}

function SnapRow({ s }: { s: Snapshot }) {
  return (
    <li class="row">
      <span>{new Date(s.at).toLocaleTimeString()} · {(s.samples.length / s.sampleRate).toFixed(1)} s</span>
      <button class="btn" onClick={() => void saveWav(s.samples, s.sampleRate, `ring-${stamp(s.at)}.wav`)}>Download</button>
    </li>
  );
}

export function Debug() {
  const e = useEngine();
  const [busy, setBusy] = useState('');
  const { state, contextState, sampleRate, baseLatencyMs, trackSettings, error } = e.info;
  const running = state === 'running';

  const start = (): void => {
    unlockOutputs(); // first tap: unlock speech + audio session
    void keepAwake();
    void e.start();
  };
  const downloadLast = (): void => {
    const s = e.lastCapture(2);
    if (s) void saveWav(s, sampleRate, `last2s-${stamp(Date.now())}.wav`);
  };
  const record10 = async (): Promise<void> => {
    setBusy('Recording 10 s… ring the tag now');
    const s = await e.recordNext(10);
    setBusy('');
    await saveWav(s, sampleRate, `rec10s-${stamp(Date.now())}.wav`);
  };

  const last = e.events[0];
  return (
    <main class="page">
      <h1>Debug <small>Resonance v0.1</small></h1>
      <div class="actions">
        {!running && state !== 'suspended' && (
          <button class="btn btn-primary" onClick={start} disabled={state === 'starting'}>
            {state === 'starting' ? 'Starting…' : 'Start listening'}
          </button>
        )}
        {state === 'suspended' && <button class="btn btn-primary" onClick={() => void e.resume()}>Tap to resume mic</button>}
        {(running || state === 'suspended') && <button class="btn" onClick={() => e.stop()}>Stop</button>}
      </div>
      {error && <p class="error" role="alert">Mic error: {error}</p>}

      <Level />
      <Spectrogram />
      <p class="muted">8–16 kHz, own FFT of the ring buffer. White tick = onset. Dashed line = {PARAMS.nominalToneHz} Hz nominal.</p>

      <section aria-label="Live readout">
        <h2>Live</h2>
        <dl class="kv">
          <dt>In-band (9–15.5 kHz)</dt><dd>{db(e.detector?.bandDb ?? -200)} vs floor {db(e.detector?.floorDb ?? -200)}</dd>
          <dt>Onsets seen</dt><dd>{e.onsetCount}</dd>
          <dt>Peak</dt><dd>{last?.analysis.peak ? `${f1(last.analysis.peak.freqHz, 1)} Hz` : '—'}</dd>
          <dt>SNR</dt><dd>{last ? `${f1(last.analysis.snrDb)} dB` : '—'}</dd>
          <dt>Guard margin</dt><dd>{last?.analysis.peak ? `${f1(last.analysis.peak.guardMarginDb)} dB` : '—'}</dd>
          <dt>Decay τ</dt><dd>{last ? `${f1(last.analysis.tauMs)} ms` : '—'}</dd>
        </dl>
      </section>

      <section aria-label="Capture">
        <h2>Capture</h2>
        <div class="actions">
          <button class="btn" onClick={downloadLast} disabled={!running}>Download last 2 s (WAV)</button>
          <button class="btn" onClick={() => void record10()} disabled={!running || e.isRecording}>Record 10 s → WAV</button>
        </div>
        {busy && <p role="status" aria-live="polite">{busy}</p>}
        <h3>Onset snapshots <small>(0.5 s before → 1 s after)</small></h3>
        {e.snapshots.length === 0 ? <p class="muted">Ring the tag. Each onset is saved here.</p> : (
          <ul class="list">{e.snapshots.map((s) => <SnapRow s={s} key={s.id} />)}</ul>
        )}
      </section>

      <section aria-label="Events">
        <h2>Events</h2>
        {e.events.length === 0 ? <p class="muted">None yet.</p> : <ul class="list">{e.events.map((ev) => <EventCard ev={ev} key={ev.id} />)}</ul>}
      </section>

      <section aria-label="Audio settings">
        <h2>Audio</h2>
        <dl class="kv">
          <dt>State</dt><dd>{state} (context {contextState})</dd>
          <dt>Sample rate</dt><dd>{sampleRate ? `${sampleRate} Hz` : '—'}</dd>
          <dt>Base latency</dt><dd>{f1(baseLatencyMs, 1)} ms</dd>
          <dt>Wake lock</dt><dd>{wakeLockActive() ? 'held' : 'not held'}</dd>
        </dl>
        <h3>Track settings</h3>
        <pre class="pre">{trackSettings ? JSON.stringify(trackSettings, null, 2) : '—'}</pre>
      </section>
    </main>
  );
}
