import type { ComponentChildren } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/** Bottom sheet on phones, centered dialog on desktop. Escape or a tap outside closes it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.querySelector<HTMLElement>('input, button, [tabindex]')?.focus();
    const key = (e: KeyboardEvent): void => { if (e.key === 'Escape') onClose(); };
    addEventListener('keydown', key);
    return () => { removeEventListener('keydown', key); prev?.focus?.(); };
  }, []);
  return (
    <div class="scrim" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div class="sheet" role="dialog" aria-modal="true" aria-label={title} ref={ref}>
        <div class="sheet-grab" aria-hidden="true" />
        <h2>{title}</h2>
        {children}
      </div>
    </div>
  );
}
