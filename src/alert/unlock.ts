/** One-time unlocks that iOS requires inside a user gesture. Call from the first tap. */
let unlocked = false;

export function unlockOutputs(): void {
  if (unlocked) return;
  unlocked = true;
  try {
    // Let WebAudio output play alongside the live mic (iOS 17+).
    const s = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
    if (s) s.type = 'play-and-record';
  } catch { /* unsupported */ }
  try {
    if ('speechSynthesis' in window) {
      const u = new SpeechSynthesisUtterance(' ');
      u.volume = 0;
      window.speechSynthesis.speak(u);
    }
  } catch { /* unsupported */ }
}
