/** Spoken alerts. iOS needs unlockOutputs() in an earlier tap. */
export function speak(text: string): void {
  try {
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.rate = 1;
    u.pitch = 1;
    u.volume = 1;
    window.speechSynthesis.speak(u);
  } catch { /* unsupported */ }
}

export function stopSpeaking(): void {
  try { window.speechSynthesis?.cancel(); } catch { /* unsupported */ }
}

/** "Fitting Room 2" → "Tamper in fitting room 2". */
export function tamperPhrase(zone: string): string {
  return `Tamper in ${zone.toLowerCase()}`;
}
