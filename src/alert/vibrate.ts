/** navigator.vibrate does nothing on iOS, so this is only an extra: every alert is also spoken and has a sound. */
export function vibrate(pattern: number | number[]): void {
  try { navigator.vibrate?.(pattern); } catch { /* unsupported */ }
}
export const ALERT_PATTERN = [400, 150, 400, 150, 800];
