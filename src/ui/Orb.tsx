import { useEffect, useRef } from 'preact/hooks';
import { engine } from '../audio/engine.ts';

/**
 * The resonance orb: concentric tan rings that swell with the live microphone level and ripple outward when a tag rings.
 * `live` ties it to the capture engine; otherwise it just breathes (used on the home screen).
 */
export function Orb({ live = false, on = true, small = false, pingKey = 0 }: { live?: boolean; on?: boolean; small?: boolean; pingKey?: number }) {
  const el = useRef<HTMLDivElement>(null);

  // An external trigger (e.g. tapping the home orb) ripples it too.
  useEffect(() => {
    if (!pingKey || !el.current) return;
    el.current.classList.remove('ping');
    void el.current.offsetWidth;
    el.current.classList.add('ping');
  }, [pingKey]);

  useEffect(() => {
    if (!live) return;
    let raf = 0;
    let smooth = 0;
    const tick = (): void => {
      raf = requestAnimationFrame(tick);
      const peak = engine.info.state === 'running' ? engine.level.peak : 0;
      const db = peak > 0 ? 20 * Math.log10(peak) : -90;
      const target = Math.max(0, Math.min(1, (db + 75) / 55));
      smooth += (target - smooth) * (target > smooth ? 0.5 : 0.12);
      el.current?.style.setProperty('--lvl', smooth.toFixed(3));
    };
    raf = requestAnimationFrame(tick);
    // A ring that passes the gates ripples the orb.
    const off = engine.onEvent((ev) => {
      if (!ev.verdict.accepted || !el.current) return;
      el.current.classList.remove('ping');
      void el.current.offsetWidth; // restart the animation
      el.current.classList.add('ping');
    });
    return () => { cancelAnimationFrame(raf); off(); };
  }, [live]);

  return (
    <div ref={el} class={`orb breathe ${on ? 'on' : ''} ${small ? 'sm' : ''}`} aria-hidden="true">
      <span class="orb-ring" /><span class="orb-ring" /><span class="orb-ring" />
      <span class="orb-ping" /><span class="orb-ping" />
      <span class="orb-core" />
    </div>
  );
}
