/** The tag's ring drawn as a decaying waveform on a scope grid. Illustrative: real rings are measured at calibration. */
const W = 640;
const H = 220;
const MID = 110;
const AMP = 88;
const CYCLES = 34;
const DECAY = 4.4;

function build(): { wave: string; up: string; down: string } {
  const pts: string[] = [];
  const up: string[] = [];
  const down: string[] = [];
  for (let x = 16; x <= W - 16; x += 2) {
    const t = (x - 16) / (W - 32);
    const env = Math.exp(-t * DECAY);
    const y = MID - AMP * env * Math.sin(2 * Math.PI * CYCLES * t);
    const cmd = x === 16 ? 'M' : 'L';
    pts.push(`${cmd}${x} ${y.toFixed(1)}`);
    up.push(`${cmd}${x} ${(MID - AMP * env).toFixed(1)}`);
    down.push(`${cmd}${x} ${(MID + AMP * env).toFixed(1)}`);
  }
  return { wave: pts.join(''), up: up.join(''), down: down.join('') };
}
const PATHS = build();

export function RingTrace({ bare = false, replayKey = 0 }: { bare?: boolean; replayKey?: number }) {
  return (
    <svg key={replayKey} viewBox={`0 0 ${W} ${H}`} role="img" aria-label="A tag ring: a tone that starts loud and fades away" preserveAspectRatio="xMidYMid meet">
      {!bare && (
        <g>
          {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((i) => <line key={i} class="grid" x1={16 + i * 60.8} y1="14" x2={16 + i * 60.8} y2={H - 14} />)}
          {[30, 70, MID, 150, 190].map((y) => <line key={y} class={y === MID ? 'axis' : 'grid'} x1="16" y1={y} x2={W - 16} y2={y} />)}
          <path class="env" d={PATHS.up} /><path class="env" d={PATHS.down} />
        </g>
      )}
      {replayKey === -1
        ? <line class="axis" x1="16" y1={MID} x2={W - 16} y2={MID} />
        : <path class="wave" d={PATHS.wave} pathLength={1} />}
    </svg>
  );
}
