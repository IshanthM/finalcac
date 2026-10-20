/** One-time unlocks that iOS requires inside a user gesture. Call from the first tap. */
let unlocked = false;
let outCtx: AudioContext | null = null;

export function unlockOutputs(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    // Let WebAudio output play alongside the live mic (iOS 17+).
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s) s.type = 'play-and-record';
  } catch { /* unsupported */ }
  try {
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    outCtx = new AC();
    void outCtx.resume();
    // A 1-sample silent buffer inside the gesture fully unlocks output on older iOS.
    const src = outCtx.createBufferSource();
    src.buffer = outCtx.createBuffer(1, 1, outCtx.sampleRate);
    src.connect(outCtx.destination);
    src.start(0);
  } catch { /* unsupported */ }
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch { /* unsupported */ }
}

/** The output AudioContext (separate from the capture context), or null before the first tap. */
export function outputContext(): AudioContext | null {
  if (outCtx && outCtx.state === 'suspended') void outCtx.resume();
  return outCtx;
}
