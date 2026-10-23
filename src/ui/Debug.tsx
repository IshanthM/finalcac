import { useState } from 'preact/hooks';
import type { CapturedEvent, Snapshot } from '../audio/engine.ts';
import { keepAwake, wakeLockActive } from '../audio/wakeLock.ts';
import { unlockOutputs } from '../alert/unlock.ts';
import { saveWav } from '../audio/wavExport.ts';
import { CAPTURE_LABELS, captureFilename, type CaptureLabel } from '../dsp/evaluation.ts';
import { PARAMS } from '../dsp/params.ts';
import { useEngine } from './useEngine.ts';
import { Spectrogram } from './Spectrogram.tsx';

const f1 = (v: number, d = 1): string => (Number.isFinite(v) ? v.toFixed(d) : v > 0 ? '∞' : 'n/a');
const stamp = (t: number): string => new Date(t).toISOString().replace(/[:.]/g, '-').slice(0, 19);
const db = (v: number): string => (v <= -199 ? 'n/a' : `${v.toFixed(1)} dB`);

function Level() {
  const e = useEngine();
  const dbfs = e.level.peak > 0 ? 20 * Math.log10(e.level.peak) : -120;
  const pct = Math.max(0, Math.min(100, ((dbfs + 90) / 90) * 100));
  return (
    <>
      <div class="meter debug-meter" role="meter" aria-label="Input level" aria-valuemin={-90} aria-valuemax={0} aria-valuenow={Math.round(dbfs)}>
        <div class="meter-fill" style={{ width: `${pct}%` }} />
      </div>
      <span class="meter-text">{dbfs <= -119 ? 'No signal' : `${dbfs.toFixed(0)} dBFS`}</span>
    </>
  );
}

function EventCard({ ev }: { ev: CapturedEvent }) {
  const a = ev.analysis;
  const p = a.peak;
  return (
    <li class="card">
      <div class="card-head">{new Date(ev.at).toLocaleTimeString()}, {p ? `${f1(p.freqHz, 0)} Hz` : 'no peak'}</div>
      <p class={ev.verdict.accepted ? 'verdict ok' : 'verdict no'}>
        {ev.verdict.accepted ? 'ACCEPTED as tag' : `Rejected: ${ev.verdict.failed.join(', ')}`}
      </p>
      <ul class="gates">
        {(['snr', 'guard', 'decay', 'tolerance'] as const).map((g) => (
          <li key={g} class={ev.verdict.gates[g].pass ? 'pass' : 'fail'}>{ev.verdict.gates[g].pass ? '✓' : '✗'} {ev.verdict.gates[g].text}</li>
        ))}
      </ul>
      <dl class="kv">
        <dt>SNR</dt><dd>{f1(a.snrDb)} dB</dd>
        <dt>Guard margin</dt><dd>{p ? f1(p.guardMarginDb) : 'n/a'} dB</dd>
        <dt>Click</dt><dd>{f1(a.clickMs)} ms</dd>
        <dt>Ring length</dt><dd>{f1(a.ringMs)} ms</dd>
        <dt>Decay τ</dt><dd>{f1(a.tauMs)} ms (−20 dB in {f1(a.decay20Ms)} ms, R² {f1(a.decayR2, 2)})</dd>
        <dt>Window used</dt><dd>{f1(a.windowMs)} ms after click skip</dd>
        <dt>Band at onset</dt><dd>{db(ev.onset.bandDb)} vs floor {db(ev.onset.floorDb)}</dd>
      </dl>
    </li>
  );
}

function SnapRow({ s }: { s: Snapshot }) {
  return (
    <li class="row">
      <span>{new Date(s.at).toLocaleTimeString()}, {(s.samples.length / s.sampleRate).toFixed(1)} s</span>
      <button class="btn" onClick={() => void saveWav(s.samples, s.sampleRate, `ring-${stamp(s.at)}.wav`)}>Download</button>
    </li>
  );
}

const LABEL_HELP: Record<CaptureLabel, string> = {
  strike: 'Tag struck (the ring we want)',
  noise: 'Room noise only, no tag',
  keys: 'Keys jingling',
  clap: 'Claps',
  music: 'Music playing',
  other: 'Other taps and sounds',
};

/**
 * The three browser audio "enhancements" must be OFF: echo cancellation, noise suppression and auto gain all
 * reshape the sound and can smear or delete a short 13 kHz ring. This shows what the browser actually gave us,
 * not what we asked for. iOS may not report a field, which is shown as "not reported", never as "off".
 */
function ProcessingStatus({ settings }: { settings: MediaTrackSettings | null }) {
  if (!settings) return <p class="muted">Audio processing: start listening to see what the browser actually applied.</p>;
  // echoCancellation can also be a string (Chrome reports 'all' or 'remote-only'), which still means processing is ON.
  const rows: [string, string | boolean | undefined][] = [
    ['Echo cancellation', settings.echoCancellation],
    ['Noise suppression', settings.noiseSuppression],
    ['Auto gain', settings.autoGainControl],
  ];
  const show = (v: string | boolean | undefined): string => (v === undefined ? 'not reported' : v === false ? 'off' : 'ON');
  const bad = rows.filter(([, v]) => v !== false);
  return (
    <>
      <dl class="kv">{rows.map(([k, v]) => <><dt key={k}>{k}</dt><dd>{show(v)}</dd></>)}</dl>
      {bad.length > 0 && <p class="error" role="status">{bad.map(([k]) => k).join(', ')} not confirmed off. Recordings made like this may not show the ring; note it with the results.</p>}
    </>
  );
}

/** Records a labelled clip and saves it with the label in the file name, so tools/analyze-folder.ts can score it. */
function SessionRecorder({ running, sampleRate, isRecording, record }: { running: boolean; sampleRate: number; isRecording: boolean; record: (s: number) => Promise<Float32Array> }) {
  const [label, setLabel] = useState<CaptureLabel>('strike');
  const [room, setRoom] = useState('quiet');
  const [distance, setDistance] = useState('d50');
  const [expected, setExpected] = useState(10);
  const [seconds, setSeconds] = useState(30);
  const [left, setLeft] = useState(0);
  const [saved, setSaved] = useState<string[]>([]);
  const isStrike = label === 'strike';

  const go = async (): Promise<void> => {
    setLeft(seconds);
    const tick = setInterval(() => setLeft((n) => Math.max(0, n - 1)), 1000);
    const samples = await record(seconds);
    clearInterval(tick);
    setLeft(0);
    const name = captureFilename({ label, room, distance: isStrike ? distance : 'dna', expected: isStrike ? expected : 0 }, stamp(Date.now()).replace(/[^0-9T]/g, '').replace('T', '-'));
    await saveWav(samples, sampleRate, name);
    setSaved((l) => [name, ...l].slice(0, 12));
  };

  return (
    <>
      <h3>Labelled recording</h3>
      <p class="muted">Pick what you are about to do, press Record, then do it. For a strike clip, strike the tag the number of times you enter, about a second apart. The file name carries the label.</p>
      <label class="field"><span>What are you recording</span>
        <select class="input" value={label} onChange={(e) => setLabel((e.currentTarget.value as CaptureLabel))}>
          {CAPTURE_LABELS.map((l) => <option value={l} key={l}>{LABEL_HELP[l]}</option>)}
        </select>
      </label>
      <label class="field"><span>Room</span>
        <select class="input" value={room} onChange={(e) => setRoom(e.currentTarget.value)}>
          <option value="quiet">Quiet</option>
          <option value="noisy">Noisy (TV, talking, fan)</option>
        </select>
      </label>
      {isStrike && (
        <>
          <label class="field"><span>Distance phone to tag</span>
            <select class="input" value={distance} onChange={(e) => setDistance(e.currentTarget.value)}>
              <option value="d10">About 10 cm</option>
              <option value="d50">About 50 cm</option>
              <option value="d100">About 1 m</option>
            </select>
          </label>
          <label class="field"><span>Number of strikes you will make</span>
            <input class="input" type="number" inputMode="numeric" min={1} max={60} value={expected} onInput={(e) => setExpected(Number(e.currentTarget.value))} />
          </label>
        </>
      )}
      <label class="field"><span>Length in seconds</span>
        <input class="input" type="number" inputMode="numeric" min={5} max={120} value={seconds} onInput={(e) => setSeconds(Number(e.currentTarget.value))} />
      </label>
      <div class="actions">
        <button class="btn btn-primary" onClick={() => void go()} disabled={!running || isRecording || !(seconds >= 5) || (isStrike && !(expected >= 1))}>
          {left > 0 ? `Recording… ${left} s left` : 'Record and save'}
        </button>
      </div>
      {!running && <p class="muted">Start listening first.</p>}
      {saved.length > 0 && (<><h3>Saved this session</h3><ul class="list">{saved.map((n) => <li class="row" key={n}><span>{n}</span></li>)}</ul></>)}
    </>
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
    <main class="content screen">
      <header class="screen-head"><div><h1 class="large">Debug recorder</h1></div><a class="btn btn-tint" href={import.meta.env.BASE_URL}>Back to the app</a></header>
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
      <p class="muted">8 to 16 kHz, own FFT of the ring buffer. White tick = onset. Dashed line = {PARAMS.nominalToneHz} Hz nominal.</p>

      <section aria-label="Live readout">
        <h2>Live</h2>
        <dl class="kv">
          <dt>In-band (9 to 15.5 kHz)</dt><dd>{db(e.detector?.bandDb ?? -200)} vs floor {db(e.detector?.floorDb ?? -200)}</dd>
          <dt>Onsets seen</dt><dd>{e.onsetCount}</dd>
          <dt>Peak</dt><dd>{last?.analysis.peak ? `${f1(last.analysis.peak.freqHz, 1)} Hz` : 'n/a'}</dd>
          <dt>SNR</dt><dd>{last ? `${f1(last.analysis.snrDb)} dB` : 'n/a'}</dd>
          <dt>Guard margin</dt><dd>{last?.analysis.peak ? `${f1(last.analysis.peak.guardMarginDb)} dB` : 'n/a'}</dd>
          <dt>Decay τ</dt><dd>{last ? `${f1(last.analysis.tauMs)} ms` : 'n/a'}</dd>
        </dl>
      </section>

      <section aria-label="Capture">
        <h2>Capture</h2>
        <SessionRecorder running={running} sampleRate={sampleRate} isRecording={e.isRecording} record={(n) => e.recordNext(n)} />
        <h3>Quick capture</h3>
        <div class="actions">
          <button class="btn" onClick={downloadLast} disabled={!running}>Download last 2 s (WAV)</button>
          <button class="btn" onClick={() => void record10()} disabled={!running || e.isRecording}>Record 10 s to WAV</button>
        </div>
        {busy && <p role="status" aria-live="polite">{busy}</p>}
        <h3>Onset snapshots <small>(0.5 s before to 1 s after)</small></h3>
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
          <dt>Sample rate</dt><dd>{sampleRate ? `${sampleRate} Hz` : 'n/a'}</dd>
          <dt>Base latency</dt><dd>{f1(baseLatencyMs, 1)} ms</dd>
          <dt>Wake lock</dt><dd>{wakeLockActive() ? 'held' : 'not held'}</dd>
        </dl>
        <h3>Audio processing the browser applied</h3>
        <ProcessingStatus settings={trackSettings} />
        <h3>Track settings</h3>
        <pre class="pre">{trackSettings ? JSON.stringify(trackSettings, null, 2) : 'n/a'}</pre>
      </section>
    </main>
  );
}
