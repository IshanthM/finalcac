import { useEffect, useRef } from 'preact/hooks';

/**
 * An original CSS-3D model of the Resonance tag: a 6 mm aluminum standoff (46 mm long) held in two printed clips, with a tack pin.
 * Drag (or use the arrow keys) to turn it. Pulling the pin makes the tag ring: sound arcs spread from the standoff.
 */
const L = 300; // standoff length in px (46 mm)
const R = 20; // radius in px (6 mm diameter, drawn slightly heavier for legibility)
const FACETS = 28;
const CLIPS = [78, 222]; // centres along the standoff
const CLIP_W = 40;
const CLIP_H = 66;
const CLIP_D = 66;

function facetStyle(i: number): { transform: string; background: string } {
  const a = (360 / FACETS) * i;
  const h = (2 * Math.PI * R) / FACETS + 0.6;
  // Lambert-ish shading from the upper left, tinted cool to sit in the palette.
  const lit = Math.max(0, Math.cos(((a - 50) * Math.PI) / 180));
  const l = 26 + 52 * lit;
  return {
    transform: `translateY(-${h / 2}px) rotateX(${a}deg) translateZ(${R}px)`,
    background: `linear-gradient(90deg, rgba(255,255,255,0.18), transparent 7%, transparent 90%, rgba(0,0,0,0.3)), hsl(214 16% ${l.toFixed(1)}%)`,
  };
}

function Box({ w, h, d, x, y, cls = '' }: { w: number; h: number; d: number; x: number; y: number; cls?: string }) {
  const faces: [string, number, number, string][] = [
    [`translateZ(${d / 2}px)`, w, h, 'f'], [`rotateY(180deg) translateZ(${d / 2}px)`, w, h, 'b'],
    [`rotateY(90deg) translateZ(${w / 2}px)`, d, h, 'r'], [`rotateY(-90deg) translateZ(${w / 2}px)`, d, h, 'l'],
    [`rotateX(90deg) translateZ(${h / 2}px)`, w, d, 't'], [`rotateX(-90deg) translateZ(${h / 2}px)`, w, d, 'u'],
  ];
  return (
    <div class={`box ${cls}`} style={{ left: `${x - w / 2}px`, top: `${y - h / 2}px`, width: `${w}px`, height: `${h}px` }}>
      {faces.map(([t, fw, fh, k]) => <span key={k} class="face" style={{ width: `${fw}px`, height: `${fh}px`, left: `${(w - fw) / 2}px`, top: `${(h - fh) / 2}px`, transform: t }} />)}
    </div>
  );
}

export function TagModel({ pulled, onPull }: { pulled: boolean; onPull: () => void }) {
  const scene = useRef<HTMLDivElement>(null);
  const tag = useRef<HTMLDivElement>(null);
  const rot = useRef({ rx: -16, ry: -30 });
  const drag = useRef<{ x: number; y: number; moved: number } | null>(null);

  const apply = (): void => {
    tag.current?.style.setProperty('--rx', `${rot.current.rx}deg`);
    tag.current?.style.setProperty('--ry', `${rot.current.ry}deg`);
  };
  useEffect(apply, []);

  const down = (e: PointerEvent): void => {
    drag.current = { x: e.clientX, y: e.clientY, moved: 0 };
    scene.current?.classList.add('drag');
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent): void => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x, dy = e.clientY - d.y;
    d.x = e.clientX; d.y = e.clientY; d.moved += Math.abs(dx) + Math.abs(dy);
    rot.current.ry += dx * 0.5;
    rot.current.rx = Math.max(-55, Math.min(55, rot.current.rx - dy * 0.4));
    apply();
  };
  const up = (): void => { scene.current?.classList.remove('drag'); setTimeout(() => { drag.current = null; }, 0); };
  const key = (e: KeyboardEvent): void => {
    const step = 12;
    if (e.key === 'ArrowLeft') rot.current.ry -= step;
    else if (e.key === 'ArrowRight') rot.current.ry += step;
    else if (e.key === 'ArrowUp') rot.current.rx = Math.max(-55, rot.current.rx - step);
    else if (e.key === 'ArrowDown') rot.current.rx = Math.min(55, rot.current.rx + step);
    else return;
    e.preventDefault();
    apply();
  };

  return (
    <div
      ref={scene} class={`tagscene ${pulled ? 'pulled' : ''}`} tabIndex={0} role="img"
      aria-label="3D model of a Resonance tag: a six millimetre aluminum standoff held in two printed clips with a tack pin. Drag or use the arrow keys to turn it."
      onPointerDown={down} onPointerMove={move} onPointerUp={up} onPointerCancel={up} onKeyDown={key}
    >
      <span class="sound" aria-hidden="true"><i /><i /><i /></span>
      <div class="tag" ref={tag}>
        {Array.from({ length: FACETS }, (_, i) => <span class="facet" key={i} style={{ width: `${L}px`, ...facetStyle(i) }} />)}
        <span class="cap" style={{ left: `${-R}px` }} /><span class="cap" style={{ left: `${L - R}px` }} />
        {CLIPS.map((cx) => <Box key={cx} w={CLIP_W} h={CLIP_H} d={CLIP_D} x={cx} y={0} cls="clip" />)}
        <div class="pin" style={{ left: `${CLIPS[0]}px` }}>
          <span class="shaft" /><span class="shaft cross" />
          <span class="pin-head" aria-hidden="true" onClick={(e) => { e.stopPropagation(); if (!drag.current || drag.current.moved < 5) onPull(); }} />
        </div>
      </div>
    </div>
  );
}
