import type { ComponentChildren, JSX } from 'preact';
import { useEffect, useRef } from 'preact/hooks';

/**
 * Heavy fade-up with a short blur resolve when the element enters the viewport (IntersectionObserver, once).
 * `i` staggers siblings by 70 ms steps. Collapses to static under prefers-reduced-motion (see .reveal in style.css).
 */
export function Reveal({ i = 0, as: Tag = 'div', class: cls = '', children, ...rest }: {
  i?: number; as?: keyof JSX.IntrinsicElements; class?: string; children?: ComponentChildren;
} & Record<string, unknown>) {
  const ref = useRef<HTMLElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!('IntersectionObserver' in window)) { el.classList.add('in'); return; }
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) if (e.isIntersecting) { e.target.classList.add('in'); io.unobserve(e.target); }
    }, { threshold: 0.12, rootMargin: '0px 0px -6% 0px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  const T = Tag as 'div';
  return <T ref={ref as never} class={`reveal ${cls}`} style={{ '--i': i }} {...(rest as object)}>{children}</T>;
}
