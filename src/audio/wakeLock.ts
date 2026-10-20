/** Screen Wake Lock, re-acquired when the page becomes visible again. iOS stops the mic if the phone locks. */
let sentinel: WakeLockSentinel | null = null;
let wanted = false;

async function acquire(): Promise<void> {
  try {
    if (!wanted || !('wakeLock' in navigator) || sentinel) return;
    sentinel = await navigator.wakeLock.request('screen');
    sentinel.addEventListener('release', () => { sentinel = null; });
  } catch {
    sentinel = null;
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') void acquire();
});

export function keepAwake(): Promise<void> {
  wanted = true;
  return acquire();
}
export function allowSleep(): void {
  wanted = false;
  void sentinel?.release();
  sentinel = null;
}
export function wakeLockActive(): boolean {
  return sentinel !== null;
}
