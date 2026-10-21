/** Feeds the cursor position to the nearest .bz so its border can light up under a mouse. Fine pointers only; no scroll listeners. */
if (typeof matchMedia === 'function' && matchMedia('(hover: hover) and (pointer: fine)').matches) {
  let raf = 0;
  let last: PointerEvent | null = null;
  addEventListener('pointermove', (e) => {
    last = e;
    if (raf) return;
    raf = requestAnimationFrame(() => {
      raf = 0;
      const t = (last?.target as Element | null)?.closest?.('.bz') as HTMLElement | null;
      if (!t || !last) return;
      const r = t.getBoundingClientRect();
      t.style.setProperty('--mx', `${last.clientX - r.left}px`);
      t.style.setProperty('--my', `${last.clientY - r.top}px`);
    });
  }, { passive: true });
}
export {};
