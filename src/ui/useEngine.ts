import { useEffect, useState } from 'preact/hooks';
import { engine } from '../audio/engine.ts';

/** Re-render at most once per animation frame while the engine is emitting. */
export function useEngine(): typeof engine {
  const [, setTick] = useState(0);
  useEffect(() => {
    let queued = false;
    const unsub = engine.subscribe(() => {
      if (queued) return;
      queued = true;
      requestAnimationFrame(() => { queued = false; setTick((t) => t + 1); });
    });
    return unsub;
  }, []);
  return engine;
}
