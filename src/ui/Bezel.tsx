import type { ComponentChildren } from 'preact';

/**
 * Double-bezel container: an outer shell (hairline + padding) holding an inner core with its own highlight.
 * Radii are concentric: shell 28 = core 22 + 6 padding.
 */
export function Bezel({ children, class: cls = '', tone = '', ticks = false, as: Tag = 'div', ...rest }: {
  children?: ComponentChildren; class?: string; tone?: '' | 'blue' | 'amber' | 'tan'; ticks?: boolean; as?: 'div' | 'section' | 'article' | 'li'; [k: string]: unknown;
}) {
  const T = Tag as 'div';
  return (
    <T class={`bz ${tone ? `tone-${tone}` : ''} ${ticks ? 'ticks' : ''} ${cls}`} {...(rest as object)}>
      <div class="bz-in">{children}</div>
    </T>
  );
}
