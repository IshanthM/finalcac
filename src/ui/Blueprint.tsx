/** A drawn spec of the tag: standoff, two printed clips, tack pin, with dimension lines. Original artwork. */
export function Blueprint() {
  return (
    <svg class="blueprint" viewBox="0 0 640 230" role="img" aria-label="Spec drawing of the tag: a 46 millimetre long, 6 millimetre aluminum standoff held by two printed clips, with a tack pin through the left clip.">
      <defs>
        <linearGradient id="bp-al" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#dfe7f1" /><stop offset="0.45" stop-color="#8397b0" /><stop offset="1" stop-color="#2f4157" /></linearGradient>
        <marker id="bp-arrow" viewBox="0 0 8 8" refX="4" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0 0 8 4 0 8z" fill="#d2b99a" /></marker>
      </defs>
      <g class="bp-grid">{[0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((i) => <line key={i} x1={i * 53.3} y1="0" x2={i * 53.3} y2="230" />)}{[0, 1, 2, 3, 4, 5].map((i) => <line key={i} x1="0" y1={i * 46} x2="640" y2={i * 46} />)}</g>
      {/* standoff */}
      <rect x="96" y="96" width="448" height="38" rx="5" fill="url(#bp-al)" />
      <rect x="96" y="96" width="30" height="38" rx="5" class="bp-thread" /><rect x="514" y="96" width="30" height="38" rx="5" class="bp-thread" />
      {/* clips */}
      <rect x="168" y="78" width="56" height="74" rx="9" class="bp-clip" /><rect x="416" y="78" width="56" height="74" rx="9" class="bp-clip" />
      {/* pin */}
      <rect x="194" y="32" width="5" height="96" rx="2" fill="#d2b99a" /><ellipse cx="196.5" cy="32" rx="14" ry="5" fill="#ecd6b8" />
      {/* dimensions */}
      <line class="bp-dim" x1="96" y1="190" x2="544" y2="190" marker-start="url(#bp-arrow)" marker-end="url(#bp-arrow)" />
      <line class="bp-ext" x1="96" y1="140" x2="96" y2="196" /><line class="bp-ext" x1="544" y1="140" x2="544" y2="196" />
      <text x="320" y="214" text-anchor="middle" class="bp-text">46 mm</text>
      <line class="bp-dim" x1="592" y1="96" x2="592" y2="134" marker-start="url(#bp-arrow)" marker-end="url(#bp-arrow)" />
      <line class="bp-ext" x1="548" y1="96" x2="598" y2="96" /><line class="bp-ext" x1="548" y1="134" x2="598" y2="134" />
      <text x="612" y="120" class="bp-text">6</text>
      {/* callout markers */}
      {[['A', 320, 96, 320, 56], ['B', 444, 78, 444, 44], ['C', 196, 20, 250, 20]].map(([k, x1, y1, x2, y2]) => (
        <g key={String(k)}><line class="bp-lead" x1={x1 as number} y1={y1 as number} x2={x2 as number} y2={y2 as number} /><rect class="bp-mark" x={(x2 as number) - 11} y={(y2 as number) - 22 + (k === 'C' ? 12 : 0)} width="22" height="22" /><text class="bp-key" x={x2 as number} y={(y2 as number) - 6 + (k === 'C' ? 12 : 0)} text-anchor="middle">{k}</text></g>
      ))}
    </svg>
  );
}
